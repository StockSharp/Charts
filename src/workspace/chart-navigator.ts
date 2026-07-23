import type {
    IChartApi,
    RangeListener,
    Time,
    TimeRange,
    TimedSeriesData,
} from '../core/chart-api.js';
import {
    ChartDataStatus,
    type ChartDataControllerListener,
    type ChartDataControllerSnapshot,
} from '../data/chart-data-controller.js';

export const NavigatorStatus = Object.freeze({
    Idle: 'idle',
    Loading: 'loading',
    Ready: 'ready',
    Error: 'error',
} as const);
export type NavigatorStatus = typeof NavigatorStatus[keyof typeof NavigatorStatus];

export const NavigatorRangePreset = Object.freeze({
    OneDay: '1d',
    FiveDays: '5d',
    OneMonth: '1m',
    ThreeMonths: '3m',
    SixMonths: '6m',
    YearToDate: 'ytd',
    OneYear: '1y',
    FiveYears: '5y',
    All: 'all',
} as const);
export type NavigatorRangePreset = typeof NavigatorRangePreset[
    keyof typeof NavigatorRangePreset
];

export const NavigatorDateAlignment = Object.freeze({
    Start: 'start',
    Center: 'center',
    End: 'end',
} as const);
export type NavigatorDateAlignment = typeof NavigatorDateAlignment[
    keyof typeof NavigatorDateAlignment
];

export const NavigatorNavigationOutcome = Object.freeze({
    Applied: 'applied',
    Clamped: 'clamped',
    PageLimit: 'page-limit',
    Empty: 'empty',
    Cancelled: 'cancelled',
} as const);
export type NavigatorNavigationOutcome = typeof NavigatorNavigationOutcome[
    keyof typeof NavigatorNavigationOutcome
];

export interface NavigatorBounds {
    readonly from: Time;
    readonly to: Time;
    readonly count: number;
}

export interface NavigatorSample {
    readonly from: Time;
    readonly to: Time;
    readonly open: number | null;
    readonly high: number | null;
    readonly low: number | null;
    readonly close: number | null;
    readonly count: number;
}

export interface NavigatorValue {
    readonly value: number;
    readonly high?: number;
    readonly low?: number;
}

export type NavigatorValueAccessor<TBar extends TimedSeriesData> = (
    bar: TBar,
) => number | NavigatorValue | null;

export interface NavigatorPresetContext {
    readonly anchor: Time;
    readonly bounds: NavigatorBounds;
    readonly data: ChartDataControllerSnapshot;
}

export interface NavigatorPresetDefinition {
    readonly id: string;
    readonly label: string;
    /** Null means the complete available history. */
    readonly range: (context: NavigatorPresetContext) => TimeRange | null;
}

export interface NavigatorDataController<TBar extends TimedSeriesData> {
    snapshot(): ChartDataControllerSnapshot;
    /** Half-open raw-data window [fromIndex, toIndex). */
    rawDataSlice(fromIndex?: number, toIndex?: number): readonly TBar[];
    loadMoreBefore(): Promise<number>;
    subscribe(listener: ChartDataControllerListener): void;
    unsubscribe(listener: ChartDataControllerListener): void;
}

export interface ChartNavigatorOptions<TBar extends TimedSeriesData> {
    readonly chart: IChartApi;
    readonly data: NavigatorDataController<TBar>;
    readonly valueAccessor?: NavigatorValueAccessor<TBar>;
    /** Maximum number of immutable overview buckets. Defaults to 600. */
    readonly maxPoints?: number;
    /** Safety limit for one range/date operation. Defaults to 100 history pages. */
    readonly maxHistoryPages?: number;
    /** Replaces the built-in preset list when supplied. */
    readonly presets?: readonly NavigatorPresetDefinition[];
}

export interface NavigatorHistoryOptions {
    readonly maxHistoryPages?: number;
}

export interface NavigatorGoToDateOptions extends NavigatorHistoryOptions {
    /** Visible time span in seconds. The current chart span is used by default. */
    readonly spanSeconds?: number;
    readonly alignment?: NavigatorDateAlignment;
}

export interface NavigatorNavigationResult {
    readonly outcome: NavigatorNavigationOutcome;
    readonly requestedRange: TimeRange | null;
    readonly requestedTime: Time | null;
    readonly visibleRange: TimeRange | null;
    readonly presetId: string | null;
    readonly pagesLoaded: number;
    readonly barsLoaded: number;
    readonly historyExhausted: boolean;
}

