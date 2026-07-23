import {
    LineSeries,
    PriceScaleMode,
    TimeScaleMode,
    type CrosshairEvent,
    type IChartApi,
    type ISeriesApi,
    type LineData,
    type PriceScaleModeValue,
    type SeriesOptions,
    type Time,
    type TimeScaleOptions,
    type TimedSeriesData,
} from '../core/chart-api.js';
import {
    ChartDataController,
    ChartDataStatus,
    type ChartDataControllerSnapshot,
} from '../data/chart-data-controller.js';
import type {
    BarUpdate,
    BarsPage,
    BarsRequest,
    BarsSubscription,
    IChartDataSource,
    ResolveSymbolRequest,
    SymbolInfo,
    Unsubscribe,
} from '../data/data-source.js';
import type {
    RealtimeReconnectPolicy,
    RealtimeScheduler,
} from '../data/reconnect-policy.js';
import { TradingCalendar } from '../time/trading-calendar-engine.js';

export const CompareMode = Object.freeze({
    Percentage: PriceScaleMode.Percentage,
    IndexedTo100: PriceScaleMode.IndexedTo100,
} as const);
export type CompareMode = typeof CompareMode[keyof typeof CompareMode];

export const CompareAlignment = Object.freeze({
    /** Keep the chart's existing continuous/ordinal/session-aware time domain. */
    Chart: 'chart',
    /** Project every absolute timestamp through the primary symbol's exchange calendar. */
    PrimarySession: 'primary-session',
} as const);
export type CompareAlignment = typeof CompareAlignment[keyof typeof CompareAlignment];

export interface CompareDataOptions {
    readonly initialCount?: number;
    readonly historyCount?: number;
    readonly historyPrefetchThreshold?: number;
    readonly autoPrefetch?: boolean;
    readonly lodCacheSize?: number;
    readonly autoScrollRealtime?: boolean;
    readonly reconnectPolicy?: RealtimeReconnectPolicy;
    readonly realtimeScheduler?: RealtimeScheduler;
}

export type CompareValueAccessor<TBar extends TimedSeriesData> = (
    bar: TBar,
) => number | null;

export interface CompareControllerOptions<TBar extends TimedSeriesData> {
    readonly chart: IChartApi;
    readonly dataSource: IChartDataSource<TBar>;
    readonly valueAccessor?: CompareValueAccessor<TBar>;
    readonly scaleId?: string;
    readonly mode?: CompareMode;
    readonly alignment?: CompareAlignment;
    readonly colors?: readonly string[];
    readonly seriesOptions?: Partial<SeriesOptions>;
    readonly data?: CompareDataOptions;
}

export interface CompareAddRequest {
    readonly id?: string;
    readonly symbol: string;
    readonly resolution: string;
    readonly label?: string;
    readonly color?: string;
    readonly visible?: boolean;
    readonly primary?: boolean;
}

export interface CompareInstrumentSnapshot {
    readonly id: string;
    readonly symbol: string;
    readonly resolution: string;
    readonly label: string;
    readonly color: string;
    readonly visible: boolean;
    readonly primary: boolean;
    readonly status: ChartDataControllerSnapshot['status'];
    readonly realtimeStatus: ChartDataControllerSnapshot['realtimeStatus'];
    readonly symbolInfo: SymbolInfo | null;
    readonly loadedBars: number;
    readonly renderedBars: number;
    readonly lastValue: number | null;
    /** Current load, realtime or history failure, in that priority order. */
    readonly error: unknown | null;
}

export interface CompareLegendItem {
    readonly id: string;
    readonly symbol: string;
    readonly label: string;
    readonly color: string;
    readonly time: Time | null;
    readonly rawValue: number | null;
    readonly changePercent: number | null;
    readonly indexedTo100: number | null;
    /** Matches the controller's current Percentage/IndexedTo100 mode. */
    readonly displayValue: number | null;
}

export interface CompareControllerSnapshot {
    readonly mode: CompareMode;
    readonly alignment: CompareAlignment;
    readonly scaleId: string;
    readonly primaryId: string | null;
    readonly crosshairTime: Time | null;
    readonly instruments: readonly CompareInstrumentSnapshot[];
    readonly legend: readonly CompareLegendItem[];
}

export type CompareControllerListener = (snapshot: CompareControllerSnapshot) => void;

