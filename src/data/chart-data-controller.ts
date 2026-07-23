import type {
    IChartApi,
    ISeriesApi,
    LogicalRange,
    SeriesOptions,
    TimedSeriesData,
} from '../core/chart-api.js';
import { SeriesStore } from '../core/model/series-store.js';
import type {
    BarUpdate,
    IChartDataSource,
    SymbolInfo,
    Unsubscribe,
} from './data-source.js';
import { normalizeBarsPage } from './bar-normalization.js';
import {
    ChartDataStore,
    type ChartDataViewBuilder,
    type ChartDataViewContext,
    type ChartDataViewUpdater,
} from './chart-data-store.js';
import type { LodCacheSnapshot } from './lod-cache.js';
import {
    RealtimeReconnectBackoff,
    defaultRealtimeScheduler,
    type RealtimeReconnectPolicy,
    type RealtimeScheduler,
} from './reconnect-policy.js';
import {
    DataRequestCoordinator,
    type DataRequestTicket,
} from './data-request-coordinator.js';
import { TradingCalendar } from '../time/trading-calendar-engine.js';

export const ChartDataStatus = Object.freeze({
    Idle: 'idle',
    Resolving: 'resolving',
    Loading: 'loading',
    Ready: 'ready',
    Error: 'error',
    Disposed: 'disposed',
} as const);
export type ChartDataStatus = typeof ChartDataStatus[keyof typeof ChartDataStatus];

export const RealtimeStatus = Object.freeze({
    Disconnected: 'disconnected',
    Connecting: 'connecting',
    Connected: 'connected',
    Reconnecting: 'reconnecting',
    Error: 'error',
} as const);
export type RealtimeStatus = typeof RealtimeStatus[keyof typeof RealtimeStatus];

export interface ChartDataSelection {
    readonly symbol: string;
    readonly resolution: string;
}

export interface ChartDataControllerSnapshot {
    readonly status: ChartDataStatus;
    readonly generation: number;
    readonly selection: ChartDataSelection | null;
    readonly symbolInfo: SymbolInfo | null;
    readonly loadedBars: number;
    readonly renderedBars: number;
    readonly groupingLevel: number;
    readonly realtimeStatus: RealtimeStatus;
    readonly realtimeUpdates: number;
    readonly realtimeError: unknown | null;
    readonly reconnectAttempt: number;
    readonly nextReconnectDelayMs: number | null;
    readonly hasMoreBefore: boolean;
    readonly hasMoreAfter: boolean;
    readonly loadingHistory: boolean;
    readonly historyError: unknown | null;
    readonly error: unknown | null;
}

export type ChartDataControllerListener = (snapshot: ChartDataControllerSnapshot) => void;

export interface ChartDataControllerOptions<
    TBar extends TimedSeriesData,
    TSeriesOptions extends SeriesOptions = SeriesOptions,
> {
    readonly chart: IChartApi;
    readonly series: ISeriesApi<TBar, TSeriesOptions>;
    readonly dataSource: IChartDataSource<TBar>;
    readonly initialCount?: number;
    readonly historyCount?: number;
    readonly historyPrefetchThreshold?: number;
    readonly autoPrefetch?: boolean;
    readonly viewBuilder?: ChartDataViewBuilder<TBar>;
    readonly viewUpdater?: ChartDataViewUpdater<TBar>;
    readonly initialGroupingLevel?: number;
    readonly lodCacheSize?: number;
    readonly autoScrollRealtime?: boolean;
    /** Applies SymbolInfo.tradingSchedule to the chart without changing the time-scale mode. */
    readonly applySymbolTradingSchedule?: boolean;
    readonly reconnectPolicy?: RealtimeReconnectPolicy;
    readonly realtimeScheduler?: RealtimeScheduler;
}

interface ActiveLoad {
    readonly key: string;
    readonly promise: Promise<SymbolInfo | null>;
}

/**
 * Optional adapter between an imperative series and an asynchronous datafeed.
 * Manual series.setData/update use remains independent of this controller.
 */
export class ChartDataController<
    TBar extends TimedSeriesData,
    TSeriesOptions extends SeriesOptions = SeriesOptions,
