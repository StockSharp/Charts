const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { CommandStack } = require('../src/core/interaction/command-stack.js');
const {
    PrimitiveHitTestLocation,
    PrimitiveHitTestRole,
} = require('../src/core/primitives/primitive-api.js');
const { HorizontalLine } = require('../src/primitives/horizontal-line.js');

function pointerEvent(y) {
    return {
        point: { x: 120, y },
        startPoint: { x: 120, y: 200 },
        delta: { x: 0, y: y - 200 },
        totalDelta: { x: 0, y: y - 200 },
        hit: { id: 'support', role: PrimitiveHitTestRole.Body, data: null },
        sourceEvent: {},
    };
}

function canvasContext() {
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

describe('HorizontalLine', () => {
    it('renders and hit-tests through the public primitive contract', () => {
        const commands = new CommandStack();
        const line = new HorizontalLine({
            id: 'support', price: 100, title: 'S', priceFormatter: (price) => price.toFixed(2),
        });
        let updates = 0;
        let interactionListener = null;
        const context = {
            chart: {
                subscribeInteractionStateChange(listener) { interactionListener = listener; },
                unsubscribeInteractionStateChange(listener) {
                    if (interactionListener === listener) interactionListener = null;
                },
            },
            commandStack: commands,
            priceToCoordinate: (price) => 300 - price,
            coordinateToPrice: (coordinate) => 300 - coordinate,
            pixelRatio: () => 2,
            requestUpdate: () => updates++,
            addDisposable() {},
        };
        line.attached(context);
        line.updateAllViews();
        assert.equal(line.priceAxisViews()[0].coordinate(), 200);
        assert.equal(line.priceAxisViews()[0].text(), 'S 100.00');

        const plot = { x: 20, y: 10, width: 400, height: 260 };
        line.paneViews()[0].renderer().draw({
            pane: { ...plot, plot, isLast: true },
            useMediaCoordinateSpace(consumer) {
                return consumer({ context: canvasContext(), mediaSize: { width: 500, height: 300 } });
            },
        });
        const hit = line.hitTest({ x: 120, y: 203 }, {
            location: PrimitiveHitTestLocation.Pane,
            priceScaleId: 'right',
        });
        assert.equal(hit.id, 'support');
        assert.equal(hit.role, PrimitiveHitTestRole.Body);
        assert.equal(hit.interaction.draggable, true);
        assert.equal(updates, 0);
    });

    it('records an entire drag as one undoable command', () => {
        const commands = new CommandStack();
        const line = new HorizontalLine({ id: 'support', price: 100 });
        let updates = 0;
        line.attached({
            chart: {
                subscribeInteractionStateChange() {},
                unsubscribeInteractionStateChange() {},
            },
            commandStack: commands,
            priceToCoordinate: (price) => 300 - price,
            coordinateToPrice: (coordinate) => 300 - coordinate,
            pixelRatio: () => 1,
            requestUpdate: () => updates++,
            addDisposable() {},
        });

        line.onPointerDown(pointerEvent(200));
        line.onPointerMove(pointerEvent(190));
        line.onPointerMove(pointerEvent(180));
        assert.equal(line.price(), 120);
        assert.equal(commands.snapshot().undoCount, 0);
        line.onPointerUp(pointerEvent(180));

        assert.equal(line.price(), 120);
        assert.equal(commands.snapshot().undoCount, 1);
        assert.equal(commands.snapshot().undoLabel, 'Move horizontal line');
        assert.equal(commands.undo(), true);
        assert.equal(line.price(), 100);
        assert.equal(commands.redo(), true);
        assert.equal(line.price(), 120);
        assert.ok(updates >= 5);
    });

    it('restores preview on cancel and validates model updates', () => {
        const line = new HorizontalLine({ price: 80, autoscale: true });
        line.attached({
            chart: {
                subscribeInteractionStateChange() {},
                unsubscribeInteractionStateChange() {},
            },
            commandStack: new CommandStack(),
            priceToCoordinate: (price) => price,
            coordinateToPrice: (coordinate) => coordinate,
            pixelRatio: () => 1,
            requestUpdate() {},
            addDisposable() {},
        });
        line.onPointerDown(pointerEvent(80));
        line.onPointerMove(pointerEvent(95));
        line.onPointerCancel(pointerEvent(95));
        assert.equal(line.price(), 80);
        assert.deepEqual(line.autoscaleInfo({ from: 0, to: 10 }), {
            priceRange: { min: 80, max: 80 },
        });
        assert.throws(() => line.setPrice(Number.NaN), /price must be finite/);
        const beforeInvalidPatch = line.options();
        assert.throws(() => line.applyOptions({ price: 90, lineWidth: 0 }), /width/);
        assert.equal(line.price(), beforeInvalidPatch.price);
        assert.throws(() => line.applyOptions({ lineWidth: 0 }), /width/);
    });
});
