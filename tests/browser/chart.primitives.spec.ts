import { expect, test } from '@playwright/test';

test('primitive pane and axis views use the fixed compositor order', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());

    const result = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const layers = (window as any).SSChart.PrimitiveZOrder;
        const renderOrder: string[] = [];
        const stateAtNormal: { alpha?: number; lineWidth?: number } = {};
        let context: any;
        let priceY: number | null = null;
        let timeX: number | null = null;
        let topSample = { x: 0, y: 0 };
        let timeSampleY = 0;

        const renderer = (name: string, color: string, dirtyState = false) => ({
            draw(target: any) {
                renderOrder.push(name);
                topSample = {
                    x: target.pane.plot.x + 12,
                    y: target.pane.plot.y + 12,
                };
                timeSampleY = target.pane.plot.y + target.pane.plot.height + 2;
                target.useMediaCoordinateSpace(({ context: canvasContext }: any) => {
                    if (name === 'normal') {
                        stateAtNormal.alpha = canvasContext.globalAlpha;
                        stateAtNormal.lineWidth = canvasContext.lineWidth;
                    }
                    if (dirtyState) {
                        canvasContext.globalAlpha = 0.25;
                        canvasContext.lineWidth = 73;
                    }
                    canvasContext.fillStyle = color;
                    canvasContext.fillRect(topSample.x, topSample.y, 10, 10);
                });
            },
        });

        const views = [
            { zOrder: () => layers.Top, renderer: () => renderer('top', '#12ef34') },
            { zOrder: () => layers.Normal, renderer: () => renderer('normal', '#ffe600') },
            { zOrder: () => layers.Background, renderer: () => renderer('background', '#ff2400', true) },
            { zOrder: () => layers.Bottom, renderer: () => renderer('bottom', '#0066ff') },
        ];
        const primitive = {
            attached(value: any) { context = value; },
            detached() {},
            updateAllViews() {
                priceY = context.priceToCoordinate(fixture.bars[80].close);
                timeX = context.timeToCoordinate(fixture.bars[80].time);
            },
            paneViews: () => views,
            priceAxisViews: () => [{
                coordinate: () => priceY,
                text: () => 'P',
                backgroundColor: () => '#ff00aa',
                textColor: () => '#ffffff',
            }],
            timeAxisViews: () => [{
                coordinate: () => timeX,
                text: () => 'T',
                backgroundColor: () => '#00aaff',
                textColor: () => '#ffffff',
            }],
        };

        fixture.chart.attachPrimitive(primitive, { series: fixture.candles });
        await fixture.settle();

        const canvas = document.querySelector(
            '#chart canvas[data-sschart-layer="base"]',
        ) as HTMLCanvasElement;
        const canvasContext = canvas.getContext('2d')!;
        const overlay = document.querySelector(
            '#chart canvas[data-sschart-layer="overlay"]',
        ) as HTMLCanvasElement;
        const overlayContext = overlay.getContext('2d')!;
        const ratio = canvas.width / canvas.getBoundingClientRect().width;
        const sample = (x: number, y: number) => Array.from(canvasContext.getImageData(
            Math.round(x * ratio),
            Math.round(y * ratio),
            1,
            1,
        ).data);
        const sampleOverlay = (x: number, y: number) => Array.from(overlayContext.getImageData(
            Math.round(x * ratio),
            Math.round(y * ratio),
            1,
            1,
        ).data);

        return {
            renderOrder,
            stateAtNormal,
            panePixel: sampleOverlay(topSample.x + 4, topSample.y + 4),
            priceAxisPixel: sample(898, priceY!),
            timeAxisPixel: sample(timeX!, timeSampleY),
            geometry: {
                pane: context.pane.getSize(),
                topSample,
                priceY,
                timeX,
            },
        };
    });

    expect(result.renderOrder).toEqual(['background', 'bottom', 'normal', 'top']);
    expect(result.stateAtNormal).toEqual({ alpha: 1, lineWidth: 1 });
    expect(result.panePixel.slice(0, 3)).toEqual([18, 239, 52]);
    expect(result.priceAxisPixel.slice(0, 3)).toEqual([255, 0, 170]);
    expect(result.timeAxisPixel.slice(0, 3)).toEqual([0, 170, 255]);
    expect(result.geometry.priceY).not.toBeNull();
    expect(result.geometry.timeX).not.toBeNull();
});