interface CompareEntry {
    readonly id: string;
    readonly symbol: string;
    readonly resolution: string;
    readonly requestedLabel: string | null;
    readonly series: ISeriesApi<LineData, SeriesOptions>;
    readonly data: ChartDataController<LineData, SeriesOptions>;
    listener: (snapshot: ChartDataControllerSnapshot) => void;
    color: string;
    visible: boolean;
    calendar: TradingCalendar | null;
}

const DEFAULT_COLORS = Object.freeze([
    '#4a9eff', '#f5b942', '#00c853', '#ff5c7a', '#9b7cff',
    '#00b8d9', '#ff8a3d', '#a3d65c', '#e66cff', '#8d9dad',
]);
const MODES = new Set<PriceScaleModeValue>(Object.values(CompareMode));
const ALIGNMENTS = new Set<CompareAlignment>(Object.values(CompareAlignment));

/**
 * Owns compare line series and one independent ChartDataController/subscription per symbol.
 * Relative normalization remains in the chart price scale, so zoom-dependent bases cannot drift
 * from rendering; this controller exposes the same bases for its legend.
 */
export class CompareController<TBar extends TimedSeriesData> {
    private readonly chart: IChartApi;
    private readonly dataSource: IChartDataSource<TBar>;
    private readonly valueAccessor: CompareValueAccessor<TBar>;
    private readonly scaleIdValue: string;
    private readonly colors: readonly string[];
    private readonly seriesOptions: Partial<SeriesOptions>;
    private readonly dataOptions: CompareDataOptions;
    private readonly entries = new Map<string, CompareEntry>();
    private readonly listeners = new Set<CompareControllerListener>();
    private readonly originalTimeScale: TimeScaleOptions;
    private readonly originalScaleMode: PriceScaleModeValue;
    private modeValue: CompareMode;
    private alignmentValue: CompareAlignment;
    private primaryIdValue: string | null = null;
    private crosshairTimeValue: Time | null = null;
    private alignedCalendar: TradingCalendar | null = null;
    private nextColor = 0;
    private disposed = false;

    private readonly handleCrosshair = (event: CrosshairEvent): void => {
        if (this.disposed) return;
        if (this.crosshairTimeValue === event.time) return;
        this.crosshairTimeValue = event.time;
        this.emit();
    };

    constructor(options: CompareControllerOptions<TBar>) {
        if (!plainObject(options) || !validChart(options.chart))
            throw new TypeError('sschart: compare controller options are invalid');
        if (!validDataSource(options.dataSource))
            throw new TypeError('sschart: compare controller data source is invalid');
        if (options.valueAccessor !== undefined && typeof options.valueAccessor !== 'function')
            throw new TypeError('sschart: compare valueAccessor must be a function');
        if (options.seriesOptions !== undefined && !plainObject(options.seriesOptions))
            throw new TypeError('sschart: compare seriesOptions must be an object');
        if (options.data !== undefined && !plainObject(options.data))
            throw new TypeError('sschart: compare data options must be an object');
        this.chart = options.chart;
        this.dataSource = options.dataSource;
        this.valueAccessor = options.valueAccessor ?? defaultValueAccessor;
        this.scaleIdValue = identifier(options.scaleId ?? 'left', 'compare scale id');
        this.modeValue = normalizeMode(options.mode ?? CompareMode.Percentage);
        this.alignmentValue = normalizeAlignment(options.alignment ?? CompareAlignment.Chart);
        this.colors = normalizeColors(options.colors ?? DEFAULT_COLORS);
        this.seriesOptions = Object.freeze({ ...(options.seriesOptions ?? {}) });
        this.dataOptions = normalizeDataOptions(options.data ?? {});
        const original = this.chart.options().timeScale;
        this.originalTimeScale = Object.freeze({
            ...(original ?? {}),
            mode: original?.mode
                ?? (original?.ordinal === true ? TimeScaleMode.Ordinal : TimeScaleMode.Continuous),
            ordinal: original?.ordinal,
            calendar: original?.calendar,
            sessionKinds: original?.sessionKinds,
            locale: original?.locale,
            timeZone: original?.timeZone,
            formatter: original?.formatter,
        });
        this.originalScaleMode = this.chart.priceScale(this.scaleIdValue).options().mode;
        this.chart.subscribeCrosshairMove(this.handleCrosshair);
    }

    snapshot(): CompareControllerSnapshot {
        this.assertAlive();
        return this.snapshotValue();
    }

