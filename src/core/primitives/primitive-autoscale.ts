import type { AutoscaleInfo } from './primitive-api.js';

export interface NormalizedAutoscaleInfo {
    readonly min: number;
    readonly max: number;
    readonly above: number;
    readonly below: number;
}

export function normalizeAutoscaleInfo(info: AutoscaleInfo | null): NormalizedAutoscaleInfo | null {
    if (info === null || typeof info !== 'object'
        || info.priceRange === null || typeof info.priceRange !== 'object') return null;
    const first = info.priceRange.min;
    const last = info.priceRange.max;
    if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
    return Object.freeze({
        min: Math.min(first, last),
        max: Math.max(first, last),
        above: nonNegative(info.margins?.above),
        below: nonNegative(info.margins?.below),
    });
}

export function applyAutoscalePixelMargins(
    min: number,
    max: number,
    above: number,
    below: number,
    plotHeight: number,
): { min: number; max: number } {
    if (!(max > min) || !(plotHeight > 0)) return { min, max };
    const limit = plotHeight * 0.45;
    const top = Math.min(limit, nonNegative(above));
    const bottom = Math.min(limit, nonNegative(below));
    const available = plotHeight - top - bottom;
    if (available <= plotHeight * 0.05) return { min, max };
    const span = max - min;
    return {
        min: min - span * bottom / available,
        max: max + span * top / available,
    };
}

function nonNegative(value: number | undefined): number {
    return value === undefined || !Number.isFinite(value) ? 0 : Math.max(0, value);
}
