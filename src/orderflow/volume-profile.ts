import {
    FootprintApproximation,
    OrderFlowDataMode,
    normalizeApproximateFootprintBar,
    normalizeFootprintBar,
    normalizeFootprintBars,
    type FootprintBar,
    type FootprintNormalizationOptions,
    type OrderFlowBar,
} from './model.js';
import {
    FootprintPocTieBreak,
    calculateFootprintMetrics,
    type FootprintValueArea,
} from './metrics.js';

export const VolumeProfileStatus = Object.freeze({
    Ready: 'ready',
    Empty: 'empty',
    Approximate: 'approximate',
    Mixed: 'mixed',
} as const);
export type VolumeProfileStatus = typeof VolumeProfileStatus[keyof typeof VolumeProfileStatus];

export interface VolumeProfileCalculationOptions extends FootprintNormalizationOptions {
    readonly valueAreaPercentage?: number;
    readonly pocTieBreak?: FootprintPocTieBreak;
}

export interface ExactVolumeProfileLevel {
    readonly price: number;
    readonly bidVolume: number;
    readonly askVolume: number;
    readonly totalVolume: number;
    readonly delta: number;
    readonly tradeCount?: number;
}

interface ExactVolumeProfileBase {
    readonly dataMode: typeof OrderFlowDataMode.Exact;
    readonly barCount: number;
    readonly levels: readonly ExactVolumeProfileLevel[];
    readonly totalBidVolume: number;
    readonly totalAskVolume: number;
    readonly totalVolume: number;
    readonly delta: number;
    readonly tradeCount: number | null;
}

export interface ReadyExactVolumeProfile extends ExactVolumeProfileBase {
    readonly status: typeof VolumeProfileStatus.Ready;
    readonly from: number;
    readonly to: number;
    readonly pocPrice: number;
    readonly pocVolume: number;
    readonly valueArea: FootprintValueArea;
}

export interface EmptyExactVolumeProfile extends ExactVolumeProfileBase {
    readonly status: typeof VolumeProfileStatus.Empty;
    readonly from: null;
    readonly to: null;
    readonly pocPrice: null;
    readonly pocVolume: 0;
    readonly valueArea: null;
}

export type ExactVolumeProfile = ReadyExactVolumeProfile | EmptyExactVolumeProfile;

export interface UnavailableVolumeProfile {
    readonly status: typeof VolumeProfileStatus.Approximate | typeof VolumeProfileStatus.Mixed;
    readonly inputMode: typeof OrderFlowDataMode.Approximate | 'mixed';
    readonly profile: null;
    readonly approximations: readonly FootprintApproximation[];
    readonly message: string;
}

export type VolumeProfileResolution = ExactVolumeProfile | UnavailableVolumeProfile;

export type VolumeProfileAggregationUpdateKind = 'append' | 'update';

export interface VolumeProfileAggregationUpdate {
    readonly kind: VolumeProfileAggregationUpdateKind;
    readonly profile: ReadyExactVolumeProfile;
}

export interface DevelopingVolumeProfilePoint {
    readonly time: number;
    readonly totalBidVolume: number;
    readonly totalAskVolume: number;
    readonly totalVolume: number;
    readonly delta: number;
    readonly pocPrice: number;
    readonly pocVolume: number;
    readonly valueAreaLow: number;
    readonly valueAreaHigh: number;
}

interface MutableProfileLevel {
    readonly price: number;
    bidVolume: number;
    askVolume: number;
    tradeCount: number;
    missingTradeCounts: number;
}

interface LevelDelta {
    readonly price: number;
    bidVolume: number;
    askVolume: number;
    tradeCount: number;
    missingTradeCounts: number;
}

interface LevelUpdate {
    readonly price: number;
    readonly value: MutableProfileLevel | null;
}

const POC_TIE_BREAKS = new Set<FootprintPocTieBreak>(Object.values(FootprintPocTieBreak));

/**
 * Incremental exact volume-at-price accumulator. Append and replace-last apply
 * level deltas only; they never rebuild prior bars or distribute candle volume.
 */
