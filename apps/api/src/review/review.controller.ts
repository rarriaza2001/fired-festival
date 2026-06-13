import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { from, type Observable } from 'rxjs';
import { filter, map, mergeMap } from 'rxjs/operators';
import {
  contextItemSchema,
  defaultModelForProvider,
  reviewInputSchema,
  reviewOutputSchema,
  type ContextItem,
  
  type ReviewOutput,
} from '@dgb/shared';
import { z } from 'zod';
import { ok, type ApiResponse } from '../common/api-response';
import { PrismaService } from '../persistence/prisma.service';
import { TraceService } from '../trace/trace.service';
import { ReviewOrchestrator } from './review-orchestrator.service';
import type { Byok } from '../llm/llm.types';
import {
  resolveProvider,
  resolveServerApiKey,
} from '../config/provider-credentials';

/** Upper bound on the history list — keeps the home page replay list cheap. */
const MAX_LIST = 50;

/** Characters of the submitted decision shown as a preview in the history list. */
const PREVIEW_LENGTH = 140;

interface StartReviewData {
  readonly runId: string;
}

interface CheckpointSummary {
  readonly seq: number;
  readonly action: string;
  readonly createdAt: string;
}

/** Replay request body — which checkpoint seq to resume the run forward from. */
const replayBodySchema = z.object({ fromSeq: z.number().int().positive() });

interface ReviewSummaryData {
  readonly runId: string;
  readonly createdAt: string;
  readonly inputPreview: string;
  readonly terminalState: string | null;
  readonly mode: string | null;
  readonly confidence: string | null;
}

interface ReviewResultData {
  readonly runId: string;
  readonly reviewState: string;
  readonly terminalState: string | null;
  readonly mode: string | null;
  readonly output: ReviewOutput | null;
  // The original submission, so the client can carry the decision forward into
  // a follow-up review (added context / clarification) without leaving the page.
  readonly inputText: string;
  readonly contextItems: readonly ContextItem[];
}

function resolveModel(provider: ReturnType<typeof resolveProvider>, model: string | undefined): string {
  return model?.trim() || defaultModelForProvider(provider);
}

/**
 * Re-validate persisted output before returning it. outputJson was written via
 * reviewOutputSchema.parse, but the column is a raw String — re-validating on
 * read guarantees the client never receives a malformed/edited shape.
 */
