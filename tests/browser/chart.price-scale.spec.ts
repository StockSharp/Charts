import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());
});

test('normalizes independent series in Percentage and IndexedTo100 modes', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const api = (window as any).SSChart;
        const pane = fixture.chart.addPane({ id: 'relative', height: 190, minHeight: 100 });
        const first = pane.addSeries(api.LineSeries, { color: '#ff00ff', priceLineVisible: false });
        const second = pane.addSeries(api.LineSeries, { color: '#00ffff', priceLineVisible: false });
        const ratios = fixture.bars.map((_: any, index: number) =>
            1 + Math.sin(index / 11) * 0.08 + index * 0.0007);
        const firstData = fixture.bars.map((bar: any, index: number) => ({
            time: bar.time,
            value: 100 * ratios[index],
        }));
        const secondData = fixture.bars.map((bar: any, index: number) => ({
            time: bar.time,
            value: 2_500 * ratios[index],
        }));
        first.setData(firstData);
        second.setData(secondData);
        fixture.chart.timeScale().fitContent();
        first.priceScale().applyOptions({ mode: api.PriceScaleMode.Percentage });
        await fixture.settle();

        const index = 105;
        const percentageFirstY = first.priceToCoordinate(firstData[index].value);
        const percentageSecondY = second.priceToCoordinate(secondData[index].value);
        const percentageFirstRoundTrip = first.coordinateToPrice(percentageFirstY);
        const percentageSecondRoundTrip = second.coordinateToPrice(percentageSecondY);

        fixture.chart.timeScale().setVisibleRange({
            from: fixture.bars[45].time,
            to: fixture.bars[145].time,
        });
        await fixture.settle();
        const pannedFirstY = first.priceToCoordinate(firstData[index].value);
        const pannedSecondY = second.priceToCoordinate(secondData[index].value);

        first.priceScale().applyOptions({ mode: api.PriceScaleMode.IndexedTo100 });
        await fixture.settle();
        const indexedFirstY = first.priceToCoordinate(firstData[index].value);
        const indexedSecondY = second.priceToCoordinate(secondData[index].value);
        const indexedFirstRoundTrip = first.coordinateToPrice(indexedFirstY);
        const indexedSecondRoundTrip = second.coordinateToPrice(indexedSecondY);

        let invalidModeError = '';
        try { first.priceScale().applyOptions({ mode: 99 }); }
        catch (error) { invalidModeError = String(error); }

        return {
            percentageFirstY,
            percentageSecondY,
            percentageFirstRoundTrip,
            percentageSecondRoundTrip,
            pannedFirstY,
            pannedSecondY,
            indexedFirstY,
            indexedSecondY,
            indexedFirstRoundTrip,
            indexedSecondRoundTrip,
            firstPrice: firstData[index].value,
            secondPrice: secondData[index].value,
            invalidModeError,
        };
    });

    expect(result.percentageFirstY).toBeCloseTo(result.percentageSecondY, 8);
    expect(result.percentageFirstRoundTrip).toBeCloseTo(result.firstPrice, 8);
    expect(result.percentageSecondRoundTrip).toBeCloseTo(result.secondPrice, 8);
    expect(result.pannedFirstY).toBeCloseTo(result.pannedSecondY, 8);
    expect(result.indexedFirstY).toBeCloseTo(result.indexedSecondY, 8);
    expect(result.indexedFirstRoundTrip).toBeCloseTo(result.firstPrice, 8);
    expect(result.indexedSecondRoundTrip).toBeCloseTo(result.secondPrice, 8);
    expect(result.invalidModeError).toContain('unsupported price scale mode');
});
