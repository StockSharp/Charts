const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { SeriesRendererRegistry } = require('../src/series/registry.js');
const {
    FootprintDetailLevel,
    FootprintDisplayMode,
    FootprintSeries,
    OrderFlowDataMode,
    defaultFootprintSeriesOptions,
    resolveFootprintDetailLevel,
} = require('../src/orderflow/index.js');

function bar(overrides = {}) {
    return {
        dataMode: OrderFlowDataMode.Exact,
        time: 60,
        open: 100,
        high: 102,
        low: 100,
        close: 101,
        levels: [
            { price: 100, bidVolume: 10, askVolume: 0 },
            { price: 101, bidVolume: 4, askVolume: 16 },
            { price: 102, bidVolume: 2, askVolume: 8 },
        ],
        ...overrides,
    };
}

function recordingCanvas() {
    const operations = [];
    return {
        operations,
        globalAlpha: 1,
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: 'center',
        textBaseline: 'middle',
        fillRect(...args) { operations.push({ kind: 'fillRect', args, alpha: this.globalAlpha }); },
        strokeRect(...args) { operations.push({ kind: 'strokeRect', args }); },
        fillText(...args) { operations.push({ kind: 'fillText', args }); },
        beginPath() { operations.push({ kind: 'beginPath' }); },
        moveTo(...args) { operations.push({ kind: 'moveTo', args }); },
        lineTo(...args) { operations.push({ kind: 'lineTo', args }); },
        closePath() { operations.push({ kind: 'closePath' }); },
        stroke() { operations.push({ kind: 'stroke' }); },
        fill() { operations.push({ kind: 'fill' }); },
    };
}

function render(mode, detailLevel, barSpacing = 80, pixelsPerTick = 16) {
    const target = recordingCanvas();
    const options = {
        ...defaultFootprintSeriesOptions,
        tickSize: 1,
        mode,
        detailLevel,
        showUnfinishedAuctions: false,
    };
    FootprintSeries.renderer.draw({
        target,
        data: [bar()],
        allData: [bar()],
        options,
        priceRange: { min: 99, max: 103 },
        visibleTimeRange: { from: 0, to: 180 },
        pane: { left: 0, right: 200, top: 0, bottom: 200, width: 200, height: 200 },
        theme: {
            fontFamily: 'sans-serif',
            textColor: '#ffffff',
            horizontalGridColor: '#222222',
            verticalGridColor: '#222222',
        },
        barSpacing,
        metadata: {},
        timeToCoordinate: () => 100,
        priceToCoordinate: price => (103 - price) * pixelsPerTick,
    });
    return target.operations;
}

describe('FootprintSeries custom definition', () => {
    it('registers through the public custom-series contract', () => {
        const registry = new SeriesRendererRegistry();

        assert.equal(registry.resolve(FootprintSeries), FootprintSeries);
        assert.equal(registry.get('Footprint'), FootprintSeries);
        assert.equal(typeof FootprintSeries.renderer.draw, 'function');
        assert.equal(typeof FootprintSeries.incrementalDataProcessorFactory, 'function');
    });

    it('normalizes setData and emits one-point incremental patches', () => {
        const processor = FootprintSeries.incrementalDataProcessorFactory();
        const options = { ...defaultFootprintSeriesOptions, tickSize: 1 };
        const reset = processor.reset([bar()], options);
        const appended = processor.update(bar({ time: 120 }), options, 'append');
        const updated = processor.update(bar({ time: 120, close: 102 }), options, 'update');

        assert.equal(Object.isFrozen(reset.data), true);
        assert.equal(Object.isFrozen(reset.data[0]), true);
        assert.deepEqual(
            { fromIndex: appended.fromIndex, removed: appended.removed },
            { fromIndex: 1, removed: 0 },
        );
        assert.deepEqual(
            { fromIndex: updated.fromIndex, removed: updated.removed },
            { fromIndex: 1, removed: 1 },
        );
        assert.throws(() => processor.update({
            ...bar({ time: 180 }),
            dataMode: 'approximate',
        }, options, 'append'), /dataMode must be 'exact'/);
    });

    it('renders bid-ask, delta, total and ladder as distinct number modes', () => {
        const bidAsk = render(FootprintDisplayMode.BidAsk, FootprintDetailLevel.Numbers);
        const delta = render(FootprintDisplayMode.Delta, FootprintDetailLevel.Numbers);
        const total = render(FootprintDisplayMode.Total, FootprintDetailLevel.Numbers);
        const ladder = render(FootprintDisplayMode.Ladder, FootprintDetailLevel.Numbers);
        const texts = operations => operations
            .filter(operation => operation.kind === 'fillText')
            .map(operation => operation.args[0]);

        assert.ok(texts(bidAsk).every(value => value.includes('×')));
        assert.ok(texts(delta).some(value => String(value).startsWith('+')));
        assert.ok(texts(total).every(value => !value.includes('×')));
        assert.equal(texts(ladder).length, bar().levels.length * 2);
        assert.notDeepEqual(texts(delta), texts(total));
    });

    it('selects numbers, heatmap and summary solely from render geometry', () => {
        const options = defaultFootprintSeriesOptions;
        assert.equal(resolveFootprintDetailLevel(
            { barSpacing: 80, cellHeight: 16 }, options,
        ), FootprintDetailLevel.Numbers);
        assert.equal(resolveFootprintDetailLevel(
            { barSpacing: 20, cellHeight: 4 }, options,
        ), FootprintDetailLevel.Heatmap);
        assert.equal(resolveFootprintDetailLevel(
            { barSpacing: 4, cellHeight: 1 }, options,
        ), FootprintDetailLevel.Summary);

        const numbers = render(FootprintDisplayMode.Delta, FootprintDetailLevel.Auto, 80, 16);
        const heatmap = render(FootprintDisplayMode.Delta, FootprintDetailLevel.Auto, 20, 4);
        const summary = render(FootprintDisplayMode.Delta, FootprintDetailLevel.Auto, 4, 1);
        assert.ok(numbers.some(operation => operation.kind === 'fillText'));
        assert.equal(heatmap.some(operation => operation.kind === 'fillText'), false);
        assert.equal(summary.some(operation => operation.kind === 'fillText'), false);
        assert.ok(summary.some(operation => operation.kind === 'stroke'));
    });

    it('validates calculation and render options before drawing', () => {
        assert.throws(
            () => render('unknown', FootprintDetailLevel.Numbers),
            /mode is invalid/,
        );
        assert.throws(
            () => resolveFootprintDetailLevel({ barSpacing: -1, cellHeight: 2 }),
            /barSpacing must be non-negative/,
        );
        const processor = FootprintSeries.incrementalDataProcessorFactory();
        assert.throws(
            () => processor.reset([], {
                ...defaultFootprintSeriesOptions,
                valueAreaPercentage: 2,
            }),
            /valueAreaPercentage/,
        );
    });
});
