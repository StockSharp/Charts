const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    PrimitiveHitTestLocation,
    PrimitiveHitTestRole,
} = require('../src/core/primitives/primitive-api.js');
const { pointSegmentDistance } = require('../src/primitives/drawing-utils.js');
const {
    InteractiveDrawingPrimitive,
    createInteractiveDrawingBinding,
} = require('../src/drawings/index.js');

const visual = {
    draw({ context, points }) {
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        context.lineTo(points[1].x, points[1].y);
        context.stroke();
    },
    hitTest(point, { points }) {
        return pointSegmentDistance(point, points[0], points[1]) <= 6
            ? { cursor: 'move' }
            : null;
    },
    handleColor: () => '#f00',
};

function model(patch = {}) {
    return {
        id: 'managed',
        type: 'trend',
        paneId: 'main',
        points: [
            { time: 100, price: 100 },
            { time: 200, price: 120 },
        ],
        options: { color: '#2962ff' },
        visible: true,
        locked: false,
        zOrder: 0,
        ...patch,
    };
}

function canvas() {
    return {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        setLineDash() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        arc() {},
        fill() {},
    };
}

function setup(initial = model()) {
    const events = { previews: [], commits: [], cancels: [] };
    const callbacks = {
        preview: next => events.previews.push(next),
        commit: next => events.commits.push(next),
        cancel: next => events.cancels.push(next),
    };
    const primitive = new InteractiveDrawingPrimitive(initial, callbacks, visual);
    let interactionListener = null;
    let updates = 0;
    primitive.attached({
        chart: {
            subscribeInteractionStateChange(listener) { interactionListener = listener; },
            unsubscribeInteractionStateChange(listener) {
                if (interactionListener === listener) interactionListener = null;
            },
        },
        timeToCoordinate: time => time,
        coordinateToTime: x => x,
        priceToCoordinate: price => 300 - price,
        coordinateToPrice: y => 300 - y,
        pixelRatio: () => 1,
        theme: () => ({ backgroundColor: '#111' }),
        requestUpdate: () => updates++,
        addDisposable() {},
    });
    const plot = { x: 20, y: 10, width: 400, height: 260 };
    primitive.paneViews()[0].renderer().draw({
        pane: { ...plot, plot, isLast: true },
        useMediaCoordinateSpace(consumer) {
            return consumer({ context: canvas(), mediaSize: { width: 500, height: 300 } });
        },
    });
    return {
        events,
        primitive,
        select() {
            interactionListener({ selected: { primitive }, hovered: null, state: 'selected' });
        },
        updates: () => updates,
    };
}

const hitContext = {
    location: PrimitiveHitTestLocation.Pane,
    priceScaleId: 'right',
};

function pointer(hit, x, y, startX = x, startY = y) {
    return {
        point: { x, y },
        startPoint: { x: startX, y: startY },
        delta: { x: x - startX, y: y - startY },
        totalDelta: { x: x - startX, y: y - startY },
        hit: { id: hit.id, role: hit.role, data: hit.data },
        sourceEvent: {},
    };
}

describe('InteractiveDrawingPrimitive', () => {
    it('exposes body selection first and point handles only while selected', () => {
        const { primitive, select } = setup();
        const unselected = primitive.hitTest({ x: 100, y: 200 }, hitContext);
        assert.equal(unselected.role, PrimitiveHitTestRole.Body);

        select();
        const handle = primitive.hitTest({ x: 102, y: 201 }, hitContext);
        assert.equal(handle.id, 'managed:point:0');
        assert.equal(handle.role, PrimitiveHitTestRole.Handle);
        assert.equal(handle.interaction.draggable, true);

        primitive.update(model({ locked: true }));
        const locked = primitive.hitTest({ x: 100, y: 200 }, hitContext);
        assert.equal(locked.role, PrimitiveHitTestRole.Body);
        assert.equal(locked.interaction.draggable, false);
    });

    it('previews point drag and emits one final model on release', () => {
        const { events, primitive, select } = setup();
        select();
        const hit = primitive.hitTest({ x: 100, y: 200 }, hitContext);
        primitive.onPointerDown(pointer(hit, 100, 200));
        primitive.onPointerMove(pointer(hit, 110, 190, 100, 200));
        primitive.onPointerMove(pointer(hit, 120, 170, 100, 200));

        assert.equal(events.previews.length, 2);
        assert.deepEqual(primitive.instance().points, [
            { time: 120, price: 130 },
            { time: 200, price: 120 },
        ]);
        primitive.onPointerUp(pointer(hit, 120, 170, 100, 200));
        assert.equal(events.commits.length, 1);
        assert.deepEqual(events.commits[0], primitive.instance());
        assert.equal(events.cancels.length, 0);
    });

    it('translates every point for body drag and restores the origin on cancel', () => {
        const { events, primitive } = setup();
        const hit = primitive.hitTest({ x: 150, y: 190 }, hitContext);
        primitive.onPointerDown(pointer(hit, 150, 190));
        primitive.onPointerMove(pointer(hit, 160, 210, 150, 190));
        assert.deepEqual(primitive.instance().points, [
            { time: 110, price: 80 },
            { time: 210, price: 100 },
        ]);

        primitive.onPointerCancel(pointer(hit, 160, 210, 150, 190));
        assert.deepEqual(primitive.instance().points, model().points);
        assert.equal(events.cancels.length, 1);
        assert.equal(events.commits.length, 0);
    });

    it('provides a registry binding and rejects identity changes', () => {
        const binding = createInteractiveDrawingBinding(model(), {
            preview() {},
            commit() {},
            cancel() {},
        }, visual);
        binding.update(model({ points: [{ time: 1, price: 2 }, { time: 3, price: 4 }] }));
        assert.deepEqual(binding.primitive.instance().points[0], { time: 1, price: 2 });
        assert.throws(() => binding.update(model({ id: 'other' })), /identity cannot change/);
    });
});
