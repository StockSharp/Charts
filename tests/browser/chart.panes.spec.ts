import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(async () => {
        await (window as any).ChartFixture.create();
        const fixture = (window as any).__fixture;
        const pane = fixture.chart.addPane({ id: 'oscillator', height: 170, minHeight: 70 });
        const line = pane.addSeries((window as any).SSChart.LineSeries, {
            color: '#b388ff',
            lineWidth: 2,
            priceLineVisible: false,
        });
        line.setData(fixture.bars.map((bar: any, index: number) => ({
            time: bar.time,
            value: 50 + Math.sin(index / 8) * 35,
        })));
        fixture.chart.timeScale().fitContent();
        (window as any).__nativePane = { pane, line };
        await fixture.settle();
    });
});

test('owns native panes in one chart and one time scale', async ({ page }) => {
    const state = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        const native = (window as any).__nativePane;
        const size = native.pane.getSize();
        const coordinate = native.line.priceToCoordinate(50);
        return {
            paneIds: fixture.chart.panes().map((pane: any) => pane.id()),
            sameTimeScale: native.pane.timeScale() === fixture.chart.timeScale(),
            canvasCount: document.querySelectorAll('#chart canvas[data-sschart-layer]').length,
            chartRootCount: document.querySelectorAll('#chart > .sschart-root').length,
            size,
            coordinate,
        };
    });

    expect(state.paneIds).toEqual(['main', 'oscillator']);
    expect(state.sameTimeScale).toBe(true);
    expect(state.canvasCount).toBe(2);
    expect(state.chartRootCount).toBe(1);
    expect(state.coordinate).toBeGreaterThan(state.size.top);
    expect(state.coordinate).toBeLessThan(state.size.top + state.size.height);
});

test('draws one shared crosshair through every pane', async ({ page }) => {
    const paneSize = await page.evaluate(() => (window as any).__nativePane.pane.getSize());
    const canvas = page.locator('#chart canvas[data-sschart-layer="overlay"]');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + 430, box!.y + paneSize.top + paneSize.height / 2);
    await page.evaluate(() => (window as any).__fixture.settle());

    const coverage = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        const overlay = document.querySelector('#chart canvas[data-sschart-layer="overlay"]') as HTMLCanvasElement;
        const context = overlay.getContext('2d')!;
        const event = fixture.crosshairEvents[fixture.crosshairEvents.length - 1];
        const x = fixture.chart.timeScale().timeToCoordinate(event.time);
        const panes = fixture.chart.panes().map((pane: any) => pane.getSize());
        const dpr = window.devicePixelRatio;
        return panes.map((pane: any) => {
            const left = Math.max(0, Math.round(x * dpr) - 1);
            const top = Math.max(0, Math.round((pane.top + 8) * dpr));
            const height = Math.max(1, Math.round((pane.height - 8) * dpr));
            const pixels = context.getImageData(left, top, 3, height).data;
            let painted = 0;
            for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted++;
            return painted;
        });
    });

    expect(coverage).toHaveLength(2);
    expect(coverage[0]).toBeGreaterThan(0);
    expect(coverage[1]).toBeGreaterThan(0);
});

test('resizes panes through a splitter without creating chart resources', async ({ page }) => {
    const before = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        return {
            main: fixture.chart.panes()[0].getSize(),
            indicator: (window as any).__nativePane.pane.getSize(),
        };
    });
    const canvas = page.locator('#chart canvas[data-sschart-layer="overlay"]');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const splitterY = box!.y + before.main.top + before.main.height + 2;

    await page.mouse.move(box!.x + 350, splitterY);
    await page.mouse.down();
    await page.mouse.move(box!.x + 350, splitterY + 35, { steps: 4 });
    await page.mouse.up();
    await page.evaluate(() => (window as any).__fixture.settle());

    const after = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        return {
            main: fixture.chart.panes()[0].getSize(),
            indicator: (window as any).__nativePane.pane.getSize(),
            canvasCount: document.querySelectorAll('#chart canvas[data-sschart-layer]').length,
            chartRootCount: document.querySelectorAll('#chart > .sschart-root').length,
        };
    });
    expect(after.main.height).toBeGreaterThan(before.main.height);
    expect(after.indicator.height).toBeLessThan(before.indicator.height);
    expect(after.canvasCount).toBe(2);
    expect(after.chartRootCount).toBe(1);
});

test('maximizes and restores a pane without changing its identity', async ({ page }) => {
    const state = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const pane = (window as any).__nativePane.pane;
        pane.applyOptions({ state: 'maximized' });
        await fixture.settle();
        const maximized = { pane: pane.getSize(), main: fixture.chart.panes()[0].getSize() };
        pane.applyOptions({ state: 'normal' });
        await fixture.settle();
        return {
            samePane: fixture.chart.panes()[1] === pane,
            maximized,
            restored: pane.getSize(),
        };
    });

    expect(state.samePane).toBe(true);
    expect(state.maximized.main.height).toBe(0);
    expect(state.maximized.pane.height).toBeGreaterThan(state.restored.height);
});
