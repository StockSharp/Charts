import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());
});

test('pans, zooms and publishes a snapped crosshair event', async ({ page }) => {
    const canvas = page.locator('#chart canvas');
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
        const events = (window as any).__fixture.crosshairEvents;
        return events[events.length - 1];
    });
    expect(crosshair.time).toEqual(expect.any(Number));
    expect(crosshair.point.x).toEqual(expect.any(Number));
    expect(crosshair.point.y).toEqual(expect.any(Number));
});

test('drags a price line and commits the final price once', async ({ page }) => {
    const canvas = page.locator('#chart canvas');
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

test('emits an order-placement intent while Ctrl is held', async ({ page }) => {
    const box = await page.locator('#chart canvas').boundingBox();
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
    const canvas = page.locator('#chart canvas');
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
        return events[events.length - 1];
    });
    expect(last).toEqual({});
});

test('supports touch pan and two-finger pinch zoom', async ({ page }) => {
    const before = await page.evaluate(() => (window as any).__fixture.chart.timeScale().getVisibleRange());

    const touched = await page.evaluate(() => {
        const canvas = document.querySelector('#chart canvas') as HTMLCanvasElement;
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
