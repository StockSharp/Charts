import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());
});

test('pans, zooms and publishes a snapped crosshair event', async ({ page }) => {
    const canvas = page.locator('#chart canvas[data-sschart-layer="overlay"]');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const before = await page.evaluate(() => (window as any).__fixture.chart.timeScale().getVisibleRange());

    await page.mouse.move(box!.x + 500, box!.y + 260);
    await page.mouse.down();
    await page.mouse.move(box!.x + 620, box!.y + 260, { steps: 5 });
    await page.mouse.up();

    const panned = await page.evaluate(() => (window as any).__fixture.chart.timeScale().getVisibleRange());
    expect(panned.from).not.toBe(before.from);
    expect(panned.to - panned.from).toBeCloseTo(before.to - before.from, 5);

    await page.mouse.move(box!.x + 480, box!.y + 260);
    await page.mouse.wheel(0, -350);

    const zoomed = await page.evaluate(() => (window as any).__fixture.chart.timeScale().getVisibleRange());
    expect(zoomed.to - zoomed.from).toBeLessThan(panned.to - panned.from);

    const crosshair = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        const events = fixture.crosshairEvents;
        const event = events[events.length - 1];
        return {
            time: event.time,
            logical: event.logical,
            point: event.point,
            paneId: event.paneId,
            seriesCount: event.seriesData.size,
            candleTime: event.seriesData.get(fixture.candles)?.time,
            sourceType: event.sourceEvent?.type,
        };
    });
    expect(crosshair.time).toEqual(expect.any(Number));
    expect(crosshair.logical).toEqual(expect.any(Number));
    expect(crosshair.point.x).toEqual(expect.any(Number));
    expect(crosshair.point.y).toEqual(expect.any(Number));
    expect(crosshair.paneId).toBe('main');
    expect(crosshair.seriesCount).toBeGreaterThan(0);
    expect(crosshair.candleTime).toBe(crosshair.time);
    expect(crosshair.sourceType).toBe('pointermove');
});

test('drags a price line and commits the final price once', async ({ page }) => {
    const canvas = page.locator('#chart canvas[data-sschart-layer="overlay"]');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const y = await page.evaluate(() => (window as any).__fixture.candles.priceToCoordinate(124));
    expect(y).toEqual(expect.any(Number));

    await page.mouse.move(box!.x + 420, box!.y + y);
    await page.mouse.down();
    await page.mouse.move(box!.x + 420, box!.y + y - 65, { steps: 8 });
    await page.mouse.up();

    const result = await page.evaluate(() => ({
        live: (window as any).__fixture.dragPrices,
        commits: (window as any).__fixture.dragCommits,
        linePrice: (window as any).__fixture.orderLine.options().price,
    }));
    expect(result.live.length).toBeGreaterThan(1);
    expect(result.commits).toHaveLength(1);
    expect(result.commits[0]).toBeGreaterThan(124);
    expect(result.linePrice).toBeCloseTo(result.commits[0], 8);
});

test('price-line close target uses primitive hit-test and consumes the chart click', async ({ page }) => {
    const canvas = page.locator('#chart canvas[data-sschart-layer="overlay"]');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const y = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        fixture.closeCalls = 0;
        fixture.chartClicks = 0;
        fixture.closeLine = fixture.candles.createPriceLine({
            id: 'close-line',
            price: 126,
            color: '#8b5cf6',
            title: 'CLOSE',
            draggable: true,
            onClose: () => fixture.closeCalls++,
        });
        fixture.chart.subscribeClick(() => fixture.chartClicks++);
        return fixture.candles.priceToCoordinate(126);
    });
    await page.evaluate(() => (window as any).__fixture.settle());

    let closeX: number | null = null;
    for (let x = 790; x <= 900; x += 2) {
        await page.mouse.move(box!.x + x, box!.y + y);
        const cursor = await canvas.evaluate((element: HTMLCanvasElement) => element.style.cursor);
        if (cursor === 'pointer') { closeX = x; break; }
    }
    expect(closeX).not.toBeNull();

    const hovered = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        const event = fixture.crosshairEvents.at(-1);
        return { type: event.hoveredObject?.type, id: event.hoveredObject?.id };
    });
    expect(hovered).toEqual({ type: 'price-line', id: 'close-line' });

    await page.mouse.click(box!.x + closeX!, box!.y + y);
    const result = await page.evaluate(() => ({
        closeCalls: (window as any).__fixture.closeCalls,
        chartClicks: (window as any).__fixture.chartClicks,
    }));
    expect(result.closeCalls).toBe(1);
    expect(result.chartClicks).toBe(0);
});

test('emits an order-placement intent while Ctrl is held', async ({ page }) => {
    const box = await page.locator('#chart canvas[data-sschart-layer="overlay"]').boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + 520, box!.y + 240);
    await page.keyboard.down('Control');
    await page.mouse.click(box!.x + 520, box!.y + 240);
    await page.keyboard.up('Control');

    const events = await page.evaluate(() => (window as any).__fixture.orderEvents);
    expect(events).toHaveLength(1);
    expect(events[0].price).toEqual(expect.any(Number));
    expect(events[0].ctrlKey).toBe(true);
    expect(events[0].button).toBe(0);
});