export class ExactVolumeProfileAccumulator {
    private readonly options: Readonly<VolumeProfileCalculationOptions>;
    private levels = new Map<number, MutableProfileLevel>();
    private firstTime: number | null = null;
    private lastBar: FootprintBar | null = null;
    private count = 0;

    constructor(options: VolumeProfileCalculationOptions) {
        this.options = normalizeOptions(options);
    }

    get barCount(): number { return this.count; }

    reset(values: readonly FootprintBar[]): ExactVolumeProfile {
        const bars = normalizeFootprintBars(values, this.options);
        const next = new Map<number, MutableProfileLevel>();
        for (const bar of bars) applyUpdates(next, preflight(next, deltasForBar(bar, 1)));
        this.levels = next;
        this.firstTime = bars[0]?.time ?? null;
        this.lastBar = bars[bars.length - 1] ?? null;
        this.count = bars.length;
        return this.snapshot();
    }

    push(value: FootprintBar): VolumeProfileAggregationUpdate {
        const bar = normalizeFootprintBar(value, this.options);
        if (this.lastBar !== null && bar.time < this.lastBar.time)
            throw new RangeError('sschart: volume-profile bar time cannot move backwards');
        const replace = this.lastBar !== null && bar.time === this.lastBar.time;
        const deltas = new Map<number, LevelDelta>();
        if (replace) mergeBarDeltas(deltas, this.lastBar as FootprintBar, -1);
        mergeBarDeltas(deltas, bar, 1);
        const updates = preflight(this.levels, deltas);
        applyUpdates(this.levels, updates);
        if (!replace) {
            if (this.firstTime === null) this.firstTime = bar.time;
            this.count++;
        }
        this.lastBar = bar;
        const profile = this.snapshot();
        if (profile.status !== VolumeProfileStatus.Ready)
            throw new Error('sschart: internal volume-profile accumulator became empty');
        return Object.freeze({ kind: replace ? 'update' : 'append', profile });
    }

    snapshot(): ExactVolumeProfile {
        if (this.count === 0 || this.lastBar === null || this.firstTime === null)
            return emptyProfile();
        const levels = snapshotLevels(this.levels);
        if (levels.length === 0)
            throw new Error('sschart: internal exact volume profile has no levels');
        const low = levels[0].price;
        const high = levels[levels.length - 1].price;
        const reference = Math.max(low, Math.min(high, this.lastBar.close));
        const metrics = calculateFootprintMetrics({
            dataMode: OrderFlowDataMode.Exact,
            time: this.lastBar.time,
            open: reference,
            high,
            low,
            close: reference,
            levels,
        }, {
            tickSize: this.options.tickSize,
            priceOrigin: this.options.priceOrigin,
            valueAreaPercentage: this.options.valueAreaPercentage,
            pocTieBreak: this.options.pocTieBreak,
        });
        return Object.freeze({
            status: VolumeProfileStatus.Ready,
            dataMode: OrderFlowDataMode.Exact,
            from: this.firstTime,
            to: this.lastBar.time,
            barCount: this.count,
            levels,
            totalBidVolume: metrics.totalBidVolume,
            totalAskVolume: metrics.totalAskVolume,
            totalVolume: metrics.totalVolume,
            delta: metrics.delta,
            tradeCount: metrics.tradeCount,
            pocPrice: metrics.pocPrice,
            pocVolume: metrics.pocVolume,
            valueArea: metrics.valueArea,
        });
    }
}

export function calculateVolumeProfile(
    bars: readonly FootprintBar[],
    options: VolumeProfileCalculationOptions,
): ExactVolumeProfile {
    return new ExactVolumeProfileAccumulator(options).reset(bars);
}

/**
 * Resolves heterogeneous input without ever converting approximate total
 * volume into a fake exact bid/ask profile.
 */
