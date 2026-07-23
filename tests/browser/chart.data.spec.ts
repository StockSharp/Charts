import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());
});

test('prepends history without moving the visible bar anchor', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const series = fixture.candles;
        const anchor = fixture.bars[70];
        const beforeLength = series.data().length;
        const beforeRange = fixture.chart.timeScale().getVisibleRange();
        const beforeX = fixture.chart.timeScale().timeToCoordinate(anchor.time);
        const first = fixture.bars[0];
        const step = fixture.bars[1].time - first.time;
        const history = Array.from({ length: 12 }, (_, index) => {
            const close = first.open - (12 - index) * 0.1;
            return {
                time: first.time - (12 - index) * step,
                open: close - 0.05,
                high: close + 0.4,
                low: close - 0.4,
                close,
            };
        });

        series.prependData(history);
        await fixture.settle();
        const afterRange = fixture.chart.timeScale().getVisibleRange();
        const afterX = fixture.chart.timeScale().timeToCoordinate(anchor.time);
        const logical = fixture.chart.timeScale().coordinateToLogical(afterX);
        const atAnchor = series.dataByIndex(Math.round(logical));
        const info = series.barsInLogicalRange(fixture.chart.timeScale().getVisibleLogicalRange());
        const snapshot = series.data();
        (snapshot as any[]).pop();

        return {
            beforeLength,
            afterLength: series.data().length,
            beforeRange,
            afterRange,
            beforeX,
            afterX,
            atAnchorTime: atAnchor?.time,
            firstTime: series.dataByIndex(0)?.time,
            expectedFirstTime: history[0].time,
            info,
            snapshotLength: snapshot.length,
        };
    });

    expect(result.afterLength).toBe(result.beforeLength + 12);
    expect(result.afterRange).toEqual(result.beforeRange);
    expect(result.afterX).toBeCloseTo(result.beforeX, 8);
    expect(result.atAnchorTime).toBe((await page.evaluate(() => (window as any).__fixture.bars[70].time)));
    expect(result.firstTime).toBe(result.expectedFirstTime);
    expect(result.info?.barsBefore).toBe(12);
    expect(result.snapshotLength).toBe(result.afterLength - 1);
});

test('pops tail data and exposes nearest indexed values', async ({ page }) => {
    const result = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        const series = fixture.average;
        const before = series.data();
        const removed = series.pop(2) as any[];
        return {
            beforeLength: before.length,
            afterLength: series.data().length,
            removedTimes: removed.map((point) => point.time),
            expectedTimes: before.slice(-2).map((point: any) => point.time),
            nearestLeft: series.dataByIndex(1_000, (window as any).SSChart.MismatchDirection.NearestLeft)?.time,
            lastTime: series.data()[series.data().length - 1]?.time,
        };
    });

    expect(result.afterLength).toBe(result.beforeLength - 2);
    expect(result.removedTimes).toEqual(result.expectedTimes);
    expect(result.nearestLeft).toBe(result.lastTime);
});
