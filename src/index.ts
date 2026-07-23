// Canonical module entrypoint. New consumers import from this module; the
// historical `sschart.ts` path remains a compatibility facade during the
// architecture migration.
export * from './core/chart-api.js';
export * from './primitives/horizontal-line.js';
export * from './primitives/trend-line.js';
