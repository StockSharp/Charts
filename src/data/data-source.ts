import type {
    CandlestickData,
    PriceFormat,
    Time,
    TimedSeriesData,
} from '../core/chart-api.js';

export interface OhlcvBar extends CandlestickData {
    readonly volume?: number;
}

export interface ResolveSymbolRequest {
    readonly symbol: string;
}

/** Datafeed-owned identity and display metadata. Session fields arrive in M5. */
export interface SymbolInfo {
    readonly id: string;
    readonly ticker?: string;
    readonly name?: string;
    readonly exchange?: string;
    readonly priceFormat?: PriceFormat;
    readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface BarsRequest {
    readonly symbol: string;
    readonly resolution: string;
    readonly from?: Time;
    readonly to?: Time;
    readonly countBack?: number;
}

export interface BarsPage<TBar extends TimedSeriesData = OhlcvBar> {
    readonly bars: readonly TBar[];
    readonly hasMoreBefore: boolean;
    readonly hasMoreAfter?: boolean;
}

export interface BarsSubscription {
    readonly symbol: string;
    readonly resolution: string;
}

export interface BarUpdate<TBar extends TimedSeriesData = OhlcvBar> {
    readonly bar: TBar;
    readonly isFinal?: boolean;
}

export type Unsubscribe = () => void;

/** Broker/vendor-neutral history and realtime boundary. */
export interface IChartDataSource<TBar extends TimedSeriesData = OhlcvBar> {
    resolveSymbol(request: ResolveSymbolRequest, signal: AbortSignal): Promise<SymbolInfo>;
    getBars(request: BarsRequest, signal: AbortSignal): Promise<BarsPage<TBar>>;
    subscribeBars(
        request: BarsSubscription,
        listener: (update: BarUpdate<TBar>) => void,
        errorListener?: (error: unknown) => void,
    ): Unsubscribe;
}
