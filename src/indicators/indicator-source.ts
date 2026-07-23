export const IndicatorSourceKind = Object.freeze({
    Candles: 'candles',
    CandleField: 'candle-field',
    IndicatorOutput: 'indicator-output',
} as const);
export type IndicatorSourceKind = typeof IndicatorSourceKind[keyof typeof IndicatorSourceKind];

export const IndicatorCandleField = Object.freeze({
    Open: 'open',
    High: 'high',
    Low: 'low',
    Close: 'close',
    Median: 'hl2',
    Typical: 'hlc3',
    Average: 'ohlc4',
    Volume: 'volume',
} as const);
export type IndicatorCandleField = typeof IndicatorCandleField[keyof typeof IndicatorCandleField];

export interface IndicatorCandlesSource {
    /** Full OHLCV candle input; scalar definitions receive its close field. */
    readonly kind: typeof IndicatorSourceKind.Candles;
}

export interface IndicatorCandleFieldSource {
    /** The selected scalar is lifted to O=H=L=C for candlestick-input definitions. */
    readonly kind: typeof IndicatorSourceKind.CandleField;
    readonly field: IndicatorCandleField;
}

/**
 * Uses finite samples from one output on their rendered timestamps. Missing
 * sparse samples are skipped. `indicatorId` is the stable persistence id.
 */
export interface IndicatorOutputSource {
    readonly kind: typeof IndicatorSourceKind.IndicatorOutput;
    readonly indicatorId: string;
    readonly outputId: string;
}

export type IndicatorSource = IndicatorCandlesSource
    | IndicatorCandleFieldSource
    | IndicatorOutputSource;

export const IndicatorSourceStatusReason = Object.freeze({
    Ready: 'ready',
    MissingIndicator: 'missing-indicator',
    MissingOutput: 'missing-output',
    UpstreamUnavailable: 'upstream-unavailable',
    Error: 'error',
} as const);
export type IndicatorSourceStatusReason = typeof IndicatorSourceStatusReason[
    keyof typeof IndicatorSourceStatusReason
];

export interface IndicatorSourceStatus {
    readonly source: IndicatorSource;
    readonly available: boolean;
    readonly reason: IndicatorSourceStatusReason;
}

export const DefaultIndicatorSource: IndicatorCandlesSource = Object.freeze({
    kind: IndicatorSourceKind.Candles,
});

const FIELDS = new Set<IndicatorCandleField>(Object.values(IndicatorCandleField));

/** Validates, clones and freezes an editor/persistence supplied source binding. */
export function normalizeIndicatorSource(value: unknown): IndicatorSource {
    const source = record(value);
    if (source.kind === IndicatorSourceKind.Candles) {
        exactKeys(source, ['kind']);
        return DefaultIndicatorSource;
    }
    if (source.kind === IndicatorSourceKind.CandleField) {
        exactKeys(source, ['kind', 'field']);
        if (!FIELDS.has(source.field as IndicatorCandleField))
            throw new RangeError('sschart: indicator candle source field is invalid');
        return Object.freeze({
            kind: IndicatorSourceKind.CandleField,
            field: source.field as IndicatorCandleField,
        });
    }
    if (source.kind === IndicatorSourceKind.IndicatorOutput) {
        exactKeys(source, ['kind', 'indicatorId', 'outputId']);
        return Object.freeze({
            kind: IndicatorSourceKind.IndicatorOutput,
            indicatorId: identifier(source.indicatorId, 'indicator source indicatorId'),
            outputId: identifier(source.outputId, 'indicator source outputId'),
        });
    }
    throw new RangeError('sschart: indicator source kind is invalid');
}

export function indicatorSourcesEqual(left: IndicatorSource, right: IndicatorSource): boolean {
    if (left.kind !== right.kind) return false;
    if (left.kind === IndicatorSourceKind.Candles) return true;
    if (left.kind === IndicatorSourceKind.CandleField
        && right.kind === IndicatorSourceKind.CandleField) return left.field === right.field;
    return left.kind === IndicatorSourceKind.IndicatorOutput
        && right.kind === IndicatorSourceKind.IndicatorOutput
        && left.indicatorId === right.indicatorId
        && left.outputId === right.outputId;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new TypeError('sschart: indicator source must be an object');
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
        throw new TypeError('sschart: indicator source must be a plain object');
    return value as Readonly<Record<string, unknown>>;
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): void {
    const expected = new Set(keys);
    for (const key of Object.keys(value)) {
        if (!expected.has(key))
            throw new TypeError(`sschart: indicator source '${key}' is unsupported`);
    }
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(value, key))
            throw new TypeError(`sschart: indicator source '${key}' is required`);
    }
}

function identifier(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: ${name} must be a non-empty string`);
    return value.trim();
}
