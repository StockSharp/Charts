const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    TpoDisplayMode,
    TpoSeries,
    calculateTpoProfiles,
    defaultTpoSeriesOptions,
    normalizeTpoBars,
    tpoSymbolForPeriod,
} = require('../src/orderflow/index.js');

function tpoBar(time, sessionId, low, high, overrides = {}) {
    return {
        time,
        sessionId,
        open: low,
        high,
        low,
        close: high,
        ...overrides,
    };
}

const source = [
    tpoBar(60, '2026-07-22', 100, 102),
    tpoBar(120, '2026-07-22', 101, 103),
    tpoBar(180, '2026-07-23', 102, 104),
];

describe('TPO calculation', () => {
    it('builds independent session profiles, POC, value area and initial balance', () => {
        const profiles = calculateTpoProfiles(source, {
            tickSize: 1,
            valueAreaPercentage: 0.6,
            initialBalancePeriods: 2,
        });

        assert.equal(profiles.length, 2);
        assert.deepEqual(profiles[0], {
            sessionId: '2026-07-22',
            from: 60,
            to: 120,
            periodCount: 2,
            totalTpos: 6,
            levels: [
                {
                    price: 100, count: 1, periodIndexes: [0],
                    symbols: ['A'], singlePrint: true,
                },
                {
                    price: 101, count: 2, periodIndexes: [0, 1],
                    symbols: ['A', 'B'], singlePrint: false,
                },
                {
                    price: 102, count: 2, periodIndexes: [0, 1],
                    symbols: ['A', 'B'], singlePrint: false,
                },
                {
                    price: 103, count: 1, periodIndexes: [1],
                    symbols: ['B'], singlePrint: true,
                },
            ],
            pocPrice: 101,
            pocCount: 2,
            valueArea: {
                low: 101,
                high: 102,
                count: 4,
                targetCount: 6 * 0.6,
                percentage: 0.6,
            },
            initialBalanceLow: 100,
            initialBalanceHigh: 103,
        });
        assert.equal(profiles[1].sessionId, '2026-07-23');
        assert.equal(profiles[1].periodCount, 1);
        assert.equal(Object.isFrozen(profiles[0].levels[0].symbols), true);
    });

    it('cycles deterministic period symbols without losing period identity', () => {
        assert.equal(tpoSymbolForPeriod(0, 'AB'), 'A');
        assert.equal(tpoSymbolForPeriod(1, 'AB'), 'B');
        assert.equal(tpoSymbolForPeriod(2, 'AB'), 'A2');
        assert.throws(() => tpoSymbolForPeriod(0, 'AA'), /must be unique/);
    });

    it('requires tick-aligned OHLC, ordered time and contiguous sessions', () => {
        assert.throws(
            () => normalizeTpoBars([
                source[0], source[2], tpoBar(240, '2026-07-22', 100, 101),
            ], { tickSize: 1 }),
            /one contiguous span/,
        );
        assert.throws(
            () => normalizeTpoBars([source[1], source[0]], { tickSize: 1 }),
            /strictly increasing/,
        );
        assert.throws(
            () => normalizeTpoBars([
                tpoBar(60, 'session', 100.5, 102),
            ], { tickSize: 1 }),
            /align to tickSize/,
        );
    });

    it('bounds pathological price spans before allocating levels', () => {
        assert.throws(
            () => calculateTpoProfiles([
                tpoBar(60, 'session', 0, 100),
            ], { tickSize: 1, maxLevelsPerBar: 10 }),
            /maximum is 10/,
        );
    });
});

function canvas() {
    const operations = [];
    return {
        operations,
        globalAlpha: 1,
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: '',
        textBaseline: '',
        fillRect(...args) { operations.push({ kind: 'fillRect', args, color: this.fillStyle }); },
        fillText(...args) { operations.push({ kind: 'fillText', args, color: this.fillStyle }); },
        beginPath() { operations.push({ kind: 'beginPath' }); },
        moveTo(...args) { operations.push({ kind: 'moveTo', args }); },
        lineTo(...args) { operations.push({ kind: 'lineTo', args }); },
        stroke() { operations.push({ kind: 'stroke', color: this.strokeStyle }); },
    };
}

function render(displayMode, barSpacing = 30, pixelsPerTick = 15) {
    const target = canvas();
    TpoSeries.renderer.draw({
        target,
        data: source,
        allData: source,
        options: {
            ...defaultTpoSeriesOptions,
            tickSize: 1,
            displayMode,
        },
        priceRange: { min: 99, max: 105 },
        visibleTimeRange: { from: 0, to: 300 },
        pane: { left: 0, right: 300, top: 0, bottom: 180, width: 300, height: 180 },
        theme: {
            fontFamily: 'sans-serif',
            textColor: '#ffffff',
            horizontalGridColor: '#222222',
            verticalGridColor: '#222222',
        },
        barSpacing,
        metadata: {},
        timeToCoordinate: time => time,
        priceToCoordinate: price => (106 - price) * pixelsPerTick,
    });
    return target.operations;
}

describe('TpoSeries', () => {
    it('is a separate typed Custom Series with incremental normalization', () => {
        assert.equal(TpoSeries.type, 'TPO');
        assert.equal(typeof TpoSeries.renderer.draw, 'function');
        assert.equal(TpoSeries.renderer.drawOutsideVisibleRange, true);
        const processor = TpoSeries.incrementalDataProcessorFactory();
        const options = { ...defaultTpoSeriesOptions, tickSize: 1 };
        const reset = processor.reset(source, options);

        assert.equal(Object.isFrozen(reset.data[0]), true);
        assert.throws(
            () => processor.update(tpoBar(240, '2026-07-22', 100, 101), options, 'append'),
            /one contiguous span/,
        );
        const valid = processor.update(tpoBar(240, '2026-07-23', 103, 105), options, 'append');
        assert.deepEqual(
            { fromIndex: valid.fromIndex, removed: valid.removed },
            { fromIndex: 3, removed: 0 },
        );
    });

    it('renders letters and compact blocks from identical TPO profiles', () => {
        const letters = render(TpoDisplayMode.Letters);
        const blocks = render(TpoDisplayMode.Blocks);

        assert.ok(letters.some(operation => operation.kind === 'fillText'));
        assert.equal(blocks.some(operation => operation.kind === 'fillText'), false);
        assert.ok(blocks.some(operation => operation.kind === 'fillRect'));
        assert.ok(letters.filter(operation => operation.kind === 'stroke').length >= 3);
    });

    it('uses geometry only to choose the automatic presentation', () => {
        const detailed = render(TpoDisplayMode.Auto, 40, 16);
        const compact = render(TpoDisplayMode.Auto, 4, 1);

        assert.ok(detailed.some(operation => operation.kind === 'fillText'));
        assert.equal(compact.some(operation => operation.kind === 'fillText'), false);
    });
});