    instruments(): readonly CompareInstrumentSnapshot[] {
        this.assertAlive();
        return Object.freeze([...this.entries.values()].map(entry => this.instrumentSnapshot(entry)));
    }

    get(id: string): CompareInstrumentSnapshot | undefined {
        this.assertAlive();
        const entry = this.entries.get(identifier(id, 'compare id'));
        return entry === undefined ? undefined : this.instrumentSnapshot(entry);
    }

    series(id: string): ISeriesApi<LineData, SeriesOptions> | undefined {
        this.assertAlive();
        return this.entries.get(identifier(id, 'compare id'))?.series;
    }

    /** A failed initial load remains in Error state so a workspace can expose retry/remove. */
    async add(request: CompareAddRequest): Promise<CompareInstrumentSnapshot> {
        this.assertAlive();
        const normalized = normalizeRequest(request);
        const id = normalized.id ?? this.availableId(normalized.symbol, normalized.resolution);
        if (this.entries.has(id)) throw new Error(`sschart: duplicate compare id '${id}'`);
        const color = normalized.color ?? this.colors[this.nextColor % this.colors.length];
        const visible = normalized.visible ?? true;
        const series = this.chart.addSeries(LineSeries, {
            ...this.seriesOptions,
            id: `compare:${id}`,
            persist: false,
            priceScaleId: this.scaleIdValue,
            color,
            visible,
            lineWidth: this.seriesOptions.lineWidth ?? 2,
            priceLineVisible: this.seriesOptions.priceLineVisible ?? false,
            lastValueVisible: this.seriesOptions.lastValueVisible ?? true,
        });
        let data: ChartDataController<LineData, SeriesOptions>;
        try {
            data = new ChartDataController({
                ...this.dataOptions,
                chart: this.chart,
                series,
                dataSource: new CompareDataSource(this.dataSource, this.valueAccessor),
                applySymbolTradingSchedule: false,
            });
        } catch (error) {
            this.chart.removeSeries(series);
            throw error;
        }
        const entry: CompareEntry = {
            id,
            symbol: normalized.symbol,
            resolution: normalized.resolution,
            requestedLabel: normalized.label ?? null,
            series,
            data,
            listener: () => {},
            color,
            visible,
            calendar: null,
        };
        entry.listener = (state: ChartDataControllerSnapshot): void => {
            if (state.status === ChartDataStatus.Loading) {
                entry.calendar = state.symbolInfo?.tradingSchedule === undefined
                    ? null
                    : new TradingCalendar(state.symbolInfo.tradingSchedule);
            }
            if (entry.id === this.primaryIdValue) this.applyAlignment();
            this.emit();
        };
        data.subscribe(entry.listener);
        this.entries.set(id, entry);
        this.nextColor++;
        if (this.primaryIdValue === null || normalized.primary === true) this.primaryIdValue = id;
        this.applyScaleMode();
        this.applyAlignment();
        this.emit();
        await data.setSelection({ symbol: normalized.symbol, resolution: normalized.resolution });
        return this.instrumentSnapshot(entry);
    }

    remove(id: string): boolean {
        this.assertAlive();
        const normalized = identifier(id, 'compare id');
        const entry = this.entries.get(normalized);
        if (entry === undefined) return false;
        this.entries.delete(normalized);
        entry.data.unsubscribe(entry.listener);
        entry.data.dispose();
        this.chart.removeSeries(entry.series);
        if (this.primaryIdValue === normalized)
            this.primaryIdValue = this.entries.keys().next().value ?? null;
        if (this.entries.size === 0) {
            this.restoreAlignment();
            this.chart.priceScale(this.scaleIdValue).applyOptions({ mode: this.originalScaleMode });
        } else {
            this.applyAlignment();
        }
        this.emit();
        return true;
    }

    setPrimary(id: string): void {
        this.assertAlive();
        const normalized = this.requireEntry(id).id;
        if (this.primaryIdValue === normalized) return;
        this.primaryIdValue = normalized;
        this.applyAlignment();
        this.emit();
    }

    setMode(mode: CompareMode): void {
        this.assertAlive();
        const normalized = normalizeMode(mode);
        if (this.modeValue === normalized) return;
        this.modeValue = normalized;
        this.applyScaleMode();
        this.emit();
    }

    setAlignment(alignment: CompareAlignment): void {
        this.assertAlive();
        const normalized = normalizeAlignment(alignment);
        if (this.alignmentValue === normalized) return;
        this.alignmentValue = normalized;
        this.applyAlignment();
        this.emit();
    }

