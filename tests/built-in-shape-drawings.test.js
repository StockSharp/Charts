const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { CommandStack } = require('../src/core/interaction/command-stack.js');
const { PrimitiveHitTestLocation } = require('../src/core/primitives/primitive-api.js');
const {
    BuiltInDrawingType,
    DrawingController,
    builtInShapeDrawingDefinitions,
    getDrawingTypes,
} = require('../src/drawings/index.js');

function instance(type, points, options) {
    return {
        id: `${type}-test`,
        type,
        paneId: 'main',
        points,
        options,
        visible: true,
        locked: false,
        zOrder: 0,
    };
}

function render(type, points, options) {
    const definition = builtInShapeDrawingDefinitions.find(item => item.type === type);
    const normalized = definition.normalizeOptions({ ...definition.defaultOptions, ...options });
    const binding = definition.create(instance(type, points, normalized), {
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
        theme: () => ({ backgroundColor: '#111' }),
        requestUpdate() {},
        addDisposable() {},
    });
    const calls = [];
    const context = {
        setLineDash() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        arc() {},
        fill() {},
        fillRect(x, y, width, height) { calls.push(['fillRect', x, y, width, height]); },
        strokeRect(x, y, width, height) { calls.push(['strokeRect', x, y, width, height]); },
        measureText(text) { return { width: text.length * 7 }; },
        fillText(text, x, y) { calls.push(['fillText', text, x, y]); },
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

describe('built-in shape drawings', () => {
    it('registers rectangle, text and note definitions', () => {
        assert.deepEqual(builtInShapeDrawingDefinitions.map(item => item.type), [
            'rectangle',
            'text',
            'note',
        ]);
        assert.deepEqual(builtInShapeDrawingDefinitions.map(item => item.points.min), [2, 1, 1]);
        for (const type of ['rectangle', 'text', 'note'])
            assert.equal(getDrawingTypes().includes(type), true);
    });

    it('renders and hit-tests a rectangle from either diagonal direction', () => {
        const rendered = render(BuiltInDrawingType.Rectangle, [
            { time: 150, price: 50 },
            { time: 50, price: 150 },
        ]);
        assert.deepEqual(rendered.calls.slice(0, 2), [
            ['fillRect', 50, 50, 100, 100],
            ['strokeRect', 50, 50, 100, 100],
        ]);
        assert.notEqual(
            rendered.binding.primitive.hitTest({ x: 100, y: 100 }, hitContext),
            null,
        );
        assert.equal(
            rendered.binding.primitive.hitTest({ x: 220, y: 100 }, hitContext),
            null,
        );
    });

    it('uses measured multiline canvas bounds for text hit testing', () => {
        const rendered = render(
            BuiltInDrawingType.Text,
            [{ time: 40, price: 160 }],
            { text: 'A\nBB', fontSize: 16, padding: 5 },
        );
        assert.deepEqual(rendered.calls[0], ['fillRect', 40, 40, 24, 50]);
        assert.deepEqual(rendered.calls.filter(call => call[0] === 'fillText'), [
            ['fillText', 'A', 45, 45],
            ['fillText', 'BB', 45, 65],
        ]);
        assert.notEqual(
            rendered.binding.primitive.hitTest({ x: 60, y: 80 }, hitContext),
            null,
        );
        assert.equal(
            rendered.binding.primitive.hitTest({ x: 70, y: 80 }, hitContext),
            null,
        );
    });

    it('rejects invalid shape styles without mutating controller state', () => {
        const commands = new CommandStack();
        const pane = { id: () => 'main', series: () => [] };
        const chart = {
            panes: () => [pane],
            commandStack: () => commands,
            attachPrimitive() {},
            detachPrimitive() {},
        };
        const controller = new DrawingController({ chart });
        const created = controller.create(BuiltInDrawingType.Note, [
            { time: 10, price: 100 },
        ], { id: 'note', options: { text: 'Risk', fontSize: 18 } });
        assert.equal(created.options.text, 'Risk');
        assert.equal(created.options.fontSize, 18);

        assert.throws(() => controller.updateOptions('note', { fontSize: 2 }), /fontSize/);
        assert.deepEqual(controller.get('note'), created);
        assert.throws(() => controller.updateOptions('note', { text: 42 }), /text must be a string/);
        assert.deepEqual(controller.get('note'), created);
    });
});