export interface ChartNavigatorSnapshot {
    readonly status: NavigatorStatus;
    readonly dataStatus: ChartDataControllerSnapshot['status'];
    readonly generation: number;
    readonly loading: boolean;
    readonly bounds: NavigatorBounds | null;
    readonly visibleRange: TimeRange | null;
    readonly activePresetId: string | null;
    readonly pendingPresetId: string | null;
    readonly samples: readonly NavigatorSample[];
    readonly lastNavigation: NavigatorNavigationResult | null;
    readonly error: unknown | null;
}

export type ChartNavigatorListener = (snapshot: ChartNavigatorSnapshot) => void;

interface NavigationRequest {
    readonly requestedRange: TimeRange | null;
    readonly requestedTime: Time | null;
    readonly presetId: string | null;
    readonly maxPages: number;
}

const DAY_SECONDS = 86_400;
const DEFAULT_MAX_POINTS = 600;
const MIN_MAX_POINTS = 10;
const MAX_MAX_POINTS = 10_000;
const DEFAULT_MAX_HISTORY_PAGES = 100;
const MAX_HISTORY_PAGES = 10_000;

const BUILT_IN_PRESETS: readonly NavigatorPresetDefinition[] = Object.freeze([
    preset(NavigatorRangePreset.OneDay, '1D', context => context.anchor - DAY_SECONDS),
    preset(NavigatorRangePreset.FiveDays, '5D', context => context.anchor - 5 * DAY_SECONDS),
    preset(NavigatorRangePreset.OneMonth, '1M', context => subtractUtcMonths(context.anchor, 1)),
    preset(NavigatorRangePreset.ThreeMonths, '3M', context => subtractUtcMonths(context.anchor, 3)),
    preset(NavigatorRangePreset.SixMonths, '6M', context => subtractUtcMonths(context.anchor, 6)),
    Object.freeze({
        id: NavigatorRangePreset.YearToDate,
        label: 'YTD',
        range: (context: NavigatorPresetContext): TimeRange => {
            const yearStart = startOfUtcYear(context.anchor);
            return Object.freeze({
                from: yearStart < context.anchor ? yearStart : context.anchor - DAY_SECONDS,
                to: context.anchor,
            });
        },
    }),
    preset(NavigatorRangePreset.OneYear, '1Y', context => subtractUtcMonths(context.anchor, 12)),
    preset(NavigatorRangePreset.FiveYears, '5Y', context => subtractUtcMonths(context.anchor, 60)),
    Object.freeze({
        id: NavigatorRangePreset.All,
        label: 'All',
        range: (): null => null,
    }),
]);

/** Built-in UTC-calendar presets. Supply custom definitions for exchange-specific boundaries. */
export function defaultNavigatorPresets(): readonly NavigatorPresetDefinition[] {
    return BUILT_IN_PRESETS;
}

/**
 * DOM-neutral chart navigator. It owns range/preset/date navigation and exposes a bounded
 * min/max overview model; the host remains free to render it with canvas, SVG or native UI.
 */
export class ChartNavigator<TBar extends TimedSeriesData> {
    private readonly chart: IChartApi;
    private readonly data: NavigatorDataController<TBar>;
    private readonly valueAccessor: NavigatorValueAccessor<TBar>;
    private readonly maxPoints: number;
    private readonly maxHistoryPages: number;
    private readonly presetValues: readonly NavigatorPresetDefinition[];
    private readonly presetsById: ReadonlyMap<string, NavigatorPresetDefinition>;
    private readonly listeners = new Set<ChartNavigatorListener>();
    private dataState: ChartDataControllerSnapshot;
    private boundsValue: NavigatorBounds | null = null;
    private visibleRangeValue: TimeRange | null = null;
    private samplesValue: readonly NavigatorSample[] = Object.freeze([]);
    private activePresetIdValue: string | null = null;
    private pendingPresetIdValue: string | null = null;
    private lastNavigationValue: NavigatorNavigationResult | null = null;
    private operationError: unknown | null = null;
    private samplingError: unknown | null = null;
    private operationId = 0;
    private loading = false;
    private applyingRange = 0;
    private overviewDirty = false;
    private sampledGeneration = -1;
    private sampledLength = 0;
    private sampledFirstTime: Time | null = null;
    private sampledBucketSize = 0;
    private disposed = false;