    setColor(id: string, color: string): void {
        this.assertAlive();
        const entry = this.requireEntry(id);
        const normalized = cssValue(color, 'compare color');
        if (entry.color === normalized) return;
        entry.color = normalized;
        entry.series.applyOptions({ color: normalized });
        this.emit();
    }

    setVisible(id: string, visible: boolean): void {
        this.assertAlive();
        const entry = this.requireEntry(id);
        if (typeof visible !== 'boolean')
            throw new TypeError('sschart: compare visibility must be boolean');
        if (entry.visible === visible) return;
        entry.visible = visible;
        entry.series.applyOptions({ visible });
        this.emit();
    }

    reload(id: string): Promise<SymbolInfo | null> {
        this.assertAlive();
        return this.requireEntry(id).data.reload();
    }

    loadMoreBefore(id: string): Promise<number> {
        this.assertAlive();
        return this.requireEntry(id).data.loadMoreBefore();
    }

    legend(time: Time | null = this.crosshairTimeValue): readonly CompareLegendItem[] {
        this.assertAlive();
        return this.buildLegend(time);
    }

    subscribe(listener: CompareControllerListener): void {
        this.assertAlive();
        if (typeof listener !== 'function')
            throw new TypeError('sschart: compare listener must be a function');
        this.listeners.add(listener);
    }

    unsubscribe(listener: CompareControllerListener): void {
        this.listeners.delete(listener);
    }

    dispose(): void {
        if (this.disposed) return;
        this.chart.unsubscribeCrosshairMove(this.handleCrosshair);
        for (const entry of this.entries.values()) {
            entry.data.unsubscribe(entry.listener);
            entry.data.dispose();
            this.chart.removeSeries(entry.series);
        }
        this.entries.clear();
        this.restoreAlignment();
        this.chart.priceScale(this.scaleIdValue).applyOptions({ mode: this.originalScaleMode });
        this.disposed = true;
        this.listeners.clear();
    }

    private snapshotValue(): CompareControllerSnapshot {
        return Object.freeze({
            mode: this.modeValue,
            alignment: this.alignmentValue,
            scaleId: this.scaleIdValue,
            primaryId: this.primaryIdValue,
            crosshairTime: this.crosshairTimeValue,
            instruments: Object.freeze([...this.entries.values()].map(
                entry => this.instrumentSnapshot(entry),
            )),
            legend: this.buildLegend(this.crosshairTimeValue),
        });
    }

    private buildLegend(time: Time | null): readonly CompareLegendItem[] {
        const range = this.chart.timeScale().getVisibleRange();
        return Object.freeze([...this.entries.values()].map((entry) => {
            const points = entry.series.data();
            const point = time === null
                ? lastPoint(points)
                : pointAtTime(points, time);
            const rawValue = point?.value ?? null;
            const base = referenceValue(points, range?.from, range?.to);
            const changePercent = relativeValue(rawValue, base, false);
            const indexedTo100 = relativeValue(rawValue, base, true);
            return Object.freeze({
                id: entry.id,
                symbol: entry.symbol,
                label: this.label(entry),
                color: entry.color,
                time: point?.time ?? null,
                rawValue,
                changePercent,
                indexedTo100,
                displayValue: this.modeValue === CompareMode.Percentage
                    ? changePercent : indexedTo100,
            });
        }));
    }

    private instrumentSnapshot(entry: CompareEntry): CompareInstrumentSnapshot {
        const state = entry.data.snapshot();
        const last = lastPoint(entry.series.data());
        return Object.freeze({
            id: entry.id,
            symbol: entry.symbol,
            resolution: entry.resolution,
            label: this.label(entry),
            color: entry.color,
            visible: entry.visible,
            primary: entry.id === this.primaryIdValue,
            status: state.status,
            realtimeStatus: state.realtimeStatus,
            symbolInfo: state.symbolInfo,
            loadedBars: state.loadedBars,
            renderedBars: state.renderedBars,
            lastValue: last?.value ?? null,
            error: state.error ?? state.realtimeError ?? state.historyError,
        });
    }

    private label(entry: CompareEntry): string {
        const info = entry.data.snapshot().symbolInfo;
        return entry.requestedLabel
            ?? info?.name
            ?? info?.ticker
            ?? info?.id
            ?? entry.symbol;
    }

