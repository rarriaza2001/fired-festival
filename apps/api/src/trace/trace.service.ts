import { Injectable, Optional, type OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Subject, concat, from, type Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import {
  traceEventSchema,
  TRACE_SCHEMA_VERSION,
  type TraceEvent,
  type TraceEmit,
} from '@dgb/shared';
import { PrismaService } from '../persistence/prisma.service';
import { JsonLogger } from '../logger/json-logger';
import { TelemetryService } from '../telemetry/telemetry.service';
import { traceRowToEvent } from './trace-row';

/**
 * Phase 8 — single emit path for the phase8.v1 trace spine. Every event is:
 *   1. completed (run_id / event_id / timestamp / schema_version) + validated,
 *   2. persisted to the TraceEvent table (durable, replayable),
 *   3. logged as a structured JSON line,
 *   4. pushed to the run's live stream (SSE source).
 * The trace records outcomes and reasons only — never prompts, raw sources,
 * chain-of-thought, or BYOK keys.
 */
@Injectable()
export class TraceService implements OnModuleDestroy {
  private readonly streams = new Map<string, Subject<TraceEvent>>();
  // Runs whose live stream has ended (completed, failed, or torn down on a
  // persist error). A later subscriber for one of these must get a replay-only
  // stream that completes, not a fresh Subject that would hang forever.
  private readonly terminated = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: JsonLogger,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /** Live event stream for a run. Persisted rows cover any pre-subscribe gap. */
  stream(runId: string): Observable<TraceEvent> {
    return this.getOrCreate(runId).asObservable();
  }

  /**
   * Replay-then-live stream for SSE subscribers. Persisted rows are replayed in
   * order first (covering the gap before subscribe), then the live stream is
   * concatenated with already-seen events filtered out. If the run already
   * reached a terminal event, only the persisted rows are returned (the live
   * Subject would never complete, hanging the SSE connection open).
   */
  async eventStream(runId: string): Promise<Observable<TraceEvent>> {
    const rows = await this.prisma.traceEvent.findMany({
      where: { runId },
      orderBy: { id: 'asc' },
    });
    const persisted = rows.map(traceRowToEvent);
    const isTerminal =
      this.terminated.has(runId) ||
      persisted.some(
        (e) => e.event_name === 'run_completed' || e.event_name === 'run_failed',
      );
    if (isTerminal) {
      return from(persisted);
    }
    const seen = new Set(persisted.map((e) => e.event_id));
    const live = this.getOrCreate(runId)
      .asObservable()
      .pipe(filter((e) => !seen.has(e.event_id)));
    return concat(from(persisted), live);
  }

  /** Emit one trace event: validate → persist → log → stream. */
  async emit(runId: string, emit: TraceEmit): Promise<TraceEvent> {
    const event = traceEventSchema.parse({
      ...emit,
      run_id: runId,
      event_id: randomUUID(),
      timestamp: new Date().toISOString(),
      schema_version: TRACE_SCHEMA_VERSION,
    });

    try {
      await this.persist(event);
    } catch (error: unknown) {
      // A persistence failure must not leave subscribers hanging: surface it
      // on the stream and tear the stream down, then re-throw to the caller.
      const subject = this.streams.get(runId);
      if (subject) {
        subject.error(error);
        this.streams.delete(runId);
      }
      this.terminated.add(runId);
      throw error;
    }

    this.logEvent(event);
    this.getOrCreate(runId).next(event);
    // Additive, fail-safe OTel bridge (no-op when telemetry disabled/absent).
    this.telemetry?.onTraceEvent(event);

    if (event.event_name === 'run_completed' || event.event_name === 'run_failed') {
      this.close(runId);
    }
    return event;
  }

  /** Complete every open stream on shutdown so no Subject leaks. */
  onModuleDestroy(): void {
    for (const subject of this.streams.values()) {
      subject.complete();
    }
    this.streams.clear();
  }

  private async persist(event: TraceEvent): Promise<void> {
    await this.prisma.traceEvent.create({
      data: {
        eventId: event.event_id,
        schemaVersion: event.schema_version,
        runId: event.run_id,
        parentEventId: event.parent_event_id,
        eventName: event.event_name,
        timestamp: event.timestamp,
        stage: event.stage,
        reviewState: event.review_state,
        terminalState: event.terminal_state,
        durationMs: event.duration_ms,
        costUsd: event.cost_usd,
        model: event.model,
        toolName: event.tool_name,
        searchDepth: event.search_depth,
        loopCount: event.loop_count,
        guardrailCategory: event.guardrail_category,
        confidenceBefore: event.confidence_before,
        confidenceAfter: event.confidence_after,
        evalResult: event.eval_result,
        errorType: event.error_type,
        errorSeverity: event.error_severity,
        stopReason: event.stop_reason,
        details: JSON.stringify(event.details),
        visibility: event.visibility,
      },
    });
  }

  private logEvent(event: TraceEvent): void {
    this.logger.event('info', 'trace_event', {
      run_id: event.run_id,
      event_id: event.event_id,
      event_name: event.event_name,
      stage: event.stage,
      review_state: event.review_state,
      visibility: event.visibility,
    });
  }

  private getOrCreate(runId: string): Subject<TraceEvent> {
    const existing = this.streams.get(runId);
    if (existing) return existing;
    const subject = new Subject<TraceEvent>();
    this.streams.set(runId, subject);
    return subject;
  }

  private close(runId: string): void {
    this.terminated.add(runId);
    const subject = this.streams.get(runId);
    if (!subject) return;
    subject.complete();
    this.streams.delete(runId);
  }
}