export function resolveVolumeProfile(
    bars: readonly OrderFlowBar[],
    options: VolumeProfileCalculationOptions,
): VolumeProfileResolution {
    if (!Array.isArray(bars)) throw new TypeError('sschart: volume-profile bars must be an array');
    const normalizedOptions = normalizeOptions(options);
    if (bars.length === 0) return calculateVolumeProfile([], normalizedOptions);
    let exact = 0;
    let approximate = 0;
    let previousTime = -Infinity;
    const approximations = new Set<FootprintApproximation>();
    for (const bar of bars) {
        let time: number;
        if (bar?.dataMode === OrderFlowDataMode.Exact) {
            time = normalizeFootprintBar(bar, normalizedOptions).time;
            exact++;
        } else if (bar?.dataMode === OrderFlowDataMode.Approximate) {
            const normalized = normalizeApproximateFootprintBar(bar, normalizedOptions);
            time = normalized.time;
            approximations.add(normalized.approximation);
            approximate++;
        } else {
            throw new TypeError('sschart: volume-profile input dataMode is invalid');
        }
        if (!(time > previousTime))
            throw new RangeError('sschart: volume-profile bar times must be strictly increasing');
        previousTime = time;
    }
    if (approximate === 0)
        return calculateVolumeProfile(bars as readonly FootprintBar[], normalizedOptions);
    const reasons = Object.freeze(Array.from(approximations).sort());
    if (exact === 0) {
        return Object.freeze({
            status: VolumeProfileStatus.Approximate,
            inputMode: OrderFlowDataMode.Approximate,
            profile: null,
            approximations: reasons,
            message: 'Exact volume profile is unavailable: input has no aggressor-side levels.',
        });
    }
    return Object.freeze({
        status: VolumeProfileStatus.Mixed,
        inputMode: 'mixed',
        profile: null,
        approximations: reasons,
        message: 'Exact volume profile is unavailable: exact and approximate bars cannot be mixed.',
    });
}

export function calculateDevelopingVolumeProfile(
    bars: readonly FootprintBar[],
    options: VolumeProfileCalculationOptions,
): readonly DevelopingVolumeProfilePoint[] {
    const normalized = normalizeFootprintBars(bars, normalizeOptions(options));
    const accumulator = new ExactVolumeProfileAccumulator(options);
    const result: DevelopingVolumeProfilePoint[] = [];
    for (const bar of normalized) {
        const profile = accumulator.push(bar).profile;
        result.push(Object.freeze({
            time: bar.time,
            totalBidVolume: profile.totalBidVolume,
            totalAskVolume: profile.totalAskVolume,
            totalVolume: profile.totalVolume,
            delta: profile.delta,
            pocPrice: profile.pocPrice,
            pocVolume: profile.pocVolume,
            valueAreaLow: profile.valueArea.low,
            valueAreaHigh: profile.valueArea.high,
        }));
    }
    return Object.freeze(result);
}

function deltasForBar(bar: FootprintBar, direction: 1 | -1): Map<number, LevelDelta> {
    const result = new Map<number, LevelDelta>();
    mergeBarDeltas(result, bar, direction);
    return result;
}

function mergeBarDeltas(
    result: Map<number, LevelDelta>,
    bar: FootprintBar,
    direction: 1 | -1,
): void {
    for (const level of bar.levels) {
        let delta = result.get(level.price);
        if (delta === undefined) {
            delta = {
                price: level.price,
                bidVolume: 0,
                askVolume: 0,
                tradeCount: 0,
                missingTradeCounts: 0,
            };
            result.set(level.price, delta);
        }
        delta.bidVolume += direction * level.bidVolume;
        delta.askVolume += direction * level.askVolume;
        delta.tradeCount += direction * (level.tradeCount ?? 0);
        delta.missingTradeCounts += direction * (level.tradeCount === undefined ? 1 : 0);
    }
}

