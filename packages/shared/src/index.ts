// @dgb/shared — single source of truth.
// Frozen constants (Phases 2-8) + Zod schemas derived from the phase8.v1
// trace model. Imported by @dgb/api (workflow, trace, eval, persistence) and
// @dgb/web (trace/review rendering).
export * from './constants/index.js';
export * from './schemas/index.js';