    private readonly dataListener: ChartDataControllerListener = (snapshot): void => {
        this.handleData(snapshot);
    };
    private readonly rangeListener: RangeListener = (range): void => {
        this.handleRange(range);
    };

    constructor(options: ChartNavigatorOptions<TBar>) {
        if (!plainObject(options) || !validChart(options.chart) || !validData(options.data))
            throw new TypeError('sschart: chart navigator options are invalid');
        if (options.valueAccessor !== undefined && typeof options.valueAccessor !== 'function')
            throw new TypeError('sschart: chart navigator valueAccessor must be a function');
        this.chart = options.chart;
        this.data = options.data;
        this.valueAccessor = options.valueAccessor ?? defaultValueAccessor;
        this.maxPoints = integerOption(
            options.maxPoints,
            DEFAULT_MAX_POINTS,
            MIN_MAX_POINTS,
            MAX_MAX_POINTS,
            'maxPoints',
        );
        this.maxHistoryPages = integerOption(
            options.maxHistoryPages,
            DEFAULT_MAX_HISTORY_PAGES,
            1,
            MAX_HISTORY_PAGES,
            'maxHistoryPages',
        );
        const normalizedPresets = normalizePresets(options.presets ?? BUILT_IN_PRESETS);
        this.presetValues = normalizedPresets.values;
        this.presetsById = normalizedPresets.byId;
        this.dataState = normalizeDataSnapshot(this.data.snapshot());
        this.visibleRangeValue = freezeRange(this.chart.timeScale().getVisibleRange());
        this.refreshData(true);

        let rangeSubscribed = false;
        try {
            this.chart.timeScale().subscribeVisibleTimeRangeChange(this.rangeListener);
            rangeSubscribed = true;
            this.data.subscribe(this.dataListener);
        } catch (error) {
            try { this.data.unsubscribe(this.dataListener); } catch { /* preserve the failure */ }
            if (rangeSubscribed) {
                try {
                    this.chart.timeScale().unsubscribeVisibleTimeRangeChange(this.rangeListener);
                } catch { /* preserve the subscription failure */ }
            }
            throw error;
        }
    }

    snapshot(): ChartNavigatorSnapshot {
        this.assertAlive();
        return this.snapshotValue();
    }

    presets(): readonly NavigatorPresetDefinition[] {
        this.assertAlive();
        return this.presetValues;
    }

    setRange(
        range: TimeRange,
        options: NavigatorHistoryOptions = {},
    ): Promise<NavigatorNavigationResult> {
        this.assertAlive();
        return this.navigate({
            requestedRange: normalizeRange(range, 'navigator range'),
            requestedTime: null,
            presetId: null,
            maxPages: this.navigationPageLimit(options),
        });
    }

    selectPreset(
        presetId: string,
        options: NavigatorHistoryOptions = {},
    ): Promise<NavigatorNavigationResult> {
        this.assertAlive();
        const id = identifier(presetId, 'navigator preset id');
        const definition = this.presetsById.get(id);
        if (definition === undefined)
            throw new RangeError(`sschart: unknown navigator preset '${id}'`);
        let requestedRange: TimeRange | null = null;
        if (this.boundsValue !== null) {
            requestedRange = normalizeOptionalRange(definition.range(Object.freeze({
                anchor: this.boundsValue.to,
                bounds: this.boundsValue,
                data: this.dataState,
            })), `navigator preset '${id}' range`);
        }
        return this.navigate({
            requestedRange,
            requestedTime: null,
            presetId: id,
            maxPages: this.navigationPageLimit(options),
        });
    }

    goToDate(
        time: Time,
        options: NavigatorGoToDateOptions = {},
    ): Promise<NavigatorNavigationResult> {
        this.assertAlive();
        const target = finiteTime(time, 'navigator date');
        if (!plainObject(options))
            throw new TypeError('sschart: navigator date options must be an object');
        const alignment = options.alignment ?? NavigatorDateAlignment.Center;
        if (!Object.values(NavigatorDateAlignment).includes(alignment))
            throw new TypeError('sschart: navigator date alignment is invalid');
        const span = positiveFinite(
            options.spanSeconds ?? this.defaultDateSpan(),
            'navigator date spanSeconds',
        );
        let from: number;
        let to: number;
        if (alignment === NavigatorDateAlignment.Start) {
            from = target;
            to = target + span;
        } else if (alignment === NavigatorDateAlignment.End) {
            from = target - span;
            to = target;
        } else {
            from = target - span / 2;
            to = target + span / 2;
        }
        return this.navigate({
            requestedRange: normalizeRange({ from, to }, 'navigator date range'),
            requestedTime: target,
            presetId: null,
            maxPages: this.navigationPageLimit(options),
        });
    }

