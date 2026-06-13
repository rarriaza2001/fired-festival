import { describe, it, expect, vi } from 'vitest';
import type { ErrorType } from '@dgb/shared';
import { AlarmService } from './alarm.service';
import type { PrismaService } from '../persistence/prisma.service';
import type { TraceService } from '../trace/trace.service';

function makeService() {
  const create = vi.fn().mockResolvedValue({});
  const emit = vi.fn().mockResolvedValue({});
  const prisma = { alarm: { create } } as unknown as PrismaService;
  const trace = { emit } as unknown as TraceService;
  return { svc: new AlarmService(prisma, trace), prisma, create, emit };
}

describe('AlarmService.raise', () => {
  it('persists and emits a structured alarm with severity + recommended action', async () => {
    const { svc, create, emit } = makeService();

    const alarm = await svc.raise('run1', 'tool_error', {
      message: 'external check failed',
      stage: 'evidence_assessment',
      reviewState: 'review_in_progress',
      context: { statement: 'revenue grew 40%' },
    });

    expect(alarm).not.toBeNull();
    expect(alarm?.type).toBe('tool_error');
    expect(alarm?.severity).toBe('recoverable');
    expect(alarm?.recommended_action.length).toBeGreaterThan(0);

    expect(create).toHaveBeenCalledOnce();
    const emitted = emit.mock.calls[0]?.[1];
    expect(emitted.event_name).toBe('alarm_raised');
    expect(emitted.error_type).toBe('tool_error');
    expect(emitted.error_severity).toBe('recoverable');
    expect(emitted.visibility).toBe('user_visible');
    expect(emitted.details.recommended_action.length).toBeGreaterThan(0);
  });

  it('is fail-safe: returns null and never throws when persistence fails', async () => {
    const { svc, prisma, emit } = makeService();
    (prisma.alarm.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('db down'),
    );

    const alarm = await svc.raise('run1', 'unknown_error', { message: 'boom' });

    expect(alarm).toBeNull();
    expect(emit).not.toHaveBeenCalled(); // persist throws before the trace emit
  });

  it('returns null for an undeclared alarm type without throwing', async () => {
    const { svc, create } = makeService();
    const alarm = await svc.raise('run1', 'artifact_mismatch' as ErrorType, {
      message: 'not a declared alarm',
    });
    expect(alarm).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});
