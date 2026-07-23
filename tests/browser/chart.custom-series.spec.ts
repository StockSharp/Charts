import { expect, test } from '@playwright/test';

test('renders a registry-defined custom series without a core type branch', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());

    const result = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const api = (window as any).SSChart;
        let drawCalls = 0;
        let visiblePoints = 0;
        let probe: { x: number; y: number } | null = null;
        const definition = {
            type: 'HighLowRange',
            defaultOptions: { color: '#ff00ff' },
            renderer: {
                dataPadding: 1,
                priceRange(data: any[]) {
                    if (data.length === 0) return null;
                    return {
                        min: Math.min(...data.map((point) => point.low)),
                        max: Math.max(...data.map((point) => point.high)),
                    };
                },
                priceValue(point: any) { return (point.high + point.low) / 2; },
                colorAt() { return '#ff00ff'; },
                draw(context: any) {
                    drawCalls++;
                    visiblePoints = context.data.length;
                    context.target.fillStyle = '#ff00ff';
                    context.data.forEach((point: any, index: number) => {
                        const x = context.timeToCoordinate(point.time);
                        const y = context.priceToCoordinate((point.high + point.low) / 2);
                        context.target.fillRect(x - 3, y - 3, 6, 6);
                        if (index === Math.floor(context.data.length / 2)) probe = { x, y };
                    });
                    // A custom renderer cannot leak canvas state into the next series.
                    context.target.globalAlpha = 0.01;
                    context.target.translate(10_000, 10_000);
                },
            },
        };

        api.registerSeries(definition);
        const pane = fixture.chart.addPane({ id: 'custom-range', height: 170 });
        const series = pane.addSeries({ type: 'HighLowRange' }, { priceLineVisible: false });
        const data = fixture.bars.slice(25, 150).map((bar: any) => ({
            time: bar.time,
            low: bar.low - 2,
            high: bar.high + 2,
        }));
        series.setData(data);
        fixture.chart.timeScale().fitContent();
        await fixture.settle();

        const middle = data[Math.floor(data.length / 2)];
        const coordinate = series.priceToCoordinate((middle.high + middle.low) / 2);
        const paneSize = pane.getSize();
        const screenshot = fixture.chart.takeScreenshot();
        const dpr = window.devicePixelRatio || 1;
        const context = screenshot.getContext('2d');
        const point = probe as { x: number; y: number } | null;
        let painted = false;
        if (context && point) {
            const pixels = context.getImageData(
                Math.round((point.x - 3) * dpr),
                Math.round((point.y - 3) * dpr),
                Math.max(1, Math.round(6 * dpr)),
                Math.max(1, Math.round(6 * dpr)),
            ).data;
            for (let index = 0; index < pixels.length; index += 4) {
                if (pixels[index] > 220 && pixels[index + 2] > 220) {
                    painted = true;
                    break;
                }
            }
        }

        const registered = api.getSeriesTypes().includes('HighLowRange');
        const removed = api.unregisterSeries('HighLowRange');
        series.applyOptions({ customFlag: true });
        await fixture.settle();
        return {
            drawCalls,
            visiblePoints,
            coordinate,
            paneTop: paneSize.top,
            paneBottom: paneSize.top + paneSize.height,
            painted,
            registered,
            removed,
            stillDrawsAfterUnregister: drawCalls >= 2,
            registryCleared: api.getSeriesDefinition('HighLowRange') === undefined,
        };
    });

    expect(result.registered).toBe(true);
    expect(result.removed).toBe(true);
    expect(result.registryCleared).toBe(true);
    expect(result.drawCalls).toBeGreaterThan(0);
    expect(result.visiblePoints).toBeGreaterThan(0);
    expect(result.coordinate).toBeGreaterThan(result.paneTop);
    expect(result.coordinate).toBeLessThan(result.paneBottom);
    expect(result.painted).toBe(true);
    expect(result.stillDrawsAfterUnregister).toBe(true);
});
