import { expect, test } from '@playwright/test';

test('public ChartDataController loads a series while manual mode stays independent', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());

    const result = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const api = (window as any).SSChart;
        const sourceCalls: any[] = [];
        const loaded = fixture.bars.slice(20, 23);
        let realtimeListener: ((update: any) => void) | null = null;
        let unsubscribeCalls = 0;
        const source = {
            async resolveSymbol(request: any, signal: AbortSignal) {
                sourceCalls.push({ phase: 'resolve', request, aborted: signal.aborted });
                return { id: `resolved:${request.symbol}`, priceFormat: { precision: 3 } };
            },
            async getBars(request: any, signal: AbortSignal) {
                sourceCalls.push({ phase: 'bars', request, aborted: signal.aborted });
                return { bars: loaded, hasMoreBefore: false };
            },
            subscribeBars(_request: any, listener: (update: any) => void) {
                realtimeListener = listener;
                return () => { unsubscribeCalls++; };
            },
        };
        const controller = new api.ChartDataController({
            chart: fixture.chart,
            series: fixture.candles,
            dataSource: source,
            initialCount: 3,
        });
        const info = await controller.setSelection({ symbol: 'TEST', resolution: '5m' });
        realtimeListener!({ bar: fixture.bars[23], isFinal: true });
        const controlled = {
            info,
            snapshot: controller.snapshot(),
            times: fixture.candles.data().map((bar: any) => bar.time),
            sourceCalls,
        };

        controller.dispose();
        const unsubscribed = unsubscribeCalls;
        fixture.candles.setData([fixture.bars[40]]);
        return {
            controlled,
            disposedStatus: controller.snapshot().status,
            manualTimes: fixture.candles.data().map((bar: any) => bar.time),
            expectedControlledTimes: [...loaded, fixture.bars[23]].map((bar: any) => bar.time),
            expectedManualTime: fixture.bars[40].time,
            unsubscribed,
        };
    });

    expect(result.controlled.info.id).toBe('resolved:TEST');
    expect(result.controlled.snapshot.status).toBe('ready');
    expect(result.controlled.snapshot.loadedBars).toBe(4);
    expect(result.controlled.snapshot.realtimeUpdates).toBe(1);
    expect(result.controlled.snapshot.realtimeStatus).toBe('connected');
    expect(result.controlled.times).toEqual(result.expectedControlledTimes);
    expect(result.controlled.sourceCalls).toEqual([
        { phase: 'resolve', request: { symbol: 'TEST' }, aborted: false },
        {
            phase: 'bars',
            request: { symbol: 'resolved:TEST', resolution: '5m', countBack: 3 },
            aborted: false,
        },
    ]);
    expect(result.disposedStatus).toBe('disposed');
    expect(result.unsubscribed).toBe(1);
    expect(result.manualTimes).toEqual([result.expectedManualTime]);
});

test('history prefetch deduplicates the boundary and preserves the visible bar anchor', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());

    const before = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const api = (window as any).SSChart;
        fixture.chart.removeSeries(fixture.volume);
        fixture.chart.removeSeries(fixture.average);
        const initial = fixture.bars.slice(80);
        const history = [...fixture.bars.slice(40, 80), { ...fixture.bars[80] }];
        const requests: any[] = [];
        let resolveHistory: (page: any) => void = () => {};
        const source = {
            async resolveSymbol(request: any) { return { id: request.symbol }; },
            getBars(request: any) {
                requests.push(request);
                if (request.to === undefined) {
                    return Promise.resolve({ bars: initial, hasMoreBefore: true });
                }
                return new Promise((resolve) => { resolveHistory = resolve; });
            },
            subscribeBars() { return () => {}; },
        };
        const controller = new api.ChartDataController({
            chart: fixture.chart,
            series: fixture.candles,
            dataSource: source,
            initialCount: 100,
            historyCount: 50,
            historyPrefetchThreshold: 10,
        });
        await controller.setSelection({ symbol: 'HISTORY', resolution: '1d' });
        fixture.chart.timeScale().setVisibleLogicalRange({ from: 0, to: 60 });
        await fixture.settle();
        const anchor = fixture.bars[110];
        (window as any).__historyController = controller;
        (window as any).__historyRequests = requests;
        (window as any).__resolveHistory = () => resolveHistory({
            bars: history,
            hasMoreBefore: false,
        });
        return {
            range: fixture.chart.timeScale().getVisibleRange(),
            anchorTime: anchor.time,
            anchorX: fixture.chart.timeScale().timeToCoordinate(anchor.time),
            initialLength: fixture.candles.data().length,
            firstTime: fixture.candles.data()[0].time,
        };
    });
    await expect.poll(() => page.evaluate(() => (window as any).__historyRequests.length)).toBe(2);
    await page.evaluate(() => (window as any).__resolveHistory());
    await expect.poll(() => page.evaluate(
        () => (window as any).__historyController.snapshot().loadedBars,
    )).toBe(140);

    const after = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        await fixture.settle();
        const data = fixture.candles.data();
        return {
            range: fixture.chart.timeScale().getVisibleRange(),
            anchorX: fixture.chart.timeScale().timeToCoordinate(
                (window as any).__fixture.bars[110].time,
            ),
            length: data.length,
            uniqueTimes: new Set(data.map((bar: any) => bar.time)).size,
            firstTime: data[0].time,
            requests: (window as any).__historyRequests,
            snapshot: (window as any).__historyController.snapshot(),
        };
    });
    expect(before.initialLength).toBe(100);
    expect(after.length).toBe(140);
    expect(after.uniqueTimes).toBe(140);
    expect(after.firstTime).toBe(await page.evaluate(() => (window as any).__fixture.bars[40].time));
    expect(after.range).toEqual(before.range);
    expect(after.anchorX).toBeCloseTo(before.anchorX, 8);
    expect(after.requests).toHaveLength(2);
    expect(after.requests[1]).toEqual({
        symbol: 'HISTORY',
        resolution: '1d',
        to: before.firstTime,
        countBack: 50,
    });
    expect(after.snapshot.hasMoreBefore).toBe(false);
    expect(after.snapshot.loadingHistory).toBe(false);
    expect(after.snapshot.historyError).toBeNull();
});