> {
    private readonly coordinator = new DataRequestCoordinator();
    private readonly listeners = new Set<ChartDataControllerListener>();
    private readonly initialCount: number;
    private readonly historyCount: number;
    private readonly historyPrefetchThreshold: number;
    private readonly autoPrefetch: boolean;
    private readonly dataStore: ChartDataStore<TBar>;
    private readonly renderedStore = new SeriesStore<TBar>();
    private groupingLevelValue: number;
    private readonly autoScrollRealtime: boolean;
    private readonly applySymbolTradingSchedule: boolean;
    private symbolTradingCalendarApplied = false;
    private readonly reconnectBackoff: RealtimeReconnectBackoff;
    private readonly realtimeScheduler: RealtimeScheduler;
    private realtimeUnsubscribe: Unsubscribe | null = null;
    private realtimeTicket: DataRequestTicket | null = null;
    private reconnectTimer: unknown | null = null;
    private activeLoad: ActiveLoad | null = null;
    private historyLoad: Promise<number> | null = null;
    private currentTicket: DataRequestTicket | null = null;
    private currentSelection: ChartDataSelection | null = null;
    private currentSymbolInfo: SymbolInfo | null = null;
    private state: ChartDataControllerSnapshot = freezeSnapshot({
        status: ChartDataStatus.Idle,
        generation: 0,
        selection: null,
        symbolInfo: null,
        loadedBars: 0,
        renderedBars: 0,
        groupingLevel: 1,
        realtimeStatus: RealtimeStatus.Disconnected,
        realtimeUpdates: 0,
        realtimeError: null,
        reconnectAttempt: 0,
        nextReconnectDelayMs: null,
        hasMoreBefore: false,
        hasMoreAfter: false,
        loadingHistory: false,
        historyError: null,
        error: null,
    });
    private disposed = false;
    private readonly visibleRangeListener = (range: LogicalRange | null): void => {
        if (!this.autoPrefetch || range === null) return;
        void this.prefetchForRange(range).catch(() => { /* exposed through historyError */ });
    };

    constructor(private readonly options: ChartDataControllerOptions<TBar, TSeriesOptions>) {
        if (options === null || typeof options !== 'object')
            throw new TypeError('sschart: chart data controller options are required');
        if (options.chart === null || typeof options.chart !== 'object')
            throw new TypeError('sschart: chart data controller requires a chart');
        if (options.series === null || typeof options.series !== 'object')
            throw new TypeError('sschart: chart data controller requires a series');
        if (options.dataSource === null || typeof options.dataSource !== 'object')
            throw new TypeError('sschart: chart data controller requires a data source');
        this.initialCount = positiveInteger(options.initialCount, 500, 'initialCount');
        this.historyCount = positiveInteger(options.historyCount, this.initialCount, 'historyCount');
        this.historyPrefetchThreshold = nonNegativeInteger(
            options.historyPrefetchThreshold,
            30,
            'historyPrefetchThreshold',
        );
        this.autoPrefetch = options.autoPrefetch ?? true;
        if (typeof this.autoPrefetch !== 'boolean')
            throw new TypeError('sschart: chart data autoPrefetch must be boolean');
        this.dataStore = new ChartDataStore({
            viewBuilder: options.viewBuilder,
            viewUpdater: options.viewUpdater,
            lodCacheSize: positiveInteger(options.lodCacheSize, 8, 'lodCacheSize'),
        });
        this.autoScrollRealtime = options.autoScrollRealtime ?? false;
        if (typeof this.autoScrollRealtime !== 'boolean')
            throw new TypeError('sschart: chart data autoScrollRealtime must be boolean');
        this.applySymbolTradingSchedule = options.applySymbolTradingSchedule ?? true;
        if (typeof this.applySymbolTradingSchedule !== 'boolean') {
            throw new TypeError(
                'sschart: chart data applySymbolTradingSchedule must be boolean',
            );
        }
        this.realtimeScheduler = normalizeScheduler(
            options.realtimeScheduler ?? defaultRealtimeScheduler(),
        );
        this.reconnectBackoff = new RealtimeReconnectBackoff(
            options.reconnectPolicy,
            () => this.realtimeScheduler.random(),
        );
        this.groupingLevelValue = positiveInteger(
            options.initialGroupingLevel,
            1,
            'initialGroupingLevel',
        );
        if (this.groupingLevelValue > 1 && !this.dataStore.hasViewBuilder) {
            throw new Error('sschart: a data viewBuilder is required for grouped chart data');
        }
        this.state = freezeSnapshot({
            ...this.state,
            groupingLevel: this.groupingLevelValue,
        });
        options.chart.timeScale().subscribeVisibleLogicalRangeChange(this.visibleRangeListener);
    }

    snapshot(): ChartDataControllerSnapshot { return this.state; }
    rawData(): readonly TBar[] { return this.dataStore.raw(); }
    /** Immutable half-open raw-data window without copying the complete history. */
    rawDataSlice(fromIndex = 0, toIndex = this.dataStore.length): readonly TBar[] {
        this.assertAlive();
        return this.dataStore.rawSlice(fromIndex, toIndex);
    }
    renderedData(): readonly TBar[] {
        return Object.freeze(this.renderedStore.snapshot());
    }
    groupingLevel(): number { return this.groupingLevelValue; }
    lodCacheSnapshot(): LodCacheSnapshot { return this.dataStore.lodCacheSnapshot(); }

    setGroupingLevel(level: number): void {
        this.assertAlive();
        const normalized = positiveInteger(level, 1, 'groupingLevel');
        if (normalized > 1 && !this.dataStore.hasViewBuilder)
            throw new Error('sschart: a data viewBuilder is required for grouped chart data');
        if (normalized === this.groupingLevelValue) return;
        let renderedBars = 0;
        if (this.state.status === ChartDataStatus.Ready) {
            const context = this.viewContext(normalized);
            if (context !== null) {
                const view = this.dataStore.view(context);
                this.options.series.setData(view);
                this.renderedStore.replace(view);
                renderedBars = view.length;
            }
        }
        this.groupingLevelValue = normalized;
        this.setState({ groupingLevel: normalized, renderedBars });
    }

    subscribe(listener: ChartDataControllerListener): void {
        this.assertAlive();
        if (typeof listener !== 'function')
            throw new TypeError('sschart: chart data listener must be a function');
        this.listeners.add(listener);
    }

    unsubscribe(listener: ChartDataControllerListener): void { this.listeners.delete(listener); }

    setSelection(selection: ChartDataSelection): Promise<SymbolInfo | null> {
        this.assertAlive();
        const normalized = normalizeSelection(selection);
        const key = selectionKey(normalized);
        if (this.activeLoad?.key === key) return this.activeLoad.promise;
        if (selectionKey(this.currentSelection) === key
            && this.state.status === ChartDataStatus.Ready) {
            return Promise.resolve(this.currentSymbolInfo);
        }
        return this.startLoad(normalized, key);
    }

    reload(): Promise<SymbolInfo | null> {
        this.assertAlive();
        if (this.currentSelection === null)
            throw new Error('sschart: cannot reload before selecting a symbol and resolution');
        return this.startLoad(this.currentSelection, selectionKey(this.currentSelection));
    }

    loadMoreBefore(): Promise<number> {
        this.assertAlive();
        if (this.historyLoad !== null) return this.historyLoad;
        if (this.state.status !== ChartDataStatus.Ready || !this.state.hasMoreBefore
            || this.currentTicket === null || !this.coordinator.isCurrent(this.currentTicket)) {
            return Promise.resolve(0);
        }
        const ticket = this.currentTicket;
        const promise = this.loadHistory(ticket);
        this.historyLoad = promise;
        void promise.finally(() => {
            if (this.historyLoad === promise) this.historyLoad = null;
        }).catch(() => { /* the caller observes the original promise */ });
        return promise;
    }

    cancel(): void {
        this.assertAlive();
        this.stopRealtime(false);
        this.activeLoad = null;
        this.historyLoad = null;
        this.currentTicket = null;
        this.coordinator.cancel();
        this.setState({
            status: ChartDataStatus.Idle,
            loadingHistory: false,
            historyError: null,
            realtimeStatus: RealtimeStatus.Disconnected,
            realtimeError: null,
            reconnectAttempt: 0,
            nextReconnectDelayMs: null,
            error: null,
        });
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.stopRealtime(false);
        this.activeLoad = null;
        this.historyLoad = null;
        this.currentTicket = null;
        this.options.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.visibleRangeListener);
        this.coordinator.dispose();
        this.state = freezeSnapshot({
            ...this.state,
            status: ChartDataStatus.Disposed,
            loadingHistory: false,
            historyError: null,
            realtimeStatus: RealtimeStatus.Disconnected,
            realtimeError: null,
            reconnectAttempt: 0,
            nextReconnectDelayMs: null,
            error: null,
        });
        this.emit();
        this.listeners.clear();
    }

    private startLoad(selection: ChartDataSelection, key: string): Promise<SymbolInfo | null> {
        this.stopRealtime(false);
        const ticket = this.coordinator.begin();
        this.historyLoad = null;
        this.currentTicket = ticket;
        this.currentSelection = selection;
        this.currentSymbolInfo = null;
        this.dataStore.clear();
        this.renderedStore.replace([]);
        this.setState({
            status: ChartDataStatus.Resolving,
            generation: ticket.generation,
            selection,
            symbolInfo: null,
            loadedBars: 0,
            renderedBars: 0,
            groupingLevel: this.groupingLevelValue,
            realtimeStatus: RealtimeStatus.Disconnected,
            realtimeUpdates: 0,
            realtimeError: null,
            reconnectAttempt: 0,
            nextReconnectDelayMs: null,
            hasMoreBefore: false,
            hasMoreAfter: false,
            loadingHistory: false,
            historyError: null,
            error: null,
        });
        const promise = this.load(ticket, selection);
        this.activeLoad = { key, promise };
        void promise.finally(() => {
            if (this.activeLoad?.promise === promise) this.activeLoad = null;
        }).catch(() => { /* the caller observes the original promise */ });
        return promise;
    }

    private async load(
        ticket: DataRequestTicket,
        selection: ChartDataSelection,
    ): Promise<SymbolInfo | null> {
        try {
            const resolvedSymbol = normalizeSymbolInfo(await this.options.dataSource.resolveSymbol(
                { symbol: selection.symbol },
                ticket.signal,
            ));
            const symbolInfo = resolvedSymbol.info;
            if (!this.coordinator.isCurrent(ticket)) return null;
            this.setState({ status: ChartDataStatus.Loading, symbolInfo });

            const page = normalizeBarsPage(await this.options.dataSource.getBars({
                symbol: symbolInfo.id,
                resolution: selection.resolution,
                countBack: this.initialCount,
            }, ticket.signal));
            if (!this.coordinator.isCurrent(ticket)) return null;

            this.applyTradingCalendar(resolvedSymbol.calendar);
            if (symbolInfo.priceFormat !== undefined) {
                this.options.series.applyOptions({
                    priceFormat: symbolInfo.priceFormat,
                } as Partial<TSeriesOptions>);
            }
            this.currentSymbolInfo = symbolInfo;
            this.dataStore.replace(page.bars);
            const renderedBars = this.applyRenderView();
            this.setState({
                status: ChartDataStatus.Ready,
                symbolInfo,
                loadedBars: this.dataStore.length,
                renderedBars,
                hasMoreBefore: page.hasMoreBefore,
                hasMoreAfter: page.hasMoreAfter === true,
                loadingHistory: false,
                historyError: null,
                realtimeStatus: RealtimeStatus.Disconnected,
                realtimeUpdates: 0,
                realtimeError: null,
                error: null,
            });
            this.startRealtime(ticket, selection, symbolInfo);
            if (this.autoPrefetch) {
                const range = this.options.chart.timeScale().getVisibleLogicalRange();
                if (range !== null)
                    void this.prefetchForRange(range).catch(() => { /* state contains the failure */ });
            }
            return symbolInfo;
        } catch (error) {
            if (!this.coordinator.isCurrent(ticket) || ticket.signal.aborted) return null;
            this.setState({ status: ChartDataStatus.Error, error });
            throw error;
        }
    }

    private applyTradingCalendar(calendar: TradingCalendar | null): void {
        if (!this.applySymbolTradingSchedule) return;
        if (calendar !== null) {
            this.options.chart.applyOptions({ timeScale: { calendar } });
            this.symbolTradingCalendarApplied = true;
        } else if (this.symbolTradingCalendarApplied) {
            this.options.chart.applyOptions({ timeScale: { calendar: undefined } });
            this.symbolTradingCalendarApplied = false;
        }
    }

    private async prefetchForRange(range: LogicalRange): Promise<number> {
        if (this.state.status !== ChartDataStatus.Ready || !this.state.hasMoreBefore) return 0;
        const info = this.options.series.barsInLogicalRange(range);
        if (info === null || info.barsBefore > this.historyPrefetchThreshold) return 0;
        return this.loadMoreBefore();
    }

    private async loadHistory(ticket: DataRequestTicket): Promise<number> {
        const selection = this.currentSelection;
        const symbolInfo = this.currentSymbolInfo;
        const first = this.dataStore.first;
        if (selection === null || symbolInfo === null || first === undefined) return 0;
        this.setState({ loadingHistory: true, historyError: null });
        try {
            const page = normalizeBarsPage(await this.options.dataSource.getBars({
                symbol: symbolInfo.id,
                resolution: selection.resolution,
                to: first.time,
                countBack: this.historyCount,
            }, ticket.signal));
            if (!this.coordinator.isCurrent(ticket)) return 0;
            const newest = page.bars[page.bars.length - 1];
            if (newest !== undefined && newest.time > first.time) {
                throw new RangeError(
                    'sschart: history page contains bars newer than the current first bar',
                );
            }
            const hasOlderBar = page.bars.some((bar) => bar.time < first.time);
            if (!hasOlderBar && page.hasMoreBefore) {
                throw new Error('sschart: history page made no backward progress');
            }

            const beforeLength = this.dataStore.length;
            if (page.bars.length > 0) this.dataStore.prepend(page.bars);
            const loadedBars = this.dataStore.length;
            const renderedBars = this.applyRenderView();
            this.setState({
                loadedBars,
                renderedBars,
                hasMoreBefore: page.hasMoreBefore,
                loadingHistory: false,
                historyError: null,
            });
            return Math.max(0, loadedBars - beforeLength);
        } catch (error) {
            if (!this.coordinator.isCurrent(ticket) || ticket.signal.aborted) return 0;
            this.setState({ loadingHistory: false, historyError: error });
            throw error;
        }
    }

    private viewContext(groupingLevel = this.groupingLevelValue): ChartDataViewContext | null {
        if (this.currentSelection === null) return null;
        return Object.freeze({
            symbol: this.currentSymbolInfo?.id ?? this.currentSelection.symbol,
            resolution: this.currentSelection.resolution,
            groupingLevel,
        });
    }

    private applyRenderView(): number {
        const context = this.viewContext();
        if (context === null) return 0;
        const view = this.dataStore.view(context);
        this.options.series.setData(view);
        this.renderedStore.replace(view);
        return view.length;
    }

    private startRealtime(
        ticket: DataRequestTicket,
        selection: ChartDataSelection,
        symbolInfo: SymbolInfo,
        resetBackoff = true,
    ): void {
        if (!this.coordinator.isCurrent(ticket)) return;
        if (resetBackoff) {
            this.clearReconnectTimer();
            this.reconnectBackoff.reset();
        }
        this.realtimeTicket = ticket;
        this.setState({
            realtimeStatus: RealtimeStatus.Connecting,
            realtimeError: null,
            reconnectAttempt: this.reconnectBackoff.attemptCount,
            nextReconnectDelayMs: null,
        });
        let failedSynchronously = false;
        try {
            const unsubscribe = this.options.dataSource.subscribeBars(
                { symbol: symbolInfo.id, resolution: selection.resolution },
                (update) => this.handleRealtimeUpdate(ticket, update),
                (error) => {
                    failedSynchronously = this.realtimeUnsubscribe === null;
                    this.handleRealtimeError(ticket, error);
                },
            );
            if (typeof unsubscribe !== 'function')
                throw new TypeError('sschart: data source subscribeBars must return an unsubscribe function');
            if (!this.coordinator.isCurrent(ticket) || failedSynchronously
                || this.state.realtimeStatus === RealtimeStatus.Error) {
                try { unsubscribe(); } catch { /* stale subscription cleanup */ }
                if (this.realtimeTicket === ticket) this.realtimeTicket = null;
                return;
            }
            this.realtimeUnsubscribe = once(unsubscribe);
            this.reconnectBackoff.reset();
            this.setState({
                realtimeStatus: RealtimeStatus.Connected,
                realtimeError: null,
                reconnectAttempt: 0,
                nextReconnectDelayMs: null,
            });
        } catch (error) {
            if (!this.coordinator.isCurrent(ticket)) return;
            if (this.realtimeTicket === ticket) this.realtimeTicket = null;
            this.scheduleRealtimeReconnect(ticket, error);
        }
    }

    private handleRealtimeUpdate(ticket: DataRequestTicket, update: BarUpdate<TBar>): void {
        if (!this.coordinator.isCurrent(ticket) || this.realtimeTicket !== ticket) return;
        try {
            if (update === null || typeof update !== 'object'
                || update.bar === null || typeof update.bar !== 'object') {
                throw new TypeError('sschart: data source returned an invalid realtime update');
            }
            const context = this.viewContext();
            if (context === null) return;
            const result = this.dataStore.updateView(update.bar, context);
            if (result === null) return;

            let renderedBars: number;
            if (result.viewBar === null) renderedBars = this.applyRenderView();
            else {
                const renderedChange = this.renderedStore.update(result.viewBar);
                if (renderedChange === null) renderedBars = this.applyRenderView();
                else {
                    this.options.series.update(result.viewBar);
                    renderedBars = this.renderedStore.length;
                }
            }
            this.setState({
                loadedBars: this.dataStore.length,
                renderedBars,
                realtimeUpdates: this.state.realtimeUpdates + 1,
                realtimeStatus: RealtimeStatus.Connected,
                realtimeError: null,
            });
            if (this.autoScrollRealtime && result.change.kind === 'append')
                this.options.chart.timeScale().scrollToRealTime();
        } catch (error) {
            if (!this.coordinator.isCurrent(ticket)) return;
            this.stopRealtime(false);
            this.setState({
                realtimeStatus: RealtimeStatus.Error,
                realtimeError: error,
                reconnectAttempt: 0,
                nextReconnectDelayMs: null,
            });
        }
    }

    private handleRealtimeError(ticket: DataRequestTicket, error: unknown): void {
        if (!this.coordinator.isCurrent(ticket) || this.realtimeTicket !== ticket) return;
        this.scheduleRealtimeReconnect(ticket, error);
    }

    private scheduleRealtimeReconnect(ticket: DataRequestTicket, error: unknown): void {
        if (!this.coordinator.isCurrent(ticket)) return;
        this.stopRealtime(false, false);
        let reconnect;
        try { reconnect = this.reconnectBackoff.next(); }
        catch (scheduleError) {
            this.setState({
                realtimeStatus: RealtimeStatus.Error,
                realtimeError: scheduleError,
                reconnectAttempt: this.reconnectBackoff.attemptCount,
                nextReconnectDelayMs: null,
            });
            return;
        }
        if (reconnect === null) {
            this.setState({
                realtimeStatus: RealtimeStatus.Error,
                realtimeError: error,
                reconnectAttempt: this.reconnectBackoff.attemptCount,
                nextReconnectDelayMs: null,
            });
            return;
        }
        this.setState({
            realtimeStatus: RealtimeStatus.Reconnecting,
            realtimeError: error,
            reconnectAttempt: reconnect.attempt,
            nextReconnectDelayMs: reconnect.delayMs,
        });
        try {
            this.reconnectTimer = this.realtimeScheduler.setTimeout(() => {
                this.reconnectTimer = null;
                if (!this.coordinator.isCurrent(ticket)) return;
                const selection = this.currentSelection;
                const symbolInfo = this.currentSymbolInfo;
                if (selection === null || symbolInfo === null) return;
                this.startRealtime(ticket, selection, symbolInfo, false);
            }, reconnect.delayMs);
        } catch (scheduleError) {
            this.reconnectTimer = null;
            this.setState({
                realtimeStatus: RealtimeStatus.Error,
                realtimeError: scheduleError,
                reconnectAttempt: reconnect.attempt,
                nextReconnectDelayMs: null,
            });
        }
    }

    private stopRealtime(updateState: boolean, resetBackoff = true): void {
        this.clearReconnectTimer();
        const unsubscribe = this.realtimeUnsubscribe;
        this.realtimeUnsubscribe = null;
        this.realtimeTicket = null;
        if (unsubscribe !== null) {
            try { unsubscribe(); } catch { /* release controller siblings */ }
        }
        if (resetBackoff) this.reconnectBackoff.reset();
        if (updateState && !this.disposed) {
            this.setState({
                realtimeStatus: RealtimeStatus.Disconnected,
                realtimeError: null,
                reconnectAttempt: 0,
                nextReconnectDelayMs: null,
            });
        }
    }

    private clearReconnectTimer(): void {
        const timer = this.reconnectTimer;
        this.reconnectTimer = null;
        if (timer === null) return;
        try { this.realtimeScheduler.clearTimeout(timer); } catch { /* teardown continues */ }
    }

    private setState(patch: Partial<ChartDataControllerSnapshot>): void {
        this.state = freezeSnapshot({ ...this.state, ...patch });
        this.emit();
    }

    private emit(): void {
        for (const listener of this.listeners) {
            try { listener(this.state); } catch { /* observers cannot break loading */ }
        }
    }

    private assertAlive(): void {
        if (this.disposed) throw new Error('sschart: chart data controller is disposed');
    }
}

