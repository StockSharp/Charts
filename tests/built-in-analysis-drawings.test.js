const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { CommandStack } = require('../src/core/interaction/command-stack.js');
const { PrimitiveHitTestLocation } = require('../src/core/primitives/primitive-api.js');
const {
    BuiltInDrawingType,
    DrawingController,
    builtInAnalysisDrawingDefinitions,
    getDrawingTypes,
} = require('../src/drawings/index.js');

function render(type, points, optionPatch = {}, converters = {}) {
    const definition = builtInAnalysisDrawingDefinitions.find(item => item.type === type);
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
    const priceToCoordinate = converters.priceToCoordinate ?? (price => price);
    binding.primitive.attached({
        chart: {
            subscribeInteractionStateChange() {},
            unsubscribeInteractionStateChange() {},
        },
        timeToCoordinate: converters.timeToCoordinate ?? (time => time),
        coordinateToTime: x => x,
        priceToCoordinate,
        coordinateToPrice: y => y,
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
        strokeRect(x, y, width, height) { calls.push(['strokeRect', x, y, width, height]); },
        measureText(text) { return { width: text.length * 7 }; },
        fillText(text, x, y) { calls.push(['text', text, x, y]); },
    };
    const plot = { x: 0, y: 0, width: 800, height: 700 };
    binding.primitive.paneViews()[0].renderer().draw({
        pane: { ...plot, plot, isLast: true },
        useMediaCoordinateSpace(consumer) {
            return consumer({ context, mediaSize: { width: 800, height: 720 } });
        },
    });
    return { binding, calls, instance: binding.primitive.instance() };
}

const hitContext = {
    location: PrimitiveHitTestLocation.Pane,
    priceScaleId: 'right',
};

describe('built-in analysis drawings', () => {
    it('registers Fibonacci Retracement and Measure as two-point tools', () => {
        assert.deepEqual(builtInAnalysisDrawingDefinitions.map(item => item.type), [
            'fibonacci-retracement',
            'measure',
        ]);
        for (const type of ['fibonacci-retracement', 'measure'])
            assert.equal(getDrawingTypes().includes(type), true);
        assert.equal(builtInAnalysisDrawingDefinitions.every(item => item.points.min === 2), true);
    });

    it('calculates Fibonacci levels in price domain on a nonlinear scale', () => {
        const priceToCoordinate = price => Math.log(price) * 100;
        const rendered = render(
            BuiltInDrawingType.FibonacciRetracement,
            [{ time: 50, price: 100 }, { time: 150, price: 400 }],
            { levels: [0, 0.5, 1], labelsVisible: false },
            { priceToCoordinate },
        );
        const lines = rendered.calls.filter(call => call[0] === 'line');
        assert.equal(lines.length, 3);
        assert.ok(Math.abs(lines[1][2].y - Math.log(250) * 100) < 1e-9);
        assert.ok(Math.abs(
            lines[1][2].y - (Math.log(100) + Math.log(400)) * 50,
        ) > 10);
        assert.notEqual(rendered.binding.primitive.hitTest({
            x: 100,
            y: Math.log(250) * 100,
        }, hitContext), null);
    });

    it('renders an exact price/percent/time label for Measure', () => {
        const rendered = render(BuiltInDrawingType.Measure, [
            { time: 0, price: 100 },
            { time: 3_600, price: 110 },
        ], {}, { timeToCoordinate: time => time / 10 });
        const label = rendered.calls.find(call => call[0] === 'text');
        assert.equal(label[1], '+10 (+10.00%) · 1h');
        assert.notEqual(
            rendered.binding.primitive.hitTest({ x: 180, y: 105 }, hitContext),
            null,
        );
    });

    it('canonicalizes Fibonacci levels and rejects invalid updates atomically', () => {
        const commands = new CommandStack();
        const pane = { id: () => 'main', series: () => [] };
        const chart = {
            panes: () => [pane],
            commandStack: () => commands,
            attachPrimitive() {},
            detachPrimitive() {},
        };
        const controller = new DrawingController({ chart });
        const created = controller.create(BuiltInDrawingType.FibonacciRetracement, [
            { time: 10, price: 100 },
            { time: 20, price: 110 },
        ], { id: 'fib', options: { levels: [1, 0.5, 0, 0.5] } });
        assert.deepEqual(created.options.levels, [0, 0.5, 1]);

        assert.throws(() => controller.updateOptions('fib', { levels: [0, 0] }), /distinct/);
        assert.deepEqual(controller.get('fib'), created);
        assert.throws(() => controller.updateOptions('fib', { levels: [0, 6] }), /\[-5, 5\]/);
        assert.deepEqual(controller.get('fib'), created);
    });
});