    cancel(): boolean {
        this.assertAlive();
        if (!this.loading) return false;
        this.cancelActiveOperation();
        this.refreshOverviewIfDirty();
        this.emit();
        return true;
    }

    clearError(): void {
        this.assertAlive();
        if (this.operationError === null && this.samplingError === null) return;
        this.operationError = null;
        this.samplingError = null;
        this.emit();
    }

    subscribe(listener: ChartNavigatorListener): void {
        this.assertAlive();
        if (typeof listener !== 'function')
            throw new TypeError('sschart: chart navigator listener must be a function');
        this.listeners.add(listener);
    }

    unsubscribe(listener: ChartNavigatorListener): void {
        this.listeners.delete(listener);
    }

    dispose(): void {
        if (this.disposed) return;
        this.operationId++;
        this.loading = false;
        try { this.data.unsubscribe(this.dataListener); } catch { /* best-effort lifecycle */ }
        try {
            this.chart.timeScale().unsubscribeVisibleTimeRangeChange(this.rangeListener);
        } catch { /* best-effort lifecycle */ }
        this.listeners.clear();
        this.disposed = true;
    }

    private async navigate(request: NavigationRequest): Promise<NavigatorNavigationResult> {
        const token = ++this.operationId;
        const generation = this.dataState.generation;
        this.loading = true;
        this.pendingPresetIdValue = request.presetId;
        this.activePresetIdValue = null;
        this.operationError = null;
        this.emit();

        let pagesLoaded = 0;
        let barsLoaded = 0;
        let hitPageLimit = false;
        try {
            while (this.needsOlderHistory(request.requestedRange)) {
                if (!this.operationCurrent(token, generation))
                    return this.cancelledResult(request, pagesLoaded, barsLoaded);
                if (pagesLoaded >= request.maxPages) {
                    hitPageLimit = true;
                    break;
                }
                pagesLoaded++;
                const added = await this.data.loadMoreBefore();
                if (!this.operationCurrent(token, generation))
                    return this.cancelledResult(request, pagesLoaded, barsLoaded);
                barsLoaded += nonNegativeCount(added, 'navigator loaded bar count');
                this.acceptDataSnapshot(this.data.snapshot(), false);
                if (added === 0) break;
            }

            if (!this.operationCurrent(token, generation))
                return this.cancelledResult(request, pagesLoaded, barsLoaded);
            this.acceptDataSnapshot(this.data.snapshot(), false);
            const bounds = this.boundsValue;
            let outcome: NavigatorNavigationOutcome;
            if (bounds === null) outcome = NavigatorNavigationOutcome.Empty;
            else if (hitPageLimit && this.needsOlderHistory(request.requestedRange))
                outcome = NavigatorNavigationOutcome.PageLimit;
            else if (request.requestedRange !== null
                && !rangeContained(request.requestedRange, bounds))
                outcome = NavigatorNavigationOutcome.Clamped;
            else if (request.requestedRange === null && this.dataState.hasMoreBefore)
                outcome = NavigatorNavigationOutcome.Clamped;
            else outcome = NavigatorNavigationOutcome.Applied;

            if (bounds !== null) this.applyNavigationRange(request.requestedRange, bounds);
            const result = freezeNavigationResult({
                outcome,
                requestedRange: request.requestedRange,
                requestedTime: request.requestedTime,
                visibleRange: this.visibleRangeValue,
                presetId: request.presetId,
                pagesLoaded,
                barsLoaded,
                historyExhausted: !this.dataState.hasMoreBefore,
            });
            if (this.operationId === token && !this.disposed) {
                this.loading = false;
                this.pendingPresetIdValue = null;
                this.activePresetIdValue = outcome === NavigatorNavigationOutcome.PageLimit
                    || outcome === NavigatorNavigationOutcome.Empty
                    ? null : request.presetId;
                this.lastNavigationValue = result;
                this.refreshOverviewIfDirty();
                this.emit();
            }
            return result;
        } catch (error) {
            if (!this.operationCurrent(token, generation))
                return this.cancelledResult(request, pagesLoaded, barsLoaded);
            this.loading = false;
            this.pendingPresetIdValue = null;
            this.operationError = error;
            this.refreshOverviewIfDirty();
            this.emit();
            throw error;
        }
    }

