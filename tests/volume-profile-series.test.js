const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    ExactVolumeProfileSeries,
    OrderFlowDataMode,
    VolumeProfileAlignment,
    VolumeProfileDisplayMode,
    VolumeProfileRangeMode,
    defaultExactVolumeProfileSeriesOptions,
    selectExactVolumeProfileBars,
} = require('../src/orderflow/index.js');

function bar(time, price = 100) {
    return {
        dataMode: OrderFlowDataMode.Exact,
        time,
        open: price,
        high: price + 1,
        low: price - 1,
        close: price,
        levels: [
            { price: price - 1, bidVolume: 5, askVolume: 0 },
            { price, bidVolume: 3, askVolume: 9 },
            { price: price + 1, bidVolume: 0, askVolume: 4 },
        ],
    };
}

const bars = [bar(60), bar(120, 101), bar(180, 102), bar(240, 103)];

function canvas() {
    const operations = [];
    return {
        operations,
        globalAlpha: 1,
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textBaseline: '',
        textAlign: '',
        fillRect(...args) {
            operations.push({ kind: 'fillRect', args, color: this.fillStyle, alpha: this.globalAlpha });
        },
        fillText(...args) { operations.push({ kind: 'fillText', args, color: this.fillStyle }); },
        beginPath() { operations.push({ kind: 'beginPath' }); },
        moveTo(...args) { operations.push({ kind: 'moveTo', args }); },
        lineTo(...args) { operations.push({ kind: 'lineTo', args }); },
        stroke() { operations.push({ kind: 'stroke', color: this.strokeStyle }); },
    };
}

function render(optionPatch = {}, visibleTimeRange = { from: 100, to: 190 }) {
    const target = canvas();
    const options = {
        ...defaultExactVolumeProfileSeriesOptions,
        tickSize: 1,
        showLabels: false,
        ...optionPatch,
    };
    ExactVolumeProfileSeries.renderer.draw({
        target,
        data: bars.filter(item => item.time >= visibleTimeRange.from && item.time <= visibleTimeRange.to),
        allData: bars,
        options,
        priceRange: { min: 98, max: 105 },
        visibleTimeRange,
        pane: { left: 0, right: 300, top: 0, bottom: 200, width: 300, height: 200 },
        theme: {
            fontFamily: 'sans-serif',
            textColor: '#ffffff',
            horizontalGridColor: '#222222',
            verticalGridColor: '#222222',
        },
        barSpacing: 20,
        metadata: {},
        timeToCoordinate: time => time,
        priceToCoordinate: price => (106 - price) * 15,
    });
    return target.operations;
}

describe('exact Volume Profile range selection', () => {
    it('selects visible and fixed ranges inclusively', () => {
        const visible = selectExactVolumeProfileBars(bars, { from: 100, to: 190 }, {
            rangeMode: VolumeProfileRangeMode.Visible,
            sessionRanges: [],
        });
        const fixed = selectExactVolumeProfileBars(bars, { from: 0, to: 10 }, {
            rangeMode: VolumeProfileRangeMode.Fixed,
            fixedRange: { from: 60, to: 120 },
            sessionRanges: [],
        });

        assert.deepEqual(visible.map(item => item.time), [120, 180]);
        assert.deepEqual(fixed.map(item => item.time), [60, 120]);
        assert.equal(Object.isFrozen(fixed), true);
    });

    it('selects one half-open serializable session by anchor', () => {
        const sessions = [
            { id: 'first', from: 0, to: 150 },
            { id: 'second', from: 150, to: 300 },
        ];
        const selected = selectExactVolumeProfileBars(bars, { from: 100, to: 200 }, {
            rangeMode: VolumeProfileRangeMode.Session,
            sessionRanges: sessions,
            sessionAnchorTime: 200,
        });
        const unavailable = selectExactVolumeProfileBars(bars, { from: 300, to: 320 }, {
            rangeMode: VolumeProfileRangeMode.Session,
            sessionRanges: sessions,
        });

        assert.deepEqual(selected.map(item => item.time), [180, 240]);
        assert.deepEqual(unavailable, []);
    });

    it('rejects ambiguous or incomplete range configuration', () => {
        assert.throws(
            () => selectExactVolumeProfileBars(bars, { from: 0, to: 1 }, {
                rangeMode: VolumeProfileRangeMode.Fixed,
                sessionRanges: [],
            }),
            /fixed range is required/,
        );
        assert.throws(
            () => selectExactVolumeProfileBars(bars, { from: 0, to: 1 }, {
                rangeMode: VolumeProfileRangeMode.Session,
                sessionRanges: [
                    { id: 'a', from: 0, to: 10 },
                    { id: 'b', from: 9, to: 20 },
                ],
            }),
            /must not overlap/,
        );
    });
});

