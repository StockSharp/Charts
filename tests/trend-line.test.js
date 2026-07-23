const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { CommandStack } = require('../src/core/interaction/command-stack.js');
const {
    PrimitiveHitTestLocation,
    PrimitiveHitTestRole,
} = require('../src/core/primitives/primitive-api.js');
const { TrendLine } = require('../src/primitives/trend-line.js');

function fakeCanvas() {
    return {
        lineWidth: 1,
        strokeStyle: '',
        fillStyle: '',
        setLineDash() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        arc() {},
        fill() {},
    };
}

function interaction(hit, x, y, startX = x, startY = y) {
    return {
        point: { x, y },
        startPoint: { x: startX, y: startY },
        delta: { x: x - startX, y: y - startY },
        totalDelta: { x: x - startX, y: y - startY },
        hit: { id: hit.id, role: hit.role, data: hit.data },
        sourceEvent: {},
    };
}

function attach(line, commands = new CommandStack()) {
    let updates = 0;
    line.attached({
        chart: {
            subscribeInteractionStateChange() {},
            unsubscribeInteractionStateChange() {},
        },
        commandStack: commands,
        timeToCoordinate: (time) => time,
        coordinateToTime: (x) => x,
        priceToCoordinate: (price) => 300 - price,
        coordinateToPrice: (y) => 300 - y,
        pixelRatio: () => 1,
        theme: () => ({ backgroundColor: '#111' }),
        requestUpdate: () => updates++,
        addDisposable() {},
    });
    const plot = { x: 20, y: 10, width: 400, height: 260 };
    line.paneViews()[0].renderer().draw({
        pane: { ...plot, plot, isLast: true },
        useMediaCoordinateSpace(consumer) {
            return consumer({ context: fakeCanvas(), mediaSize: { width: 500, height: 300 } });
        },
    });
    return { commands, updates: () => updates };
}

const hitContext = {
    location: PrimitiveHitTestLocation.Pane,
    priceScaleId: 'right',
};

describe('TrendLine', () => {
    it('prioritizes endpoint handles over its body', () => {
        const line = new TrendLine({
            id: 'trend',
            start: { time: 100, price: 100 },
            end: { time: 200, price: 120 },
        });
        attach(line);

        const start = line.hitTest({ x: 102, y: 201 }, hitContext);
        assert.equal(start.id, 'trend:start');
        assert.equal(start.role, PrimitiveHitTestRole.Handle);
        const body = line.hitTest({ x: 150, y: 190 }, hitContext);
        assert.equal(body.id, 'trend');
        assert.equal(body.role, PrimitiveHitTestRole.Body);
        assert.equal(line.hitTest({ x: 150, y: 220 }, hitContext), null);
    });

    it('clips optional extensions to the plot for rendering and hit testing', () => {
        const line = new TrendLine({
            start: { time: 100, price: 100 },
            end: { time: 200, price: 120 },
            extendRight: true,
        });
        attach(line);
        assert.equal(
            line.hitTest({ x: 300, y: 160 }, hitContext).role,
            PrimitiveHitTestRole.Body,
        );
        line.applyOptions({ extendRight: false });
        assert.equal(line.hitTest({ x: 300, y: 160 }, hitContext), null);
    });

    it('moves one endpoint and records one command for the gesture', () => {
        const line = new TrendLine({
            id: 'trend',
            start: { time: 100, price: 100 },
            end: { time: 200, price: 120 },
        });
        const { commands } = attach(line);
        const hit = line.hitTest({ x: 100, y: 200 }, hitContext);

        line.onPointerDown(interaction(hit, 100, 200));
        line.onPointerMove(interaction(hit, 110, 190, 100, 200));
        line.onPointerMove(interaction(hit, 120, 170, 100, 200));
        assert.deepEqual(line.startPoint(), { time: 120, price: 130 });
        assert.deepEqual(line.endPoint(), { time: 200, price: 120 });
        assert.equal(commands.snapshot().undoCount, 0);
        line.onPointerUp(interaction(hit, 120, 170, 100, 200));

        assert.equal(commands.snapshot().undoCount, 1);
        assert.equal(commands.snapshot().undoLabel, 'Move trend line');
        commands.undo();
        assert.deepEqual(line.points(), {
            start: { time: 100, price: 100 },
            end: { time: 200, price: 120 },
        });
        commands.redo();
        assert.deepEqual(line.startPoint(), { time: 120, price: 130 });
    });

    it('cancels previews and applies option patches atomically', () => {
        const line = new TrendLine({
            start: { time: 100, price: 100 },
            end: { time: 200, price: 120 },
            autoscale: true,
        });
        attach(line);
        const hit = line.hitTest({ x: 100, y: 200 }, hitContext);
        line.onPointerDown(interaction(hit, 100, 200));
        line.onPointerMove(interaction(hit, 140, 160, 100, 200));
        line.onPointerCancel(interaction(hit, 140, 160, 100, 200));
        assert.deepEqual(line.startPoint(), { time: 100, price: 100 });
        assert.deepEqual(line.autoscaleInfo({ from: 0, to: 10 }), {
            priceRange: { min: 100, max: 120 },
            margins: { above: 6, below: 6 },
        });

        assert.throws(() => line.applyOptions({
            start: { time: 150, price: 110 },
            lineWidth: 0,
        }), /width/);
        assert.deepEqual(line.startPoint(), { time: 100, price: 100 });
    });
});
