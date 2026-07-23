// Canonical module entrypoint. New consumers import from this module; the
// historical `sschart.ts` path remains a compatibility facade during the
// architecture migration.
export * from './core/chart-api.js';
export * from './primitives/horizontal-line.js';
export * from './primitives/trend-line.js';
export * from './primitives/session-shading.js';
export * from './data/index.js';
export * from './time/index.js';
export * from './indicators/index.js';
export * from './drawings/index.js';
export * from './persistence/index.js';
export * from './workspace/index.js';
export * from './orderflow/index.js';
