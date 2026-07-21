export interface TimedSeriesLike {
    kind: string;
    data: ReadonlyArray<{ time: number }>;
}

/**
 * Infer the pixel width of one dense time slot. Sparse overlays (Fractals,
 * ZigZag, trade signals) must never make the underlying candle slots wider.
 */
export function calculateBarStepPx(
    series: ReadonlyArray<TimedSeriesLike>,
    visibleTimeSpan: number,
    plotWidth: number,
    fallback = 6,
): number {
    if (!(visibleTimeSpan > 0) || !(plotWidth > 0)) return fallback;

    let densest = Infinity;
    for (const item of series) {
        if (item.kind === 'VolumeProfile' || item.data.length < 2) continue;
        const first = item.data[0].time;
        const last = item.data[item.data.length - 1].time;
        if (!Number.isFinite(first) || !Number.isFinite(last)) continue;
        const timeStep = (last - first) / (item.data.length - 1);
        const pixels = (timeStep / visibleTimeSpan) * plotWidth;
        if (Number.isFinite(pixels) && pixels > 0) densest = Math.min(densest, pixels);
    }
    return Number.isFinite(densest) ? densest : fallback;
}