    private applyNavigationRange(requested: TimeRange | null, bounds: NavigatorBounds): void {
        this.applyingRange++;
        try {
            if (requested === null) this.chart.timeScale().fitContent();
            else this.chart.timeScale().setVisibleRange(clampRange(requested, bounds));
            this.visibleRangeValue = freezeRange(this.chart.timeScale().getVisibleRange());
        } finally {
            this.applyingRange--;
        }
    }

    private needsOlderHistory(requested: TimeRange | null): boolean {
        if (!this.dataState.hasMoreBefore || this.boundsValue === null) return false;
        return requested === null || this.boundsValue.from > requested.from;
    }

    private operationCurrent(token: number, generation: number): boolean {
        return !this.disposed && this.operationId === token
            && this.dataState.generation === generation;
    }

    private cancelledResult(
        request: NavigationRequest,
        pagesLoaded: number,
        barsLoaded: number,
    ): NavigatorNavigationResult {
        return freezeNavigationResult({
            outcome: NavigatorNavigationOutcome.Cancelled,
            requestedRange: request.requestedRange,
            requestedTime: request.requestedTime,
            visibleRange: this.visibleRangeValue,
            presetId: request.presetId,
            pagesLoaded,
            barsLoaded,
            historyExhausted: !this.dataState.hasMoreBefore,
        });
    }

    private handleData(snapshot: ChartDataControllerSnapshot): void {
        if (this.disposed) return;
        const previousGeneration = this.dataState.generation;
        try {
            this.acceptDataSnapshot(snapshot, true);
            if (this.dataState.generation !== previousGeneration) {
                this.activePresetIdValue = null;
                if (this.loading) this.cancelActiveOperation();
            }
            this.samplingError = null;
        } catch (error) {
            this.samplingError = error;
        }
        this.emit();
    }

    private acceptDataSnapshot(snapshot: ChartDataControllerSnapshot, refreshOverview: boolean): void {
        this.dataState = normalizeDataSnapshot(snapshot);
        this.refreshData(refreshOverview);
    }

    private handleRange(range: TimeRange | null): void {
        if (this.disposed) return;
        this.visibleRangeValue = freezeRange(range);
        if (this.applyingRange === 0) {
            this.activePresetIdValue = null;
            if (this.loading) this.cancelActiveOperation();
            this.emit();
        }
    }

    private cancelActiveOperation(): void {
        this.operationId++;
        this.loading = false;
        this.pendingPresetIdValue = null;
    }

    private refreshData(refreshOverview: boolean): void {
        this.boundsValue = this.readBounds();
        if (!refreshOverview || this.loading) {
            this.overviewDirty = true;
            return;
        }
        this.refreshOverview(false);
    }

    private readBounds(): NavigatorBounds | null {
        const length = this.dataState.loadedBars;
        if (length === 0) return null;
        const first = this.data.rawDataSlice(0, 1)[0];
        const last = this.data.rawDataSlice(length - 1, length)[0];
        if (first === undefined || last === undefined)
            throw new Error('sschart: chart navigator data length does not match raw data');
        const from = finiteTime(first.time, 'navigator first data time');
        const to = finiteTime(last.time, 'navigator last data time');
        if (to < from)
            throw new RangeError('sschart: chart navigator data must be ordered by time');
        return Object.freeze({ from, to, count: length });
    }

    private refreshOverviewIfDirty(): void {
        if (!this.overviewDirty) return;
        try {
            this.refreshOverview(false);
            this.samplingError = null;
        } catch (error) {
            this.samplingError = error;
        }
    }