function freezeSnapshot(value: ChartDataControllerSnapshot): ChartDataControllerSnapshot {
    return Object.freeze({
        ...value,
        selection: value.selection === null ? null : Object.freeze({ ...value.selection }),
        symbolInfo: value.symbolInfo === null ? null : Object.freeze({ ...value.symbolInfo }),
    });
}

function normalizeSelection(value: ChartDataSelection): ChartDataSelection {
    if (value === null || typeof value !== 'object')
        throw new TypeError('sschart: chart data selection is required');
    const symbol = nonEmpty(value.symbol, 'symbol');
    const resolution = nonEmpty(value.resolution, 'resolution');
    return Object.freeze({ symbol, resolution });
}

function selectionKey(value: ChartDataSelection | null): string {
    return value === null ? '' : `${value.symbol}\u0000${value.resolution}`;
}

interface NormalizedSymbolInfo {
    readonly info: SymbolInfo;
    readonly calendar: TradingCalendar | null;
}

function normalizeSymbolInfo(value: SymbolInfo): NormalizedSymbolInfo {
    if (value === null || typeof value !== 'object')
        throw new TypeError('sschart: data source returned invalid symbol info');
    const id = nonEmpty(value.id, 'resolved symbol id');
    const calendar = value.tradingSchedule === undefined
        ? null
        : new TradingCalendar(value.tradingSchedule);
    const info = Object.freeze({
        ...value,
        id,
        ...(calendar === null ? {} : { tradingSchedule: calendar.schedule() }),
    });
    return Object.freeze({ info, calendar });
}

function nonEmpty(value: string, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: chart data ${name} must be a non-empty string`);
    return value.trim();
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < 1)
        throw new RangeError(`sschart: chart data ${name} must be a positive integer`);
    return value;
}

function nonNegativeInteger(value: number | undefined, fallback: number, name: string): number {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < 0)
        throw new RangeError(`sschart: chart data ${name} must be a non-negative integer`);
    return value;
}

function once(callback: Unsubscribe): Unsubscribe {
    let active = true;
    return () => {
        if (!active) return;
        active = false;
        callback();
    };
}

function normalizeScheduler(value: RealtimeScheduler): RealtimeScheduler {
    if (value === null || typeof value !== 'object'
        || typeof value.setTimeout !== 'function'
        || typeof value.clearTimeout !== 'function'
        || typeof value.random !== 'function') {
        throw new TypeError('sschart: realtimeScheduler must implement setTimeout, clearTimeout and random');
    }
    return Object.freeze({
        setTimeout: (callback: () => void, delayMs: number) => value.setTimeout(callback, delayMs),
        clearTimeout: (handle: unknown) => value.clearTimeout(handle),
        random: () => value.random(),
    });
}
