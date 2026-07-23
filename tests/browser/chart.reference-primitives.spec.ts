import { expect, test } from '@playwright/test';

test('HorizontalLine drag is selected, does not pan, and creates one command', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());

    const initial = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const api = (window as any).SSChart;
        const price = fixture.bars[90].close;
        const line = new api.HorizontalLine({
            id: 'reference-horizontal',
            price,
            color: '#b388ff',
            title: 'REF',
            priceFormatter: (value: number) => value.toFixed(2),
        });
        fixture.chart.attachPrimitive(line, { series: fixture.candles });
        await fixture.settle();
        (window as any).__horizontalLine = line;
        return {
            price,
            y: fixture.candles.priceToCoordinate(price),
            range: fixture.chart.timeScale().getVisibleRange(),
        };
    });
    expect(initial.y).not.toBeNull();

    const canvas = page.locator('#chart canvas[data-sschart-layer="overlay"]');
    const box = await canvas.boundingBox();
    if (box === null || initial.y === null) throw new Error('chart canvas is missing');
    await page.mouse.move(box.x + 360, box.y + initial.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 360, box.y + initial.y + 42, { steps: 8 });
    await page.mouse.up();

    const dragged = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        const line = (window as any).__horizontalLine;
        return {
            price: line.price(),
            range: fixture.chart.timeScale().getVisibleRange(),
            history: fixture.chart.commandStack().snapshot(),
            interaction: fixture.chart.interactionState(),
        };
    });
    expect(dragged.price).toBeLessThan(initial.price);
    expect(dragged.range).toEqual(initial.range);
    expect(dragged.history.undoCount).toBe(1);
    expect(dragged.history.undoLabel).toBe('Move horizontal line');
    expect(dragged.interaction.state).toBe('selected');
    expect(dragged.interaction.selected.id).toBe('reference-horizontal');

    const history = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        const line = (window as any).__horizontalLine;
        fixture.chart.commandStack().undo();
        const undone = line.price();
        fixture.chart.commandStack().redo();
        return { undone, redone: line.price(), snapshot: fixture.chart.commandStack().snapshot() };
    });
    expect(history.undone).toBeCloseTo(initial.price, 10);
    expect(history.redone).toBeCloseTo(dragged.price, 10);
    expect(history.snapshot.undoCount).toBe(1);
});

test('TrendLine body drag preserves its shape and creates one command', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());

    const initial = await page.evaluate(async () => {
        const fixture = (window as any).__fixture;
        const api = (window as any).SSChart;
        const start = { time: fixture.bars[55].time, price: fixture.bars[55].close };
        const end = { time: fixture.bars[125].time, price: fixture.bars[125].close };
        const line = new api.TrendLine({ id: 'reference-trend', start, end, color: '#ffb300' });
        fixture.chart.attachPrimitive(line, { series: fixture.candles });
        await fixture.settle();
        const startScreen = {
            x: fixture.chart.timeScale().timeToCoordinate(start.time),
            y: fixture.candles.priceToCoordinate(start.price),
        };
        const endScreen = {
            x: fixture.chart.timeScale().timeToCoordinate(end.time),
            y: fixture.candles.priceToCoordinate(end.price),
        };
        (window as any).__trendLine = line;
        return {
            start,
            end,
            midpoint: {
                x: (startScreen.x + endScreen.x) / 2,
                y: (startScreen.y + endScreen.y) / 2,
            },
            range: fixture.chart.timeScale().getVisibleRange(),
        };
    });

    const canvas = page.locator('#chart canvas[data-sschart-layer="overlay"]');
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('chart canvas is missing');
    await page.mouse.move(box.x + initial.midpoint.x, box.y + initial.midpoint.y);
    await page.mouse.down();
    await page.mouse.move(
        box.x + initial.midpoint.x + 38,
        box.y + initial.midpoint.y + 28,
        { steps: 8 },
    );
    await page.mouse.up();

    const dragged = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        const line = (window as any).__trendLine;
        return {
            points: line.points(),
            range: fixture.chart.timeScale().getVisibleRange(),
            history: fixture.chart.commandStack().snapshot(),
            interaction: fixture.chart.interactionState(),
        };
    });
    expect(dragged.points.start.time).not.toBe(initial.start.time);
    expect(dragged.points.end.time).not.toBe(initial.end.time);
    expect(dragged.points.start.price).toBeLessThan(initial.start.price);
    expect(dragged.points.end.price).toBeLessThan(initial.end.price);
    expect(dragged.range).toEqual(initial.range);
    expect(dragged.history.undoCount).toBe(1);
    expect(dragged.history.undoLabel).toBe('Move trend line');
    expect(dragged.interaction.state).toBe('selected');
    expect(dragged.interaction.selected.id).toBe('reference-trend');

    const history = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        const line = (window as any).__trendLine;
        fixture.chart.commandStack().undo();
        const undone = line.points();
        fixture.chart.commandStack().redo();
        return { undone, redone: line.points() };
    });
    expect(history.undone).toEqual({ start: initial.start, end: initial.end });
    expect(history.redone).toEqual(dragged.points);
});