    private applyScaleMode(): void {
        if (this.entries.size === 0) return;
        this.chart.priceScale(this.scaleIdValue).applyOptions({ mode: this.modeValue });
    }

    private applyAlignment(): void {
        if (this.entries.size === 0 || this.alignmentValue === CompareAlignment.Chart) {
            this.restoreAlignment();
            return;
        }
        const primary = this.primaryIdValue === null
            ? undefined : this.entries.get(this.primaryIdValue);
        if (primary?.calendar === null || primary === undefined) {
            this.restoreAlignment();
            return;
        }
        if (this.alignedCalendar === primary.calendar) return;
        const schedule = primary.calendar.schedule();
        this.chart.applyOptions({
            timeScale: {
                ...this.originalTimeScale,
                mode: TimeScaleMode.SessionAware,
                ordinal: undefined,
                calendar: primary.calendar,
                timeZone: schedule.timeZone,
            },
        });
        this.alignedCalendar = primary.calendar;
    }

    private restoreAlignment(): void {
        if (this.alignedCalendar === null) return;
        this.chart.applyOptions({ timeScale: this.originalTimeScale });
        this.alignedCalendar = null;
    }

    private requireEntry(id: string): CompareEntry {
        const normalized = identifier(id, 'compare id');
        const entry = this.entries.get(normalized);
        if (entry === undefined) throw new RangeError(`sschart: unknown compare id '${normalized}'`);
        return entry;
    }

    private availableId(symbol: string, resolution: string): string {
        const base = `${symbol}@${resolution}`;
        if (!this.entries.has(base)) return base;
        let suffix = 2;
        while (this.entries.has(`${base}#${suffix}`)) suffix++;
        return `${base}#${suffix}`;
    }

    private emit(): void {
        if (this.disposed) return;
        const snapshot = this.snapshotValue();
        for (const listener of this.listeners) {
            try { listener(snapshot); } catch { /* observers cannot break data subscriptions */ }
        }
    }

    private assertAlive(): void {
        if (this.disposed) throw new Error('sschart: compare controller is disposed');
    }
}

class CompareDataSource<TBar extends TimedSeriesData> implements IChartDataSource<LineData> {
    constructor(
        private readonly source: IChartDataSource<TBar>,
        private readonly valueAccessor: CompareValueAccessor<TBar>,
    ) {}

    resolveSymbol(request: ResolveSymbolRequest, signal: AbortSignal): Promise<SymbolInfo> {
        return this.source.resolveSymbol(request, signal);
    }

    async getBars(request: BarsRequest, signal: AbortSignal): Promise<BarsPage<LineData>> {
        const page = await this.source.getBars(request, signal);
        return Object.freeze({
            ...page,
            bars: Object.freeze(page.bars.flatMap(bar => {
                const point = this.point(bar);
                return point === null ? [] : [point];
            })),
        });
    }

    subscribeBars(
        request: BarsSubscription,
        listener: (update: BarUpdate<LineData>) => void,
        errorListener?: (error: unknown) => void,
    ): Unsubscribe {
        return this.source.subscribeBars(request, (update) => {
            try {
                const bar = this.point(update.bar);
                if (bar !== null) listener(Object.freeze({ bar, isFinal: update.isFinal }));
            } catch (error) {
                if (errorListener !== undefined) errorListener(error);
                else throw error;
            }
        }, errorListener);
    }

    private point(bar: TBar): LineData | null {
        const value = this.valueAccessor(bar);
        if (value === null) return null;
        if (typeof value !== 'number' || !Number.isFinite(value))
            throw new TypeError('sschart: compare valueAccessor must return a finite number or null');
        return Object.freeze({ time: bar.time, value });
    }
}

function defaultValueAccessor<TBar extends TimedSeriesData>(bar: TBar): number | null {
    const value = (bar as TBar & { close?: unknown; value?: unknown }).close
        ?? (bar as TBar & { value?: unknown }).value;
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new TypeError('sschart: compare bars require a finite close or value');
    return value;
}

function pointAtTime(points: readonly LineData[], time: Time): LineData | null {
    const index = lowerBound(points, time);
    return index < points.length && points[index].time === time ? points[index] : null;
}

function lastPoint(points: readonly LineData[]): LineData | null {
    return points.length === 0 ? null : points[points.length - 1];
}

