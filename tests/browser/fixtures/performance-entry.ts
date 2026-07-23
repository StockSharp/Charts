import { IndicatorEngine } from '../../../src/chart/indicators/indicator-engine.js';
import { IndicatorRenderer } from '../../../src/chart/indicators/indicator-renderer.js';

declare const SSChart: any;

type Bar = {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

class BenchmarkPaneManager {
    private readonly charts: Map<string, any>;
    private readonly spines: Map<string, any>;

    constructor(charts: Map<string, any>, spines: Map<string, any>) {
        this.charts = charts;
        this.spines = spines;
    }

    getChart(id: string): any { return this.charts.get(id) || null; }
    getPaneByMeasure(): null { return null; }
    addPane(): never { throw new Error('benchmark panes are created up front'); }
    removePane(): void { /* benchmark owns pane lifetime */ }

    setSpineFromCandles(candles: Bar[]): void {
        const points = candles.map((bar) => ({ time: bar.time }));
        for (const spine of this.spines.values()) spine.setData(points);
    }

    appendSpineCandle(candle: Bar): void {
        for (const spine of this.spines.values()) spine.update({ time: candle.time });
    }
}

function chartOptions(): any {
    return {
        width: 960,
        height: 660,
        autoSize: false,
        layout: {
            background: { type: 'solid', color: '#131820' },
            textColor: '#8b97a7',
            fontFamily: 'Arial, sans-serif',
            fontSize: 10,
        },
        grid: {
            vertLines: { color: 'rgba(48,61,80,0.45)' },
            horzLines: { color: 'rgba(48,61,80,0.45)' },
        },
        rightPriceScale: { borderColor: '#334155' },
        timeScale: { borderColor: '#334155', timeVisible: true, ordinal: true },
    };
}

function makeBars(count: number): Bar[] {
    const bars = new Array<Bar>(count);
    const start = Date.UTC(2020, 0, 2) / 1000;
    let close = 100;
    for (let i = 0; i < count; i++) {
        const open = close;
        close = open + Math.sin(i * 0.37) * 0.32 + Math.cos(i * 0.011) * 0.08 + 0.002;
        const spread = 0.35 + Math.abs(Math.sin(i * 0.071)) * 0.22;
        bars[i] = {
            time: start + i * 60,
            open,
            high: Math.max(open, close) + spread,
            low: Math.min(open, close) - spread,
            close,
            volume: 500 + (i % 97) * 13,
        };
    }
    return bars;
}

function percentile(values: number[], fraction: number): number {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function nextFrame(): Promise<number> {
    return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitForPaint(): Promise<void> {
    await nextFrame();
    await nextFrame();
}

const benchmark = {
    charts: [] as any[],
    engine: null as IndicatorEngine | null,
    bars: [] as Bar[],

    async run(): Promise<Record<string, unknown>> {
        this.destroy();
        const totalStarted = performance.now();
        const generationStarted = performance.now();
        const bars = makeBars(100_000);
        const generationMs = performance.now() - generationStarted;
        this.bars = bars;

        const root = document.getElementById('panes')!;
        const charts = new Map<string, any>();
        const host = document.createElement('div');
        host.className = 'pane';
        root.appendChild(host);
        const main = SSChart.createChart(host, chartOptions());
        main.panes()[0].applyOptions({ height: 220, minHeight: 100 });
        const paneA = main.addPane({ id: 'pane-a', height: 220, minHeight: 100, order: 1 });
        const paneB = main.addPane({ id: 'pane-b', height: 220, minHeight: 100, order: 2 });
        charts.set('main', main);
        charts.set('pane-a', paneA);
        charts.set('pane-b', paneB);
        this.charts.push(main);
        const candles = main.addSeries(SSChart.CandlestickSeries, {
            upColor: '#00c853', downColor: '#ff3d57',
            wickUpColor: '#00c853', wickDownColor: '#ff3d57',
            borderVisible: false, lastValueVisible: false,
        });
        candles.setData(bars);
        const volume = main.addSeries(SSChart.HistogramSeries, {
            priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false,
        });
        volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        volume.setData(bars.map((bar) => ({
            time: bar.time,
            value: bar.volume,
            color: bar.close >= bar.open ? 'rgba(0,200,83,0.25)' : 'rgba(255,61,87,0.25)',
        })));
        const baseline = main.addSeries(SSChart.LineSeries, {
            color: '#f0b90b', lineWidth: 1, lastValueVisible: false, priceLineVisible: false,
        });
        baseline.setData(bars.map((bar) => ({ time: bar.time, value: bar.close })));

        const spines = new Map<string, any>();
        for (const id of ['pane-a', 'pane-b']) {
            const spine = charts.get(id).addSeries(SSChart.LineSeries, {
                lineVisible: false, lastValueVisible: false, priceLineVisible: false,
            });
            spines.set(id, spine);
        }

        const manager = new BenchmarkPaneManager(charts, spines);
        const engine = new IndicatorEngine();
        engine.setRenderer(new IndicatorRenderer(main));
        engine.setPaneManager(manager);
        engine.setCandles(bars);
        this.engine = engine;

        const indicators: Array<[string, Record<string, number>, string]> = [
            ['SimpleMovingAverage', { length: 20 }, '__main__'],
            ['ExponentialMovingAverage', { length: 50 }, '__main__'],
            ['BollingerBands', { length: 20, stdDev: 2 }, '__main__'],
            ['Ichimoku', { tenkan: 9, kijun: 26, senkouB: 52 }, '__main__'],
            ['RelativeStrengthIndex', { length: 14 }, 'pane-a'],
            ['MovingAverageConvergenceDivergence', { fastLength: 12, slowLength: 26, signalLength: 9 }, 'pane-b'],
            ['StochasticOscillator', { kPeriod: 14, dPeriod: 3, smooth: 3 }, 'pane-a'],
            ['AverageDirectionalIndex', { length: 14 }, 'pane-b'],
            ['AverageTrueRange', { length: 14 }, 'pane-a'],
            ['CommodityChannelIndex', { length: 20 }, 'pane-b'],
        ];
        for (const [kind, params, pane] of indicators) {
            const entry = engine.add(kind, params, pane);
            if (!entry) throw new Error(`failed to add benchmark indicator ${kind}`);
        }

        const visibleFrom = bars[bars.length - 500].time;
        const visibleTo = bars[bars.length - 1].time;
        main.timeScale().setVisibleRange({ from: visibleFrom, to: visibleTo });
        await waitForPaint();
        const initializationMs = performance.now() - totalStarted;

        const frameSamples: number[] = [];
        for (let i = 0; i < 7; i++) {
            const shift = i * 60;
            const started = performance.now();
            main.timeScale().setVisibleRange({ from: visibleFrom - shift, to: visibleTo - shift });
            await nextFrame();
            frameSamples.push(performance.now() - started);
        }

        const dispatchStarted = performance.now();
        for (let i = 0; i < 500; i++) {
            const last = bars[bars.length - 1];
            last.close += i % 2 === 0 ? 0.0001 : -0.0001;
            engine.onLiveUpdate();
        }
        const replaceLastDispatchMs = performance.now() - dispatchStarted;
        const realtimeStarted = performance.now();
        await waitForPaint();
        const realtimeUpdateMs = performance.now() - realtimeStarted;

        return {
            bars: bars.length,
            baseSeries: 5,
            panes: charts.size,
            chartInstances: this.charts.length,
            activeIndicators: engine.getIndicators().length,
            replaceLastBurst: 500,
            indicatorSeries: engine.getIndicators().reduce((count, entry) => count + entry.seriesRefs.length, 0),
            generationMs,
            initializationMs,
            frameMedianMs: percentile(frameSamples, 0.5),
            frameP95Ms: percentile(frameSamples, 0.95),
            replaceLastDispatchMs,
            realtimeUpdateMs,
        };
    },

    destroy(): void {
        this.engine?.removeAll();
        this.engine = null;
        for (const chart of this.charts) chart.remove();
        this.charts = [];
        this.bars = [];
        document.getElementById('panes')?.replaceChildren();
    },
};

(window as any).ChartPerformanceFixture = benchmark;
