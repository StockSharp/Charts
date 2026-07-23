export interface IndicatorStyleSeries {
    options?(): object;
    applyOptions?(options: object): void;
}

export interface IndicatorStyleOwner {
    readonly type?: string;
    readonly seriesRefs?: readonly IndicatorStyleSeries[];
    readonly styleSources?: Readonly<Record<string, IndicatorStyleSeries>>;
    readonly outputNames?: readonly string[];
    readonly legendSources?: Readonly<Record<string, {
        readonly series?: IndicatorStyleSeries;
        readonly field?: string;
        readonly colorOption?: string;
    }>>;
    colors?: string[];
}

/** Returns painter-owned visual options only; runtime ids and scale routing stay transient. */
export function captureIndicatorStyles(
    entry: IndicatorStyleOwner,
): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {};
    for (const [styleId, series] of styleSources(entry)) {
        if (typeof series?.options !== 'function') continue;
        const raw = series.options();
        if (!plainObject(raw))
            throw new TypeError(`sschart: indicator style '${styleId}' options must be an object`);
        const { id: _id, persist: _persist, priceScaleId: _priceScaleId, ...options } = raw;
        result[styleId] = options;
    }
    return result;
}

/** Applies styles by semantic painter key and reports keys unavailable in this painter version. */
export function applyIndicatorStyles(
    entry: IndicatorStyleOwner,
    styles: Readonly<Record<string, unknown>>,
): readonly string[] {
    if (!plainObject(styles))
        throw new TypeError('sschart: indicator styles must be an object');
    const sources = new Map(styleSources(entry));
    const skipped: string[] = [];
    for (const [styleId, raw] of Object.entries(styles)) {
        const series = sources.get(styleId);
        if (series === undefined || typeof series.applyOptions !== 'function') {
            skipped.push(styleId);
            continue;
        }
        if (!plainObject(raw))
            throw new TypeError(`sschart: indicator style '${styleId}' must be an object`);
        const { id: _id, persist: _persist, priceScaleId: _priceScaleId, ...options } = raw;
        series.applyOptions(options);
    }
    refreshIndicatorLegendColors(entry);
    return Object.freeze(skipped);
}

export function refreshIndicatorLegendColors(entry: IndicatorStyleOwner): void {
    const outputs = entry.outputNames || [];
    if (outputs.length === 0) return;
    const previous = entry.colors || [];
    entry.colors = outputs.map((outputId, index) => {
        const source = entry.legendSources?.[outputId];
        const raw = source?.series?.options?.();
        if (!plainObject(raw)) return previous[index] || '#d0d6de';
        const key = source?.colorOption
            || (source?.field === 'upper' ? 'upperColor'
                : source?.field === 'lower' ? 'lowerColor' : 'color');
        const color = raw[key] ?? raw.color ?? raw.lineColor ?? raw.topColor;
        return typeof color === 'string' ? color : (previous[index] || '#d0d6de');
    });
}

function styleSources(entry: IndicatorStyleOwner): Array<[string, IndicatorStyleSeries]> {
    const declared = entry.styleSources;
    if (declared !== undefined && Object.keys(declared).length > 0)
        return Object.entries(declared);
    return (entry.seriesRefs || []).map((series, index) => [`series-${index}`, series]);
}

function plainObject(value: unknown): value is Readonly<Record<string, unknown>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
