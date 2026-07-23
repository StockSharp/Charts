const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { CommandStack } = require('../src/core/interaction/command-stack.js');
const { PrimitiveHitTestLocation } = require('../src/core/primitives/primitive-api.js');
const {
    BuiltInDrawingType,
    DrawingController,
    builtInLineDrawingDefinitions,
    getDrawingTypes,
} = require('../src/drawings/index.js');

function drawing(type, points) {
    return {
        id: `${type}-test`,
        type,
        paneId: 'main',
        points,
        options: { color: '#2962ff', lineWidth: 2, lineStyle: 0 },
        visible: true,
        locked: false,
        zOrder: 0,
    };
}

function render(type, points) {
    const definition = builtInLineDrawingDefinitions.find(item => item.type === type);
    const binding = definition.create(drawing(type, points), {
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
    const strokes = [];
    let start = null;
    const context = {
        setLineDash() {},
        beginPath() { start = null; },
        moveTo(x, y) { start = { x, y }; },
        lineTo(x, y) { strokes.push({ start, end: { x, y } }); },
        stroke() {},
        arc() {},
        fill() {},
    };
    const plot = { x: 0, y: 0, width: 300, height: 200 };
    binding.primitive.paneViews()[0].renderer().draw({
        pane: { ...plot, plot, isLast: true },
        useMediaCoordinateSpace(consumer) {
            return consumer({ context, mediaSize: { width: 300, height: 220 } });
        },
    });
    return { binding, strokes };
}

const hitContext = {
    location: PrimitiveHitTestLocation.Pane,
    priceScaleId: 'right',
};

describe('built-in line drawings', () => {
    it('registers the four canonical tools with fixed point schemas', () => {
        assert.deepEqual(builtInLineDrawingDefinitions.map(item => item.type), [
            'horizontal-line',
            'vertical-line',
            'trend-line',
            'ray',
        ]);
        assert.deepEqual(builtInLineDrawingDefinitions.map(item => item.points), [
            { min: 1, max: 1 },
            { min: 1, max: 1 },
            { min: 2, max: 2 },
            { min: 2, max: 2 },
        ]);
        for (const type of Object.values(BuiltInDrawingType))
            assert.equal(getDrawingTypes().includes(type), true);
    });

    it('renders horizontal and vertical lines across the complete plot', () => {
        const horizontal = render(BuiltInDrawingType.HorizontalLine, [{ time: 80, price: 100 }]);
        assert.deepEqual(horizontal.strokes[0], {
            start: { x: 0, y: 100 },
            end: { x: 300, y: 100 },
        });
        assert.notEqual(horizontal.binding.primitive.hitTest({ x: 250, y: 102 }, hitContext), null);

        const vertical = render(BuiltInDrawingType.VerticalLine, [{ time: 80, price: 100 }]);
        assert.deepEqual(vertical.strokes[0], {
            start: { x: 80, y: 0 },
            end: { x: 80, y: 200 },
        });
        assert.notEqual(vertical.binding.primitive.hitTest({ x: 82, y: 180 }, hitContext), null);
    });

    it('keeps trend lines finite and extends rays only beyond their second anchor', () => {
        const points = [{ time: 50, price: 150 }, { time: 100, price: 100 }];
        const trend = render(BuiltInDrawingType.TrendLine, points);
        assert.deepEqual(trend.strokes[0], {
            start: { x: 50, y: 50 },
            end: { x: 100, y: 100 },
        });
        assert.equal(trend.binding.primitive.hitTest({ x: 180, y: 180 }, hitContext), null);

        const ray = render(BuiltInDrawingType.Ray, points);
        assert.deepEqual(ray.strokes[0], {
            start: { x: 50, y: 50 },
            end: { x: 200, y: 200 },
        });
        assert.notEqual(ray.binding.primitive.hitTest({ x: 180, y: 180 }, hitContext), null);
        assert.equal(ray.binding.primitive.hitTest({ x: 30, y: 30 }, hitContext), null);
    });

    it('normalizes style options before an atomic controller update', () => {
        const commands = new CommandStack();
        const pane = { id: () => 'main', series: () => [] };
        const chart = {
            panes: () => [pane],
            commandStack: () => commands,
            attachPrimitive() {},
            detachPrimitive() {},
        };
        const controller = new DrawingController({ chart });
        const created = controller.create(BuiltInDrawingType.TrendLine, [
            { time: 10, price: 100 },
            { time: 20, price: 110 },
        ], { id: 'styled', options: { color: ' #f00 ', lineWidth: 3, lineStyle: 2 } });
        assert.deepEqual(created.options, { color: '#f00', lineWidth: 3, lineStyle: 2 });

        assert.throws(() => controller.updateOptions('styled', { lineWidth: 0 }), /lineWidth/);
        assert.deepEqual(controller.get('styled'), created);
        assert.throws(() => controller.updateOptions('styled', { color: '' }), /color/);
        assert.deepEqual(controller.get('styled'), created);
    });
});
