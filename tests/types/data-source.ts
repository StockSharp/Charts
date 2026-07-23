import {
    CandlestickSeries,
    ChartDataController,
    ChartDataStatus,
    type BarUpdate,
    type BarsPage,
    type BarsRequest,
    type BarsSubscription,
    type CandlestickData,
    type IChartApi,
    type IChartDataSource,
    ohlcvDataViewBuilder,
    ohlcvDataViewUpdater,
    RealtimeStatus,
    type RealtimeScheduler,
    type ResolveSymbolRequest,
    type SymbolInfo,
} from '../../src/index.js';

declare const chart: IChartApi;
const candles = chart.addSeries(CandlestickSeries);

const source: IChartDataSource<CandlestickData> = {
    async resolveSymbol(request: ResolveSymbolRequest, signal: AbortSignal): Promise<SymbolInfo> {
        void signal;
        return { id: request.symbol, priceFormat: { precision: 2 } };
    },
    async getBars(request: BarsRequest, signal: AbortSignal): Promise<BarsPage<CandlestickData>> {
        void request;
        void signal;
        return { bars: [], hasMoreBefore: false };
    },
    subscribeBars(
        request: BarsSubscription,
        listener: (update: BarUpdate<CandlestickData>) => void,
    ) {
        void request;
        void listener;
        return () => {};
    },
};

const scheduler: RealtimeScheduler = {
    setTimeout: (callback, _delayMs) => globalThis.setTimeout(callback, 0),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as number),
    random: () => 0.5,
};

const data = new ChartDataController({
    chart,
    series: candles,
    dataSource: source,
    initialCount: 300,
    historyCount: 500,
    historyPrefetchThreshold: 25,
    viewBuilder: ohlcvDataViewBuilder,
    viewUpdater: ohlcvDataViewUpdater,
    initialGroupingLevel: 2,
    lodCacheSize: 6,
    autoScrollRealtime: true,
    applySymbolTradingSchedule: true,
    reconnectPolicy: { initialDelayMs: 250, maxDelayMs: 5_000, maxAttempts: 5 },
    realtimeScheduler: scheduler,
});
data.subscribe((snapshot) => {
    const status: string = snapshot.status;
    const ready: boolean = snapshot.status === ChartDataStatus.Ready;
    const historyLoading: boolean = snapshot.loadingHistory;
    const realtimeConnected: boolean = snapshot.realtimeStatus === RealtimeStatus.Connected;
    const reconnectAttempt: number = snapshot.reconnectAttempt;
    void status;
    void ready;
    void historyLoading;
    void realtimeConnected;
    void reconnectAttempt;
});
void data.setSelection({ symbol: 'AAPL', resolution: '1m' });
void data.reload();
void data.loadMoreBefore();
data.setGroupingLevel(4);
const rawCount: number = data.rawData().length;
const rawWindow: readonly CandlestickData[] = data.rawDataSlice(0, rawCount);
const renderedCount: number = data.renderedData().length;
const lodHits: number = data.lodCacheSnapshot().hits;
void rawCount;
void rawWindow;
void renderedCount;
void lodHits;
data.cancel();
data.dispose();

// @ts-expect-error subscribeBars is part of the required datafeed contract
const incomplete: IChartDataSource<CandlestickData> = {
    async resolveSymbol() { return { id: 'X' }; },
    async getBars() { return { bars: [], hasMoreBefore: false }; },
};
void incomplete;