function preflight(
    current: ReadonlyMap<number, MutableProfileLevel>,
    deltas: ReadonlyMap<number, LevelDelta>,
): readonly LevelUpdate[] {
    const result: LevelUpdate[] = [];
    for (const delta of deltas.values()) {
        const existing = current.get(delta.price);
        const bidVolume = normalizedNonNegative(
            (existing?.bidVolume ?? 0) + delta.bidVolume,
            'volume-profile bid volume',
        );
        const askVolume = normalizedNonNegative(
            (existing?.askVolume ?? 0) + delta.askVolume,
            'volume-profile ask volume',
        );
        const tradeCount = (existing?.tradeCount ?? 0) + delta.tradeCount;
        const missingTradeCounts = (existing?.missingTradeCounts ?? 0)
            + delta.missingTradeCounts;
        if (!Number.isSafeInteger(tradeCount) || tradeCount < 0
            || !Number.isSafeInteger(missingTradeCounts) || missingTradeCounts < 0) {
            throw new RangeError('sschart: volume-profile trade count overflow');
        }
        result.push(Object.freeze({
            price: delta.price,
            value: bidVolume + askVolume === 0 ? null : {
                price: delta.price,
                bidVolume,
                askVolume,
                tradeCount,
                missingTradeCounts,
            },
        }));
    }
    return Object.freeze(result);
}

function applyUpdates(
    target: Map<number, MutableProfileLevel>,
    updates: readonly LevelUpdate[],
): void {
    for (const update of updates) {
        if (update.value === null) target.delete(update.price);
        else target.set(update.price, update.value);
    }
}

function snapshotLevels(
    values: ReadonlyMap<number, MutableProfileLevel>,
): readonly ExactVolumeProfileLevel[] {
    return Object.freeze(Array.from(values.values())
        .sort((left, right) => left.price - right.price)
        .map(level => Object.freeze({
            price: level.price,
            bidVolume: level.bidVolume,
            askVolume: level.askVolume,
            totalVolume: checkedAdd(level.bidVolume, level.askVolume,
                'volume-profile level total'),
            delta: level.askVolume - level.bidVolume,
            ...(level.missingTradeCounts === 0 ? { tradeCount: level.tradeCount } : {}),
        })));
}

function emptyProfile(): EmptyExactVolumeProfile {
    return Object.freeze({
        status: VolumeProfileStatus.Empty,
        dataMode: OrderFlowDataMode.Exact,
        from: null,
        to: null,
        barCount: 0,
        levels: Object.freeze([]),
        totalBidVolume: 0,
        totalAskVolume: 0,
        totalVolume: 0,
        delta: 0,
        tradeCount: null,
        pocPrice: null,
        pocVolume: 0,
        valueArea: null,
    });
}

function normalizedNonNegative(value: number, name: string): number {
    if (!Number.isFinite(value)) throw new RangeError(`sschart: ${name} overflow`);
    const tolerance = Math.max(1e-12, Math.abs(value) * Number.EPSILON * 16);
    if (value < -tolerance) throw new RangeError(`sschart: ${name} became negative`);
    return Math.abs(value) <= tolerance ? 0 : value;
}

function checkedAdd(left: number, right: number, name: string): number {
    const result = left + right;
    if (!Number.isFinite(result)) throw new RangeError(`sschart: ${name} overflow`);
    return result;
}

function normalizeOptions(
    value: VolumeProfileCalculationOptions,
): Readonly<VolumeProfileCalculationOptions> {
    if (!plainObject(value))
        throw new TypeError('sschart: volume-profile calculation options are required');
    normalizeFootprintBars([], value);
    const valueAreaPercentage = value.valueAreaPercentage ?? 0.7;
    if (typeof valueAreaPercentage !== 'number' || !Number.isFinite(valueAreaPercentage)
        || !(valueAreaPercentage > 0 && valueAreaPercentage <= 1)) {
        throw new RangeError('sschart: volume-profile valueAreaPercentage must be in (0, 1]');
    }
    const pocTieBreak = value.pocTieBreak ?? FootprintPocTieBreak.ClosestToClose;
    if (!POC_TIE_BREAKS.has(pocTieBreak))
        throw new TypeError('sschart: volume-profile pocTieBreak is invalid');
    return Object.freeze({
        tickSize: value.tickSize,
        priceOrigin: value.priceOrigin ?? 0,
        valueAreaPercentage,
        pocTieBreak,
    });
}

function plainObject(value: unknown): value is Readonly<Record<string, any>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
