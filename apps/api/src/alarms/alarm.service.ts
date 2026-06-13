import { Injectable } from '@nestjs/common';
import {
  alarmSchema,
  type Alarm,
  type ErrorType,
  type ReviewState,
  type WorkflowStage,
} from '@dgb/shared';
import { PrismaService } from '../persistence/prisma.service';
import { TraceService } from '../trace/trace.service';
import { alarmEntry } from './alarm-registry';

/** What the caller supplies; severity + recommended_action come from the registry. */
export interface RaiseAlarmParams {
  readonly message: string;
  readonly stage?: WorkflowStage | null;
  readonly reviewState?: ReviewState | null;
  readonly context?: Record<string, unknown>;
}

/**
 * Alarms pillar — fires a structured alarm when something goes wrong.
 *
 * `raise` resolves the declared registry entry for the type (severity +
 * recommended action), validates the full alarm, persists it to the Alarm
 * table, and emits an `alarm_raised` trace event (carrying error_type +
 * error_severity columns + the recommended action in details).
 *
 * Fully fail-safe: an alarm must never break a run, so the whole body is guarded
 * and returns null on any failure (mirrors `safeRecordMetrics`).
 */
@Injectable()
export class AlarmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trace: TraceService,
  ) {}

  async raise(
    runId: string,
    type: ErrorType,
    params: RaiseAlarmParams,
  ): Promise<Alarm | null> {
    try {
      const entry = alarmEntry(type);
      const alarm = alarmSchema.parse({
        type,
        severity: entry.severity,
        stage: params.stage ?? null,
        message: params.message,
        recommended_action: entry.recommended_action,
        context: params.context ?? {},
      });

      await this.prisma.alarm.create({
        data: {
          runId,
          type: alarm.type,
          severity: alarm.severity,
          category: entry.category,
          recommendedAction: alarm.recommended_action,
          message: alarm.message,
          context: JSON.stringify(alarm.context),
        },
      });

      await this.trace.emit(runId, {
        event_name: 'alarm_raised',
        stage: alarm.stage,
        review_state: params.reviewState ?? null,
        error_type: alarm.type,
        error_severity: alarm.severity,
        details: {
          category: entry.category,
          message: alarm.message,
          recommended_action: alarm.recommended_action,
          context: alarm.context,
        },
        visibility: 'user_visible',
      });

      return alarm;
    } catch {
      // Deliberate: a failed alarm must not fail the run it is reporting on.
      return null;
    }
  }
}
