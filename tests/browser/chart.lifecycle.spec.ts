import { expect, test } from '@playwright/test';

test('remove releases listeners, ResizeObserver and a queued frame', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    const before = await page.evaluate(() => (window as any).LifecycleTracker.snapshot());

    await page.evaluate(() => (window as any).ChartFixture.create({ autoSize: true }));
    const active = await page.evaluate(() => (window as any).LifecycleTracker.snapshot());
    expect(active.listeners).not.toEqual(before.listeners);
    expect(active.resizeObservers).toBe(before.resizeObservers + 1);

    const after = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        fixture.chart.applyOptions({ grid: { vertLines: { color: '#123456' } } });
        const queued = (window as any).LifecycleTracker.snapshot();
        (window as any).ChartFixture.destroyNow();
        return { queued, disposed: (window as any).LifecycleTracker.snapshot() };
    });

    expect(after.queued.animationFrames).toBeGreaterThan(before.animationFrames);
    expect(after.disposed.listeners).toEqual(before.listeners);
    expect(after.disposed.resizeObservers).toBe(before.resizeObservers);
    expect(after.disposed.animationFrames).toBe(before.animationFrames);
    expect(after.disposed.canceledFrames).toBeGreaterThan(before.canceledFrames);
});

test('repeated create/remove cycles do not retain browser resources', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    const before = await page.evaluate(() => (window as any).LifecycleTracker.snapshot());

    await page.evaluate(async () => {
        for (let i = 0; i < 10; i++) {
            await (window as any).ChartFixture.create({ autoSize: true });
            (window as any).ChartFixture.destroyNow();
        }
    });

    const after = await page.evaluate(() => (window as any).LifecycleTracker.snapshot());
    expect(after.listeners).toEqual(before.listeners);
    expect(after.resizeObservers).toBe(before.resizeObservers);
    expect(after.animationFrames).toBe(before.animationFrames);
});

test('primitive lifecycle exposes stable services and owns cleanup', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());

    const attached = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const events: string[] = [];
        const target = new EventTarget();
        let signals = 0;
        let context: any = null;
        const listener = () => signals++;
        target.addEventListener('signal', listener);

        const primitive = {
            attached(value: any) {
                events.push('attached');
                context = value;
                value.addDisposable(() => {
                    events.push('cleanup');
                    target.removeEventListener('signal', listener);
                });
            },
            updateAllViews() { events.push('update'); },
            detached() { events.push('detached'); },
        };
        fixture.chart.attachPrimitive(primitive, { series: fixture.candles });
        target.dispatchEvent(new Event('signal'));
        context.requestUpdate();
        await fixture.settle();

        const result = {
            events: [...events],
            paneOwned: context.pane === fixture.chart.panes()[0],
            seriesOwned: context.series === fixture.candles,
            x: context.timeToCoordinate(fixture.bars[20].time),
            y: context.priceToCoordinate(fixture.bars[20].close),
            time: context.coordinateToTime(context.timeToCoordinate(fixture.bars[20].time)),
            price: context.coordinateToPrice(context.priceToCoordinate(fixture.bars[20].close)),
            ratio: context.pixelRatio(),
            theme: context.theme(),
            signals,
        };

        fixture.chart.detachPrimitive(primitive);
        target.dispatchEvent(new Event('signal'));
        return { ...result, detachedEvents: events, signalsAfterDetach: signals };
    });

    expect(attached.events).toEqual(['attached', 'update', 'update']);
    expect(attached.paneOwned).toBe(true);
    expect(attached.seriesOwned).toBe(true);
    expect(attached.x).not.toBeNull();
    expect(attached.y).not.toBeNull();
    expect(attached.time).toBe((await page.evaluate(() => (window as any).__fixture.bars[20].time)));
    expect(attached.price).toBeCloseTo((await page.evaluate(() => (window as any).__fixture.bars[20].close)), 8);
    expect(attached.ratio).toBeGreaterThanOrEqual(1);
    expect(attached.theme.backgroundColor).toBe('#131820');
    expect(attached.signals).toBe(1);
    expect(attached.signalsAfterDetach).toBe(1);
    expect(attached.detachedEvents).toEqual(['attached', 'update', 'update', 'detached', 'cleanup']);
});

test('chart removal detaches attached primitives', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());

    const events = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        const events: string[] = [];
        fixture.chart.attachPrimitive({
            attached(context: any) {
                events.push('attached');
                context.addDisposable(() => events.push('cleanup'));
            },
            updateAllViews() { events.push('update'); },
            detached() { events.push('detached'); },
        });
        fixture.chart.remove();
        return events;
    });

    expect(events).toEqual(['attached', 'update', 'detached', 'cleanup']);
});

test('chart and primitives share one command history that is released on removal', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());

    const result = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        const stack = fixture.chart.commandStack();
        let primitiveStack: any;
        fixture.chart.attachPrimitive({
            attached(context: any) { primitiveStack = context.commandStack; },
            detached() {},
            updateAllViews() {},
        });
        const model = { value: 0 };
        const command = (delta: number) => ({
            execute() { model.value += delta; },
            undo() { model.value -= delta; },
        });
        stack.beginTransaction('Browser drag');
        stack.execute(command(2));
        stack.execute(command(3));
        stack.commitTransaction();
        const committed = { value: model.value, snapshot: stack.snapshot() };
        stack.undo();
        const undone = model.value;
        fixture.chart.remove();
        let disposed = false;
        try { stack.execute(command(1)); } catch { disposed = true; }
        return {
            sameStack: stack === primitiveStack,
            committed,
            undone,
            afterRemove: stack.snapshot(),
            disposed,
        };
    });

    expect(result.sameStack).toBe(true);
    expect(result.committed.value).toBe(5);
    expect(result.committed.snapshot.undoCount).toBe(1);
    expect(result.committed.snapshot.undoLabel).toBe('Browser drag');
    expect(result.undone).toBe(0);
    expect(result.afterRemove.undoCount).toBe(0);
    expect(result.afterRemove.redoCount).toBe(0);
    expect(result.disposed).toBe(true);
});