describe('ExactVolumeProfileSeries', () => {
    it('is an all-data custom overlay that does not affect the time scale', () => {
        assert.equal(ExactVolumeProfileSeries.type, 'ExactVolumeProfile');
        assert.equal(ExactVolumeProfileSeries.affectsTimeScale, false);
        assert.equal(ExactVolumeProfileSeries.renderer.drawOutsideVisibleRange, true);
        assert.equal(ExactVolumeProfileSeries.renderer.priceRange(bars, {}), null);
    });

    it('normalizes exact input incrementally and rejects approximate data', () => {
        const processor = ExactVolumeProfileSeries.incrementalDataProcessorFactory();
        const options = { ...defaultExactVolumeProfileSeriesOptions, tickSize: 1 };
        const reset = processor.reset([bars[0]], options);
        const append = processor.update(bars[1], options, 'append');

        assert.equal(Object.isFrozen(reset.data[0]), true);
        assert.deepEqual(
            { fromIndex: append.fromIndex, removed: append.removed },
            { fromIndex: 1, removed: 0 },
        );
        assert.throws(() => processor.update({
            ...bars[2],
            dataMode: 'approximate',
        }, options, 'append'), /dataMode must be 'exact'/);
    });

    it('renders fixed profiles even when their source range is outside the viewport', () => {
        const operations = render({
            rangeMode: VolumeProfileRangeMode.Fixed,
            fixedRange: { from: 60, to: 120 },
            displayMode: VolumeProfileDisplayMode.Total,
            alignment: VolumeProfileAlignment.Right,
        }, { from: 1_000, to: 2_000 });

        assert.ok(operations.some(operation => operation.kind === 'fillRect'));
        assert.ok(operations.some(operation => operation.kind === 'stroke'));
    });

    it('renders total, bid-ask and delta from the same selected exact profile', () => {
        const total = render({ displayMode: VolumeProfileDisplayMode.Total });
        const split = render({ displayMode: VolumeProfileDisplayMode.BidAsk });
        const delta = render({ displayMode: VolumeProfileDisplayMode.Delta });
        const colors = operations => new Set(operations
            .filter(operation => operation.kind === 'fillRect')
            .map(operation => operation.color));

        assert.ok(colors(total).has(defaultExactVolumeProfileSeriesOptions.totalColor));
        assert.ok(colors(split).has(defaultExactVolumeProfileSeriesOptions.bidColor));
        assert.ok(colors(split).has(defaultExactVolumeProfileSeriesOptions.askColor));
        assert.ok(colors(delta).has(defaultExactVolumeProfileSeriesOptions.positiveDeltaColor)
            || colors(delta).has(defaultExactVolumeProfileSeriesOptions.negativeDeltaColor));
    });

    it('draws developing POC, VAH and VAL as three independent paths', () => {
        const operations = render({ showDevelopingLevels: true });
        const strokes = operations.filter(operation => operation.kind === 'stroke');

        assert.ok(strokes.length >= 4);
        assert.ok(strokes.some(operation =>
            operation.color === defaultExactVolumeProfileSeriesOptions.developingValueAreaColor));
    });
});