    private refreshOverview(force: boolean): void {
        this.overviewDirty = false;
        const length = this.dataState.loadedBars;
        const bounds = this.boundsValue;
        if (length === 0 || bounds === null) {
            this.samplesValue = Object.freeze([]);
            this.sampledGeneration = this.dataState.generation;
            this.sampledLength = 0;
            this.sampledFirstTime = null;
            this.sampledBucketSize = 0;
            return;
        }

        const bucketSize = Math.ceil(length / this.maxPoints);
        const canRefreshTail = !force
            && this.sampledGeneration === this.dataState.generation
            && this.sampledFirstTime === bounds.from
            && this.sampledBucketSize === bucketSize
            && this.sampledLength > 0
            && length >= this.sampledLength;
        if (canRefreshTail) {
            const changedIndex = Math.max(0, Math.min(this.sampledLength, length) - 1);
            const firstBucket = Math.floor(changedIndex / bucketSize);
            const fromIndex = firstBucket * bucketSize;
            const suffix = aggregateSamples(
                this.data.rawDataSlice(fromIndex, length),
                bucketSize,
                this.valueAccessor,
            );
            this.samplesValue = Object.freeze([
                ...this.samplesValue.slice(0, firstBucket),
                ...suffix,
            ]);
        } else {
            this.samplesValue = aggregateSamples(
                this.data.rawDataSlice(0, length),
                bucketSize,
                this.valueAccessor,
            );
        }
        this.sampledGeneration = this.dataState.generation;
        this.sampledLength = length;
        this.sampledFirstTime = bounds.from;
        this.sampledBucketSize = bucketSize;
    }

    private defaultDateSpan(): number {
        const visible = this.visibleRangeValue;
        if (visible !== null && visible.to > visible.from) return visible.to - visible.from;
        const bounds = this.boundsValue;
        if (bounds !== null && bounds.to > bounds.from)
            return Math.max(1, (bounds.to - bounds.from) / 5);
        return DAY_SECONDS;
    }

    private navigationPageLimit(options: NavigatorHistoryOptions): number {
        if (!plainObject(options))
            throw new TypeError('sschart: navigator history options must be an object');
        return integerOption(
            options.maxHistoryPages,
            this.maxHistoryPages,
            1,
            MAX_HISTORY_PAGES,
            'maxHistoryPages',
        );
    }

    private snapshotValue(): ChartNavigatorSnapshot {
        const error = this.operationError
            ?? this.samplingError
            ?? this.dataState.error
            ?? this.dataState.historyError;
        const status = this.loading
            ? NavigatorStatus.Loading
            : error !== null || this.dataState.status === ChartDataStatus.Error
                ? NavigatorStatus.Error
                : this.boundsValue === null || this.dataState.status === ChartDataStatus.Disposed
                    ? NavigatorStatus.Idle : NavigatorStatus.Ready;
        return Object.freeze({
            status,
            dataStatus: this.dataState.status,
            generation: this.dataState.generation,
            loading: this.loading,
            bounds: this.boundsValue,
            visibleRange: freezeRange(this.visibleRangeValue),
            activePresetId: this.activePresetIdValue,
            pendingPresetId: this.pendingPresetIdValue,
            samples: this.samplesValue,
            lastNavigation: this.lastNavigationValue,
            error,
        });
    }

    private emit(): void {
        if (this.disposed) return;
        const snapshot = this.snapshotValue();
        for (const listener of this.listeners) {
            try { listener(snapshot); } catch { /* observers cannot break navigation */ }
        }
    }

    private assertAlive(): void {
        if (this.disposed) throw new Error('sschart: chart navigator is disposed');
    }
}

function preset(
    id: string,
    label: string,
    from: (context: NavigatorPresetContext) => Time,
): NavigatorPresetDefinition {
    return Object.freeze({
        id,
        label,
        range: (context: NavigatorPresetContext): TimeRange => Object.freeze({
            from: from(context),
            to: context.anchor,
        }),
    });
}

function normalizePresets(values: readonly NavigatorPresetDefinition[]): {
    readonly values: readonly NavigatorPresetDefinition[];
    readonly byId: ReadonlyMap<string, NavigatorPresetDefinition>;
} {
    if (!Array.isArray(values) || values.length === 0)
        throw new TypeError('sschart: chart navigator presets must be a non-empty array');
    const byId = new Map<string, NavigatorPresetDefinition>();
    const normalized = values.map((value, index) => {
        if (!plainObject(value))
            throw new TypeError(`sschart: chart navigator preset at index ${index} is invalid`);
        const id = identifier(value.id, `navigator preset[${index}].id`);
        const label = identifier(value.label, `navigator preset[${index}].label`);
        if (typeof value.range !== 'function')
            throw new TypeError(`sschart: navigator preset '${id}' range must be a function`);
        if (byId.has(id)) throw new TypeError(`sschart: duplicate navigator preset '${id}'`);
        const item = Object.freeze({ id, label, range: value.range });
        byId.set(id, item);
        return item;
    });
    return Object.freeze({ values: Object.freeze(normalized), byId });
}

