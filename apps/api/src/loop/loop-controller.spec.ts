import { describe, it, expect } from 'vitest';
import { evaluateLoop } from './loop-controller';

describe('evaluateLoop (bounded loop controller)', () => {
  it('allows a pass when there is a material change under the cap', () => {
    const decision = evaluateLoop({ loopCount: 0, materialChange: true });
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.nextLoopCount).toBe(1);
    }
  });

  it('refuses to loop without a material change', () => {
    const decision = evaluateLoop({ loopCount: 0, materialChange: false });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.stopReason).toBe('no_material_change');
    }
  });

  it('stops at the hard cap of three passes even with a material change', () => {
    const decision = evaluateLoop({ loopCount: 3, materialChange: true });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.stopReason).toBe('max_loop_reached');
    }
  });

  it('allows the third pass at the boundary (loopCount 2)', () => {
    const decision = evaluateLoop({ loopCount: 2, materialChange: true });
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.nextLoopCount).toBe(3);
    }
  });

  it('rejects a forbidden loop request before any other check', () => {
    const decision = evaluateLoop({
      loopCount: 0,
      materialChange: true,
      forbidden: true,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.forbidden).toBe(true);
      expect(decision.stopReason).toBe('forbidden_loop_request');
    }
  });
});
