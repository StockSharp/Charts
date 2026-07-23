const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { CommandStack } = require('../src/core/interaction/command-stack.js');
const { PrimitiveHitTestLocation } = require('../src/core/primitives/primitive-api.js');
const {
    BuiltInDrawingType,
    DrawingController,
    builtInPositionDrawingDefinitions,
    getDrawingTypes,
} = require('../src/drawings/index.js');

function render(type, points, optionPatch = {}) {
    const definition = builtInPositionDrawingDefinitions.find(item => item.type === type);
    const options = definition.normalizeOptions({ ...definition.defaultOptions, ...optionPatch });
    const instance = {
        id: `${type}-test`,
        type,
        paneId: 'main',
        points,
        options,
        visible: true,
        locked: false,
        zOrder: 0,
    };
    const binding = definition.create(instance, {
        preview() {},
        commit() {},
        cancel() {},
    });
    binding.primitive.attached({
        chart: {
            subscribeInteractionStateChange() {},
            unsubscribeInteractionStateChange() {},
        },
        timeToCoordinate: time => time,
        coordinateToTime: x => x,
        priceToCoordinate: price => 200 - price,
        coordinateToPrice: y => 200 - y,
        pixelRatio: () => 1,
        theme: () => ({ backgroundColor: '#111', fontFamily: 'Arial' }),
        requestUpdate() {},
        addDisposable() {},
    });
    const calls = [];
    let start = null;
    const context = {
        setLineDash() {},
        beginPath() { start = null; },
        moveTo(x, y) { start = { x, y }; },
        lineTo(x, y) { calls.push(['line', start, { x, y }]); },
        stroke() {},
        arc() {},
        fill() {},
        fillRect(x, y, width, height) { calls.push(['fillRect', x, y, width, height]); },
        fillText(text, x, y) { calls.push(['text', text, x, y]); },
    };
    const plot = { x: 0, y: 0, width: 300, height: 200 };
    binding.primitive.paneViews()[0].renderer().draw({
        pane: { ...plot, plot, isLast: true },
        useMediaCoordinateSpace(consumer) {
            return consumer({ context, mediaSize: { width: 300, height: 220 } });
        },
    });
    return { binding, calls };
}

const hitContext = {
    location: PrimitiveHitTestLocation.Pane,
    priceScaleId: 'right',
};

describe('built-in position drawings', () => {
    it('registers long and short position tools with three editable anchors', () => {
        assert.deepEqual(builtInPositionDrawingDefinitions.map(item => item.type), [
            'long-position',
            'short-position',
        ]);
        assert.equal(builtInPositionDrawingDefinitions.every(
            item => item.points.min === 3 && item.points.max === 3,
        ), true);
        for (const type of ['long-position', 'short-position'])
            assert.equal(getDrawingTypes().includes(type), true);
    });

    it('renders long reward/risk zones and quantity-aware labels', () => {
        const rendered = render(BuiltInDrawingType.LongPosition, [
            { time: 50, price: 100 },
            { time: 150, price: 120 },
            { time: 150, price: 90 },
        ], { quantity: 2 });
        assert.deepEqual(rendered.calls.slice(0, 2), [
            ['fillRect', 50, 80, 100, 20],
            ['fillRect', 50, 100, 100, 10],
        ]);
        const labels = rendered.calls.filter(call => call[0] === 'text').map(call => call[1]);
        assert.deepEqual(labels, [
            'Target 120  +40 (+20.00%)',
            'Entry 100  Qty 2  R:R 2.00',
            'Stop 90  -20 (-10.00%)',
        ]);
        assert.notEqual(
            rendered.binding.primitive.hitTest({ x: 100, y: 95 }, hitContext),
            null,
        );
    });

    it('uses inverse P&L direction for a short position', () => {
        const rendered = render(BuiltInDrawingType.ShortPosition, [
            { time: 20, price: 100 },
            { time: 120, price: 80 },
            { time: 120, price: 110 },
        ], { quantity: 3 });
        const labels = rendered.calls.filter(call => call[0] === 'text').map(call => call[1]);
        assert.deepEqual(labels, [
            'Target 80  +60 (+20.00%)',
            'Entry 100  Qty 3  R:R 2.00',
            'Stop 110  -30 (-10.00%)',
        ]);
    });

    it('validates quantity and styles before mutating controller state', () => {
        const commands = new CommandStack();
        const pane = { id: () => 'main', series: () => [] };
        const chart = {
            panes: () => [pane],
            commandStack: () => commands,
            attachPrimitive() {},
            detachPrimitive() {},
        };
        const controller = new DrawingController({ chart });
        const created = controller.create(BuiltInDrawingType.LongPosition, [
            { time: 10, price: 100 },
            { time: 20, price: 110 },
            { time: 20, price: 95 },
        ], { id: 'position', options: { quantity: 5 } });
        assert.equal(created.options.quantity, 5);

        assert.throws(() => controller.updateOptions('position', { quantity: 0 }), /quantity/);
        assert.deepEqual(controller.get('position'), created);
        assert.throws(() => controller.updateOptions('position', { stopColor: '' }), /stopColor/);
        assert.deepEqual(controller.get('position'), created);
    });
});