test('pane renderer is clipped to its owning pane plot', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());

    const result = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const pane = fixture.chart.addPane({ height: 150 });
        const layers = (window as any).SSChart.PrimitiveZOrder;
        let geometry: any;
        fixture.chart.attachPrimitive({
            attached() {},
            detached() {},
            updateAllViews() {},
            paneViews: () => [{
                zOrder: () => layers.Top,
                renderer: () => ({
                    draw(target: any) {
                        geometry = target.pane;
                        target.useMediaCoordinateSpace(({ context, mediaSize }: any) => {
                            context.fillStyle = '#e91e63';
                            context.fillRect(0, 0, mediaSize.width, mediaSize.height);
                        });
                    },
                }),
            }],
        }, { pane });
        await fixture.settle();

        const canvas = document.querySelector(
            '#chart canvas[data-sschart-layer="overlay"]',
        ) as HTMLCanvasElement;
        const context = canvas.getContext('2d')!;
        const ratio = canvas.width / canvas.getBoundingClientRect().width;
        const sample = (x: number, y: number) => Array.from(context.getImageData(
            Math.round(x * ratio), Math.round(y * ratio), 1, 1,
        ).data);
        return {
            geometry,
            inside: sample(geometry.plot.x + 20, geometry.plot.y + 20),
            mainPane: sample(geometry.plot.x + 20, 30),
            rightAxis: sample(geometry.plot.x + geometry.plot.width + 20, geometry.plot.y + 20),
        };
    });

    expect(result.inside.slice(0, 3)).toEqual([233, 30, 99]);
    expect(result.mainPane[3]).toBe(0);
    expect(result.rightAxis[3]).toBe(0);
});

test('primitive autoscale contributes to only its pane and price scale', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());

    const result = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const ranges: any[] = [];
        let attachedContext: any;
        let coordinateInsideAutoscale: number | null = null;
        const before = fixture.candles.priceToCoordinate(1_000);
        const primitive = {
            attached(context: any) { attachedContext = context; },
            detached() {},
            updateAllViews() {},
            autoscaleInfo(range: any) {
                ranges.push({ ...range });
                coordinateInsideAutoscale = attachedContext.priceToCoordinate(120);
                return {
                    priceRange: { min: 90, max: 1_000 },
                    margins: { above: 100, below: 12 },
                };
            },
        };
        fixture.chart.attachPrimitive(primitive, { series: fixture.candles });
        await fixture.settle();

        const pane = attachedContext.pane.getSize();
        const during = fixture.candles.priceToCoordinate(1_000);
        const callsAfterFrame = ranges.length;
        fixture.chart.detachPrimitive(primitive);
        await fixture.settle();
        const after = fixture.candles.priceToCoordinate(1_000);
        return {
            before,
            during,
            after,
            plotTop: pane.top + 8,
            plotBottom: pane.top + pane.height,
            callsAfterFrame,
            range: ranges[0],
            priceScaleId: attachedContext.priceScaleId,
            coordinateInsideAutoscale,
        };
    });

    expect(result.before).toBeLessThan(result.plotTop);
    expect(result.during).toBeGreaterThan(result.plotTop + 80);
    expect(result.during).toBeLessThan(result.plotBottom);
    expect(result.after).toBeLessThan(result.plotTop);
    expect(result.callsAfterFrame).toBe(1);
    expect(result.range.to).toBeGreaterThan(result.range.from);
    expect(result.priceScaleId).toBe('right');
    expect(result.coordinateInsideAutoscale).not.toBeNull();
});

test('primitive can own an independent scale without a series', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());

    const result = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        let context: any;
        fixture.chart.attachPrimitive({
            attached(value: any) { context = value; },
            detached() {},
            updateAllViews() {},
            autoscaleInfo: () => ({ priceRange: { min: 900, max: 1_000 } }),
        }, { pane: fixture.chart.panes()[0], priceScaleId: 'left' });
        await fixture.settle();
        return {
            left: context.priceToCoordinate(1_000),
            right: fixture.candles.priceToCoordinate(1_000),
            pane: context.pane.getSize(),
            priceScaleId: context.priceScaleId,
        };
    });

    expect(result.left).toBeGreaterThan(result.pane.top + 8);
    expect(result.left).toBeLessThan(result.pane.top + result.pane.height);
    expect(result.right).toBeLessThan(result.pane.top + 8);
    expect(result.priceScaleId).toBe('left');
});