function parseStoredOutput(outputJson: string | null): ReviewOutput | null {
  if (!outputJson) return null;
  try {
    const result = reviewOutputSchema.safeParse(JSON.parse(outputJson));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Re-validate persisted context items before returning them. contextItems was
 * written via JSON.stringify of the parsed input array; re-parsing on read keeps
 * the client contract honest and tolerates legacy/malformed rows.
 */
function parseStoredContextItems(contextJson: string | null): ContextItem[] {
  if (!contextJson) return [];
  try {
    const result = z.array(contextItemSchema).safeParse(JSON.parse(contextJson));
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

/** Collapse whitespace and truncate the decision text for the history list. */
function toPreview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH)}…` : flat;
}

@Controller('reviews')
export class ReviewController {
  constructor(
    private readonly orchestrator: ReviewOrchestrator,
    private readonly prisma: PrismaService,
    private readonly trace: TraceService,
  ) {}

  /** Build the in-memory provider descriptor; API key comes from server env. */
  private providerFromHeaders(
    providerName: string | undefined,
    providerModel: string | undefined,
  ): Byok {
    const provider = resolveProvider(providerName);
    return {
      providerName: provider,
      apiKey: resolveServerApiKey(provider),
      model: resolveModel(provider, providerModel),
    };
  }

  /**
   * Start a review. Provider + model arrive in headers; the API key is loaded
   * from server env. Returns the runId immediately; the spine runs detached.
   */
  @Post()
  async start(
    @Body() body: unknown,
    @Headers('x-provider-name') providerName: string | undefined,
    @Headers('x-provider-model') providerModel: string | undefined,
  ): Promise<ApiResponse<StartReviewData>> {
    const parsed = reviewInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid review input: a non-empty "text" field is required.');
    }
    const byok = this.providerFromHeaders(providerName, providerModel);

    const runId = randomUUID();
    await this.prisma.review.create({
      data: {
        id: runId,
        inputText: parsed.data.text,
        contextItems: JSON.stringify(parsed.data.context_items),
        reviewState: 'raw_input_received',
      },
    });

    // Detached: the request returns now; the client subscribes to the stream.
    void this.orchestrator.run(runId, parsed.data, byok);

    return ok({ runId });
  }

  /**
   * Recent reviews, newest first — the basis for the home page replay list.
   * Bounded to MAX_LIST. Declared before `:id` so it never shadows that route.
   */
  @Get()
  async list(): Promise<ApiResponse<readonly ReviewSummaryData[]>> {
    const reviews = await this.prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      take: MAX_LIST,
    });
    const summaries = reviews.map((review) => ({
      runId: review.id,
      createdAt: review.createdAt.toISOString(),
      inputPreview: toPreview(review.inputText),
      terminalState: review.terminalState,
      mode: review.mode,
      confidence: parseStoredOutput(review.outputJson)?.confidence.label ?? null,
    }));
    return ok(summaries);
  }

  /** Server-Sent Events: replays persisted user-visible events, then streams live. */
  @Sse(':id/stream')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    return from(this.trace.eventStream(id)).pipe(
      mergeMap((events$) => events$),
      filter((event) => event.visibility === 'user_visible'),
      // No `type` field: keep these as default "message" events so the browser
      // EventSource.onmessage handler receives every one (event_name is in data).
      map((event) => ({ data: event, id: event.event_id })),
    );
  }

  /** Final review result (also the basis for replay). */
  @Get(':id')
  async result(@Param('id') id: string): Promise<ApiResponse<ReviewResultData>> {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) {
      throw new NotFoundException(`Review not found: ${id}`);
    }
    return ok({
      runId: id,
      reviewState: review.reviewState,
      terminalState: review.terminalState,
      mode: review.mode,
      output: parseStoredOutput(review.outputJson),
      inputText: review.inputText,
      contextItems: parseStoredContextItems(review.contextItems),
    });
  }

  /** Checkpoints captured for a run — the seqs a replay can resume forward from. */
  @Get(':id/checkpoints')
  async checkpoints(
    @Param('id') id: string,
  ): Promise<ApiResponse<readonly CheckpointSummary[]>> {
    const rows = await this.prisma.checkpoint.findMany({
      where: { runId: id },
      orderBy: { seq: 'asc' },
    });
    return ok(
      rows.map((row) => ({
        seq: row.seq,
        action: row.action,
        createdAt: row.createdAt.toISOString(),
      })),
    );
  }

  /**
   * Replay a run forward from a checkpoint without re-running the prior stages.
   * Detached like start(): validates the run + checkpoint exist, kicks off the
   * resumed loop, and returns the runId. The BYOK key arrives per request and is
   * never persisted. The resumed loop streams via the same SSE endpoint.
   * Provider key is loaded from server env.
   */
  @Post(':id/replay')
  async replay(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('x-provider-name') providerName: string | undefined,
    @Headers('x-provider-model') providerModel: string | undefined,
  ): Promise<ApiResponse<StartReviewData>> {
    const parsed = replayBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'Invalid replay body: a positive integer "fromSeq" is required.',
      );
    }

    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) {
      throw new NotFoundException(`Review not found: ${id}`);
    }
    const checkpoint = await this.prisma.checkpoint.findUnique({
      where: { runId_seq: { runId: id, seq: parsed.data.fromSeq } },
    });
    if (!checkpoint) {
      throw new NotFoundException(`No checkpoint ${parsed.data.fromSeq} for run ${id}.`);
    }

    const byok = this.providerFromHeaders(providerName, providerModel);
    void this.orchestrator.replay(id, parsed.data.fromSeq, byok);

    return ok({ runId: id });
  }
}
