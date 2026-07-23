import { expect, test } from '@playwright/test';

test('custom primitive built only against package root uses every public extension path', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.addScriptTag({
        url: '/tests/browser/fixtures/_dist/custom-primitive-entry.js',
    });
    await page.evaluate(() => (window as any).ChartFixture.create());

    const attached = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const primitive = new (window as any).ExternalRangePrimitive({
            id: 'external-range',
            low: 70,
            high: 100,
        });
        fixture.chart.attachPrimitive(primitive, { series: fixture.candles });
        await fixture.settle();
        const lowY = fixture.candles.priceToCoordinate(70);
        const highY = fixture.candles.priceToCoordinate(100);
        (window as any).__externalPrimitive = primitive;
        return {
            lowY,
            highY,
            middleY: (lowY + highY) / 2,
            pane: fixture.chart.panes()[0].getSize(),
            stats: primitive.stats(),
        };
    });
    expect(attached.lowY).not.toBeNull();
    expect(attached.highY).not.toBeNull();
    expect(attached.lowY).toBeGreaterThan(attached.pane.top);
    expect(attached.highY).toBeGreaterThan(attached.pane.top);
    expect(attached.lowY).toBeLessThan(attached.pane.top + attached.pane.height);
    expect(attached.highY).toBeLessThan(attached.pane.top + attached.pane.height);
    expect(attached.stats.attached).toBe(1);
    expect(attached.stats.draws).toBeGreaterThan(0);

    const canvas = page.locator('#chart canvas[data-sschart-layer="overlay"]');
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('chart canvas is missing');
    await page.mouse.move(box.x + 320, box.y + attached.middleY);
    await expect.poll(() => page.evaluate(() => {
        const events = (window as any).__fixture.crosshairEvents;
        return events.at(-1)?.hoveredObject?.id ?? null;
    })).toBe('external-range');

    await page.mouse.click(box.x + 320, box.y + attached.middleY);
    const selected = await page.evaluate(() => (window as any).__fixture.chart.interactionState());
    expect(selected.state).toBe('selected');
    expect(selected.selected.id).toBe('external-range');

    const detached = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const primitive = (window as any).__externalPrimitive;
        primitive.setRange(60, 105);
        await fixture.settle();
        fixture.chart.detachPrimitive(primitive);
        await fixture.settle();
        return {
            stats: primitive.stats(),
            interaction: fixture.chart.interactionState(),
        };
    });
    expect(detached.stats.detached).toBe(1);
    expect(detached.stats.cleaned).toBe(1);
    expect(detached.stats.updates).toBeGreaterThan(1);
    expect(detached.interaction.selected).toBeNull();
});