function aggregateSamples<TBar extends TimedSeriesData>(
    bars: readonly TBar[],
    bucketSize: number,
    accessor: NavigatorValueAccessor<TBar>,
): readonly NavigatorSample[] {
    const result: NavigatorSample[] = [];
    for (let fromIndex = 0; fromIndex < bars.length; fromIndex += bucketSize) {
        const toIndex = Math.min(bars.length, fromIndex + bucketSize);
        const first = bars[fromIndex];
        const last = bars[toIndex - 1];
        let open: number | null = null;
        let close: number | null = null;
        let high = -Infinity;
        let low = Infinity;
        for (let index = fromIndex; index < toIndex; index++) {
            const value = normalizeNavigatorValue(accessor(bars[index]));
            if (value === null) continue;
            if (open === null) open = value.value;
            close = value.value;
            high = Math.max(high, value.value, value.high ?? value.value);
            low = Math.min(low, value.value, value.low ?? value.value);
        }
        result.push(Object.freeze({
            from: finiteTime(first.time, 'navigator sample start time'),
            to: finiteTime(last.time, 'navigator sample end time'),
            open,
            high: Number.isFinite(high) ? high : null,
            low: Number.isFinite(low) ? low : null,
            close,
            count: toIndex - fromIndex,
        }));
    }
    return Object.freeze(result);
}

function defaultValueAccessor<TBar extends TimedSeriesData>(
    bar: TBar,
): NavigatorValue | null {
    const value = bar as unknown as Readonly<Record<string, unknown>>;
    if (Number.isFinite(value.close)) {
        return {
            value: value.close as number,
            high: Number.isFinite(value.high) ? value.high as number : undefined,
            low: Number.isFinite(value.low) ? value.low as number : undefined,
        };
    }
    if (Number.isFinite(value.value)) {
        return {
            value: value.value as number,
            high: Number.isFinite(value.upper) ? value.upper as number : undefined,
            low: Number.isFinite(value.lower) ? value.lower as number : undefined,
        };
    }
    if (Number.isFinite(value.high) && Number.isFinite(value.low)) {
        return {
            value: ((value.high as number) + (value.low as number)) / 2,
            high: value.high as number,
            low: value.low as number,
        };
    }
    return null;
}

function normalizeNavigatorValue(value: number | NavigatorValue | null): NavigatorValue | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        return Object.freeze({ value });
    }
    if (!plainObject(value) || !Number.isFinite(value.value))
        throw new TypeError('sschart: chart navigator valueAccessor returned an invalid value');
    if (value.high !== undefined && !Number.isFinite(value.high))
        throw new TypeError('sschart: chart navigator valueAccessor returned an invalid high');
    if (value.low !== undefined && !Number.isFinite(value.low))
        throw new TypeError('sschart: chart navigator valueAccessor returned an invalid low');
    const normalized = Object.freeze({
        value: value.value,
        high: value.high,
        low: value.low,
    });
    if ((normalized.high ?? normalized.value) < normalized.value
        || (normalized.low ?? normalized.value) > normalized.value
        || (normalized.high ?? normalized.value) < (normalized.low ?? normalized.value)) {
        throw new RangeError('sschart: chart navigator value range is invalid');
    }
    return normalized;
}

function normalizeDataSnapshot(value: ChartDataControllerSnapshot): ChartDataControllerSnapshot {
    if (!plainObject(value)
        || !Number.isSafeInteger(value.generation) || value.generation < 0
        || !Number.isSafeInteger(value.loadedBars) || value.loadedBars < 0
        || typeof value.hasMoreBefore !== 'boolean'
        || typeof value.loadingHistory !== 'boolean'
        || typeof value.status !== 'string') {
        throw new TypeError('sschart: chart navigator received an invalid data snapshot');
    }
    return value;
}

function freezeNavigationResult(value: NavigatorNavigationResult): NavigatorNavigationResult {
    return Object.freeze({
        ...value,
        requestedRange: freezeRange(value.requestedRange),
        visibleRange: freezeRange(value.visibleRange),
    });
}

function normalizeOptionalRange(value: TimeRange | null, name: string): TimeRange | null {
    return value === null ? null : normalizeRange(value, name);
}

function normalizeRange(value: TimeRange, name: string): TimeRange {
    if (!plainObject(value)) throw new TypeError(`sschart: ${name} must be an object`);
    const from = finiteTime(value.from, `${name}.from`);
    const to = finiteTime(value.to, `${name}.to`);
    if (!(to > from)) throw new RangeError(`sschart: ${name}.to must be greater than from`);
    return Object.freeze({ from, to });
}

