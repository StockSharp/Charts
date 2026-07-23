import { expect, test } from '@playwright/test';

test('primitive hit-test follows reverse paint order and selects one cursor', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());

    await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        const api = (window as any).SSChart;
        const hits: any[] = [];
        const calls: string[] = [];
        const makePrimitive = (name: string, layer: string, role: string, cursor?: string) => ({
            attached() {},
            detached() {},
            updateAllViews() {},
            paneViews: () => [{
                zOrder: () => layer,
                renderer: () => ({ draw() {} }),
            }],
            hitTest(point: any, context: any) {
                calls.push(`${name}:${context.location}:${Math.round(point.x)}`);
                if (context.location !== api.PrimitiveHitTestLocation.Pane) return null;
                return {
                    id: name,
                    role,
                    cursor,
                    data: { owner: name },
                };
            },
        });

        const top = makePrimitive(
            'top-first', api.PrimitiveZOrder.Top, api.PrimitiveHitTestRole.Body, 'grab',
        );
        const normal = makePrimitive(
            'normal-later', api.PrimitiveZOrder.Normal, api.PrimitiveHitTestRole.Handle,
        );
        fixture.chart.attachPrimitive(top);
        fixture.chart.attachPrimitive(normal);
        fixture.chart.subscribeCrosshairMove((event: any) => {
            const hit = event.hoveredObject;
            if (hit?.type === 'primitive') hits.push({
                id: hit.id,
                role: hit.role,
                cursor: hit.cursor,
                owner: hit.data?.owner,
            });
        });
        fixture.chart.subscribeClick((event: any) => {
            const hit = event.hoveredObject;
            (window as any).__primitiveClickHit = hit?.type === 'primitive' ? hit.id : null;
        });
        (window as any).__hitTest = { top, normal, hits, calls, makePrimitive };
    });
    await page.evaluate(() => (window as any).__fixture.settle());

    const canvas = page.locator('#chart canvas[data-sschart-layer="overlay"]');
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('overlay canvas is missing');
    await page.mouse.move(box.x + 220, box.y + 42);

    const first = await page.evaluate(() => {
        const state = (window as any).__hitTest;
        const canvas = document.querySelector(
            '#chart canvas[data-sschart-layer="overlay"]',
        ) as HTMLCanvasElement;
        return { hit: state.hits.at(-1), cursor: canvas.style.cursor, calls: [...state.calls] };
    });
    expect(first.hit).toEqual({
        id: 'top-first', role: 'body', cursor: 'grab', owner: 'top-first',
    });
    expect(first.cursor).toBe('grab');
    expect(first.calls).toHaveLength(2);

    await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        const api = (window as any).SSChart;
        const state = (window as any).__hitTest;
        fixture.chart.detachPrimitive(state.top);
        const last = state.makePrimitive(
            'normal-last', api.PrimitiveZOrder.Normal, api.PrimitiveHitTestRole.Handle,
        );
        fixture.chart.attachPrimitive(last);
        state.last = last;
        state.calls.length = 0;
    });
    await page.evaluate(() => (window as any).__fixture.settle());
    await page.mouse.move(box.x + 221, box.y + 43);

    const second = await page.evaluate(() => {
        const state = (window as any).__hitTest;
        const canvas = document.querySelector(
            '#chart canvas[data-sschart-layer="overlay"]',
        ) as HTMLCanvasElement;
        return { hit: state.hits.at(-1), cursor: canvas.style.cursor, calls: [...state.calls] };
    });
    expect(second.hit).toEqual({
        id: 'normal-last', role: 'handle', cursor: 'pointer', owner: 'normal-last',
    });
    expect(second.cursor).toBe('pointer');
    expect(second.calls).toHaveLength(2);

    await page.mouse.click(box.x + 221, box.y + 43);
    await expect.poll(() => page.evaluate(() => (window as any).__primitiveClickHit)).toBe('normal-last');
});