function referenceValue(
    points: readonly LineData[],
    from: Time | undefined,
    to: Time | undefined,
): number | null {
    if (from !== undefined && to !== undefined) {
        let index = lowerBound(points, from);
        for (; index < points.length; index++) {
            const point = points[index];
            if (point.time > to) break;
            if (point.value > 0 && Number.isFinite(point.value)) return point.value;
        }
    }
    for (const point of points) {
        if (point.value > 0 && Number.isFinite(point.value)) return point.value;
    }
    return null;
}

function lowerBound(points: readonly LineData[], time: Time): number {
    let low = 0;
    let high = points.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (points[middle].time < time) low = middle + 1;
        else high = middle;
    }
    return low;
}

function relativeValue(value: number | null, base: number | null, indexed: boolean): number | null {
    if (value === null || base === null || base === 0) return null;
    const result = indexed ? value / base * 100 : (value / base - 1) * 100;
    return Number.isFinite(result) ? result : null;
}

function normalizeRequest(value: CompareAddRequest): Required<
    Pick<CompareAddRequest, 'symbol' | 'resolution'>
> & Omit<CompareAddRequest, 'symbol' | 'resolution'> {
    if (!plainObject(value)) throw new TypeError('sschart: compare add request is required');
    if (value.visible !== undefined && typeof value.visible !== 'boolean')
        throw new TypeError('sschart: compare visibility must be boolean');
    if (value.primary !== undefined && typeof value.primary !== 'boolean')
        throw new TypeError('sschart: compare primary must be boolean');
    return Object.freeze({
        ...value,
        ...(value.id === undefined ? {} : { id: identifier(value.id, 'compare id') }),
        symbol: identifier(value.symbol, 'compare symbol'),
        resolution: identifier(value.resolution, 'compare resolution'),
        ...(value.label === undefined ? {} : { label: identifier(value.label, 'compare label') }),
        ...(value.color === undefined ? {} : { color: cssValue(value.color, 'compare color') }),
    });
}

function normalizeMode(value: CompareMode): CompareMode {
    if (!MODES.has(value)) throw new RangeError('sschart: compare mode is invalid');
    return value as CompareMode;
}

function normalizeAlignment(value: CompareAlignment): CompareAlignment {
    if (!ALIGNMENTS.has(value)) throw new RangeError('sschart: compare alignment is invalid');
    return value;
}

function normalizeColors(values: readonly string[]): readonly string[] {
    if (!Array.isArray(values) || values.length === 0)
        throw new TypeError('sschart: compare colors must be a non-empty array');
    return Object.freeze(values.map((value, index) => cssValue(value, `compare color ${index}`)));
}

function normalizeDataOptions(value: CompareDataOptions): CompareDataOptions {
    if (!plainObject(value)) throw new TypeError('sschart: compare data options must be an object');
    const allowed = new Set([
        'initialCount', 'historyCount', 'historyPrefetchThreshold', 'autoPrefetch',
        'lodCacheSize', 'autoScrollRealtime', 'reconnectPolicy', 'realtimeScheduler',
    ]);
    for (const key of Object.keys(value)) {
        if (!allowed.has(key))
            throw new TypeError(`sschart: compare data option '${key}' is unsupported`);
    }
    return Object.freeze({ ...value });
}

function identifier(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: ${name} must be a non-empty string`);
    return value.trim();
}

function cssValue(value: unknown, name: string): string {
    return identifier(value, name);
}

function plainObject(value: unknown): value is Readonly<Record<string, any>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function validDataSource<TBar extends TimedSeriesData>(value: unknown): value is IChartDataSource<TBar> {
    return value !== null && typeof value === 'object'
        && typeof (value as IChartDataSource<TBar>).resolveSymbol === 'function'
        && typeof (value as IChartDataSource<TBar>).getBars === 'function'
        && typeof (value as IChartDataSource<TBar>).subscribeBars === 'function';
}

function validChart(value: unknown): value is IChartApi {
    return value !== null && typeof value === 'object'
        && typeof (value as IChartApi).addSeries === 'function'
        && typeof (value as IChartApi).removeSeries === 'function'
        && typeof (value as IChartApi).priceScale === 'function'
        && typeof (value as IChartApi).timeScale === 'function'
        && typeof (value as IChartApi).options === 'function'
        && typeof (value as IChartApi).applyOptions === 'function'
        && typeof (value as IChartApi).subscribeCrosshairMove === 'function'
        && typeof (value as IChartApi).unsubscribeCrosshairMove === 'function';
}