function freezeRange(value: TimeRange | null): TimeRange | null {
    return value === null ? null : normalizeRange(value, 'navigator visible range');
}

function clampRange(range: TimeRange, bounds: NavigatorBounds): TimeRange {
    const span = range.to - range.from;
    if (!(bounds.to > bounds.from)) {
        return Object.freeze({
            from: bounds.from - span / 2,
            to: bounds.from + span / 2,
        });
    }
    if (range.to <= bounds.from) {
        return Object.freeze({ from: bounds.from, to: Math.min(bounds.to, bounds.from + span) });
    }
    if (range.from >= bounds.to) {
        return Object.freeze({ from: Math.max(bounds.from, bounds.to - span), to: bounds.to });
    }
    const from = Math.max(range.from, bounds.from);
    const to = Math.min(range.to, bounds.to);
    return to > from ? Object.freeze({ from, to }) : Object.freeze({
        from: bounds.from,
        to: bounds.to,
    });
}

function rangeContained(range: TimeRange, bounds: NavigatorBounds): boolean {
    return range.from >= bounds.from && range.to <= bounds.to;
}

function subtractUtcMonths(time: Time, months: number): Time {
    const source = new Date(time * 1_000);
    if (!Number.isFinite(source.getTime()))
        throw new RangeError('sschart: navigator preset anchor is outside the Date range');
    const targetMonth = source.getUTCMonth() - months;
    const target = new Date(0);
    target.setUTCFullYear(source.getUTCFullYear(), targetMonth, 1);
    target.setUTCHours(
        source.getUTCHours(),
        source.getUTCMinutes(),
        source.getUTCSeconds(),
        source.getUTCMilliseconds(),
    );
    const lastDay = new Date(0);
    lastDay.setUTCFullYear(target.getUTCFullYear(), target.getUTCMonth() + 1, 0);
    target.setUTCDate(Math.min(source.getUTCDate(), lastDay.getUTCDate()));
    return target.getTime() / 1_000;
}

function startOfUtcYear(time: Time): Time {
    const source = new Date(time * 1_000);
    if (!Number.isFinite(source.getTime()))
        throw new RangeError('sschart: navigator preset anchor is outside the Date range');
    const target = new Date(0);
    target.setUTCFullYear(source.getUTCFullYear(), 0, 1);
    target.setUTCHours(0, 0, 0, 0);
    return target.getTime() / 1_000;
}

function finiteTime(value: unknown, name: string): Time {
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new TypeError(`sschart: ${name} must be a finite UNIX timestamp`);
    return value;
}

function positiveFinite(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0))
        throw new RangeError(`sschart: ${name} must be a positive finite number`);
    return value;
}

function nonNegativeCount(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0)
        throw new RangeError(`sschart: ${name} must be a non-negative integer`);
    return value as number;
}

function integerOption(
    value: unknown,
    fallback: number,
    minimum: number,
    maximum: number,
    name: string,
): number {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
        throw new RangeError(
            `sschart: chart navigator ${name} must be an integer from ${minimum} to ${maximum}`,
        );
    }
    return value as number;
}

function identifier(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: ${name} must be a non-empty string`);
    return value.trim();
}

function validChart(value: unknown): value is IChartApi {
    if (value === null || typeof value !== 'object') return false;
    const chart = value as IChartApi;
    if (typeof chart.timeScale !== 'function') return false;
    const scale = chart.timeScale();
    return scale !== null && typeof scale === 'object'
        && typeof scale.getVisibleRange === 'function'
        && typeof scale.setVisibleRange === 'function'
        && typeof scale.fitContent === 'function'
        && typeof scale.subscribeVisibleTimeRangeChange === 'function'
        && typeof scale.unsubscribeVisibleTimeRangeChange === 'function';
}

function validData<TBar extends TimedSeriesData>(
    value: unknown,
): value is NavigatorDataController<TBar> {
    if (value === null || typeof value !== 'object') return false;
    const data = value as NavigatorDataController<TBar>;
    return typeof data.snapshot === 'function'
        && typeof data.rawDataSlice === 'function'
        && typeof data.loadMoreBefore === 'function'
        && typeof data.subscribe === 'function'
        && typeof data.unsubscribe === 'function';
}

function plainObject(value: unknown): value is Readonly<Record<string, any>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
