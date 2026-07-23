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
            undoCount: fixture.chart.commandStack().snapshot().undoCount,
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
            undoCount: fixture.chart.commandStack().snapshot().undoCount,
            canvasCount: document.querySelectorAll('#chart canvas[data-sschart-layer]').length,
            chartRootCount: document.querySelectorAll('#chart > .sschart-root').length,
        };
    });
    expect(after.main.height).toBeGreaterThan(before.main.height);
    expect(after.indicator.height).toBeLessThan(before.indicator.height);
    expect(after.undoCount).toBe(before.undoCount + 1);
    expect(after.canvasCount).toBe(2);
    expect(after.chartRootCount).toBe(1);

    const history = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        fixture.chart.commandStack().undo();
        await fixture.settle();
        const undone = {
            main: fixture.chart.panes()[0].getSize(),
            indicator: (window as any).__nativePane.pane.getSize(),
        };
        fixture.chart.commandStack().redo();
        await fixture.settle();
        return {
            undone,
            redone: {
                main: fixture.chart.panes()[0].getSize(),
                indicator: (window as any).__nativePane.pane.getSize(),
            },
        };
    });
    expect(history.undone.main.height).toBeCloseTo(before.main.height, 5);
    expect(history.undone.indicator.height).toBeCloseTo(before.indicator.height, 5);
    expect(history.redone.main.height).toBeCloseTo(after.main.height, 5);
    expect(history.redone.indicator.height).toBeCloseTo(after.indicator.height, 5);
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

test('moves a series and its primitive route without recreating either object', async ({ page }) => {
    const state = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const native = (window as any).__nativePane;
        const main = fixture.chart.panes().find((pane: any) => pane.id() === 'main');
        let attached = 0;
        let detached = 0;
        let context: any = null;
        const primitive = {
            attached(value: any) { attached++; context = value; },
            detached() { detached++; },
            updateAllViews() {},
        };
        fixture.chart.attachPrimitive(primitive, { series: native.line });
        const data = native.line.data();
        fixture.chart.moveSeries(native.line, main);
        await fixture.settle();
        const movedToMain = {
            mainOwns: main.series().includes(native.line),
            studyOwns: native.pane.series().includes(native.line),
            contextPane: context.pane.id(),
            sameData: JSON.stringify(native.line.data()) === JSON.stringify(data),
            attached,
            detached,
        };
        fixture.chart.moveSeries(native.line, native.pane);
        await fixture.settle();
        const movedBack = {
            mainOwns: main.series().includes(native.line),
            studyOwns: native.pane.series().includes(native.line),
            contextPane: context.pane.id(),
            attached,
            detached,
        };
        fixture.chart.detachPrimitive(primitive);
        return { movedToMain, movedBack };
    });

    expect(state.movedToMain).toEqual({
        mainOwns: true,
        studyOwns: false,
        contextPane: 'main',
        sameData: true,
        attached: 1,
        detached: 0,
    });
    expect(state.movedBack).toEqual({
        mainOwns: false,
        studyOwns: true,
        contextPane: 'oscillator',
        attached: 1,
        detached: 0,
    });
});

test('hides a series from rendering and crosshair without detaching its resources', async ({ page }) => {
    const state = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const native = (window as any).__nativePane;
        let attached = 0;
        let detached = 0;
        let draws = 0;
        const primitive = {
            attached() { attached++; },
            detached() { detached++; },
            updateAllViews() {},
            paneViews: () => [{
                zOrder: () => (window as any).SSChart.PrimitiveZOrder.Normal,
                renderer: () => ({ draw() { draws++; } }),
            }],
        };
        fixture.chart.attachPrimitive(primitive, { series: native.line });
        await fixture.settle();
        const visibleDraws = draws;
        const point = native.line.data()[70];

        native.line.applyOptions({ visible: false });
        await fixture.settle();
        fixture.chart.setCrosshairPosition({
            time: point.time,
            price: fixture.bars[70].close,
            series: fixture.candles,
        });
        await fixture.settle();
        const hiddenEvent = fixture.crosshairEvents.at(-1);
        const hidden = {
            owned: native.pane.series().includes(native.line),
            option: native.line.options().visible,
            inCrosshair: hiddenEvent.seriesData.has(native.line),
            draws,
            attached,
            detached,
        };

        native.line.applyOptions({ visible: true });
        await fixture.settle();
        fixture.chart.setCrosshairPosition({
            time: point.time,
            price: point.value,
            series: native.line,
        });
        await fixture.settle();
        const shownEvent = fixture.crosshairEvents.at(-1);
        const shown = {
            sameSeries: native.pane.series().includes(native.line),
            inCrosshair: shownEvent.seriesData.has(native.line),
            draws,
            attached,
            detached,
        };
        fixture.chart.detachPrimitive(primitive);
        return { visibleDraws, hidden, shown };
    });

    expect(state.visibleDraws).toBeGreaterThan(0);
    expect(state.hidden).toEqual({
        owned: true,
        option: false,
        inCrosshair: false,
        draws: state.visibleDraws,
        attached: 1,
        detached: 0,
    });
    expect(state.shown.sameSeries).toBe(true);
    expect(state.shown.inCrosshair).toBe(true);
    expect(state.shown.draws).toBeGreaterThan(state.visibleDraws);
    expect(state.shown.attached).toBe(1);
    expect(state.shown.detached).toBe(0);
});