test('interactive primitive drag is captured and does not pan the chart', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/chart.html');
    await page.evaluate(() => (window as any).ChartFixture.create());

    await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        const api = (window as any).SSChart;
        const events: any[] = [];
        const states: string[] = [];
        let requestUpdate: () => void = () => {};
        let offset = 0;
        const primitive = {
            attached(context: any) { requestUpdate = context.requestUpdate; },
            detached() {},
            updateAllViews() {},
            paneViews: () => [{
                zOrder: () => api.PrimitiveZOrder.Top,
                renderer: () => ({
                    draw(target: any) {
                        target.useMediaCoordinateSpace(({ context }: any) => {
                            context.fillStyle = 'rgba(0, 200, 255, 0.25)';
                            context.fillRect(140 + offset, 60, 140, 80);
                        });
                    },
                }),
            }],
            hitTest(point: any, context: any) {
                if (context.location !== api.PrimitiveHitTestLocation.Pane
                    || point.x < 140 + offset || point.x > 280 + offset
                    || point.y < 60 || point.y > 140) return null;
                return {
                    id: 'drag-body',
                    role: api.PrimitiveHitTestRole.Body,
                    cursor: 'grab',
                    interaction: { selectable: true, draggable: true },
                };
            },
            onPointerDown(event: any) { events.push({ phase: 'down', total: event.totalDelta }); },
            onPointerMove(event: any) {
                offset = event.totalDelta.x;
                events.push({ phase: 'move', total: event.totalDelta, delta: event.delta });
                requestUpdate();
            },
            onPointerUp(event: any) { events.push({ phase: 'up', total: event.totalDelta }); },
        };
        fixture.chart.attachPrimitive(primitive);
        fixture.chart.subscribeInteractionStateChange((snapshot: any) => states.push(snapshot.state));
        (window as any).__interactionTest = { events, states, primitive, getOffset: () => offset };
    });
    await page.evaluate(() => (window as any).__fixture.settle());

    const canvas = page.locator('#chart canvas[data-sschart-layer="overlay"]');
    const box = await canvas.boundingBox();
    if (box === null) throw new Error('overlay canvas is missing');
    const before = await page.evaluate(() => (window as any).__fixture.chart.timeScale().getVisibleRange());

    await page.mouse.move(box.x + 180, box.y + 90);
    await page.mouse.down();
    await page.mouse.move(box.x + 250, box.y + 105, { steps: 7 });
    await page.mouse.up();

    const dragged = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        const state = (window as any).__interactionTest;
        return {
            events: state.events,
            states: state.states,
            offset: state.getOffset(),
            range: fixture.chart.timeScale().getVisibleRange(),
            snapshot: fixture.chart.interactionState(),
        };
    });
    expect(dragged.events[0].phase).toBe('down');
    expect(dragged.events.filter((event: any) => event.phase === 'move').length).toBeGreaterThan(0);
    expect(dragged.events.at(-1).phase).toBe('up');
    expect(dragged.events.at(-1).total.x).toBeCloseTo(70, 5);
    expect(dragged.offset).toBeGreaterThan(50);
    expect(dragged.range.from).toBe(before.from);
    expect(dragged.range.to).toBe(before.to);
    expect(dragged.states).toContain('dragging-body');
    expect(dragged.snapshot.state).toBe('selected');
    expect(dragged.snapshot.selected.id).toBe('drag-body');

    const eventCount = dragged.events.length;
    await page.mouse.move(box.x + 500, box.y + 250);
    await page.mouse.down();
    await page.mouse.move(box.x + 590, box.y + 250, { steps: 5 });
    await page.mouse.up();

    const panned = await page.evaluate(() => {
        const fixture = (window as any).__fixture;
        const state = (window as any).__interactionTest;
        return {
            range: fixture.chart.timeScale().getVisibleRange(),
            eventCount: state.events.length,
            states: state.states,
            snapshot: fixture.chart.interactionState(),
        };
    });
    expect(panned.range.from).not.toBe(before.from);
    expect(panned.eventCount).toBe(eventCount);
    expect(panned.states).toContain('panning');
    expect(panned.snapshot.selected).toBeNull();
});
