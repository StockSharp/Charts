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