test('clears the crosshair event when the pointer leaves the chart', async ({ page }) => {
    const canvas = page.locator('#chart canvas[data-sschart-layer="overlay"]');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + 400, box!.y + 220);
    await expect.poll(async () => page.evaluate(() => {
        const events = (window as any).__fixture.crosshairEvents;
        return events[events.length - 1]?.time;
    })).toEqual(expect.any(Number));

    await page.mouse.move(box!.x - 20, box!.y + 220);
    const last = await page.evaluate(() => {
        const events = (window as any).__fixture.crosshairEvents;
        const event = events[events.length - 1];
        return {
            time: event.time,
            logical: event.logical,
            point: event.point,
            paneId: event.paneId,
            seriesCount: event.seriesData.size,
            hoveredObject: event.hoveredObject,
            sourceType: event.sourceEvent?.type,
        };
    });
    expect(last).toEqual({
        time: null,
        logical: null,
        point: null,
        paneId: null,
        seriesCount: 0,
        hoveredObject: null,
        sourceType: 'pointerleave',
    });
});

test('sets and clears a controlled crosshair through the same event model', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const point = fixture.average.data()[70];
        fixture.chart.setCrosshairPosition({
            time: point.time,
            price: point.value,
            series: fixture.average,
        });
        await fixture.settle();
        const positioned = fixture.crosshairEvents[fixture.crosshairEvents.length - 1];
        const summary = {
            time: positioned.time,
            logical: positioned.logical,
            paneId: positioned.paneId,
            point: positioned.point,
            expectedX: fixture.chart.timeScale().timeToCoordinate(point.time),
            expectedY: fixture.average.priceToCoordinate(point.value),
            value: positioned.seriesData.get(fixture.average)?.value,
            hoveredType: positioned.hoveredObject?.type,
            hoveredSeries: positioned.hoveredObject?.series === fixture.average,
            sourceEvent: positioned.sourceEvent,
        };
        fixture.chart.clearCrosshairPosition();
        const cleared = fixture.crosshairEvents[fixture.crosshairEvents.length - 1];
        return {
            summary,
            cleared: {
                time: cleared.time,
                point: cleared.point,
                paneId: cleared.paneId,
                seriesCount: cleared.seriesData.size,
                sourceEvent: cleared.sourceEvent,
            },
        };
    });

    expect(result.summary.time).toEqual(expect.any(Number));
    expect(result.summary.logical).toEqual(expect.any(Number));
    expect(result.summary.paneId).toBe('main');
    expect(result.summary.point.x).toBeCloseTo(result.summary.expectedX, 8);
    expect(result.summary.point.y).toBeCloseTo(result.summary.expectedY, 8);
    expect(result.summary.value).toEqual(expect.any(Number));
    expect(result.summary.hoveredType).toBe('series');
    expect(result.summary.hoveredSeries).toBe(true);
    expect(result.summary.sourceEvent).toBeNull();
    expect(result.cleared).toEqual({
        time: null,
        point: null,
        paneId: null,
        seriesCount: 0,
        sourceEvent: null,
    });
});

test('repaints only the overlay when the pointer moves', async ({ page }) => {
    const canvas = page.locator('#chart canvas[data-sschart-layer="overlay"]');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.evaluate(() => (window as any).RenderTracker.reset());
    await page.mouse.move(box!.x + 440, box!.y + 230);
    await page.evaluate(() => (window as any).__fixture.settle());

    const paints = await page.evaluate(() => (window as any).RenderTracker.snapshot());
    expect(paints.base).toBe(0);
    expect(paints.overlay).toBeGreaterThan(0);
});

test('supports touch pan and two-finger pinch zoom', async ({ page }) => {
    const before = await page.evaluate(() => (window as any).__fixture.chart.timeScale().getVisibleRange());

    const touched = await page.evaluate(() => {
        const canvas = document.querySelector('#chart canvas[data-sschart-layer="overlay"]') as HTMLCanvasElement;
        const rect = canvas.getBoundingClientRect();
        const pointer = (target: EventTarget, type: string, x: number) => target.dispatchEvent(new PointerEvent(type, {
            pointerId: 41,
            pointerType: 'touch',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: rect.left + x,
            clientY: rect.top + 230,
            bubbles: true,
            cancelable: true,
        }));

        pointer(canvas, 'pointermove', 420);
        pointer(canvas, 'pointerdown', 420);
        pointer(canvas, 'pointermove', 570);
        pointer(window, 'pointerup', 570);

        const touch = (id: number, x: number) => new Touch({
            identifier: id,
            target: canvas,
            clientX: rect.left + x,
            clientY: rect.top + 260,
            pageX: rect.left + x,
            pageY: rect.top + 260,
            screenX: rect.left + x,
            screenY: rect.top + 260,
            radiusX: 2,
            radiusY: 2,
            rotationAngle: 0,
            force: 1,
        });
        const emitTouches = (type: string, touches: Touch[]) => canvas.dispatchEvent(new TouchEvent(type, {
            touches,
            targetTouches: touches,
            changedTouches: touches,
            bubbles: true,
            cancelable: true,
        }));

        emitTouches('touchstart', [touch(1, 360), touch(2, 560)]);
        emitTouches('touchmove', [touch(1, 270), touch(2, 650)]);
        emitTouches('touchend', []);
        return canvas.style.touchAction;
    });

    expect(touched).toBe('none');
    const after = await page.evaluate(() => (window as any).__fixture.chart.timeScale().getVisibleRange());
    expect(after.from).not.toBe(before.from);
    expect(after.to - after.from).toBeLessThan(before.to - before.from);
});
