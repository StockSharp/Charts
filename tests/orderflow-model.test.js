const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    FootprintApproximation,
    OrderFlowDataMode,
    TradeAggressorSide,
    footprintBarVolume,
    footprintLevelVolume,
    isApproximateFootprintBar,
    isExactFootprintBar,
    normalizeApproximateFootprintBar,
    normalizeApproximateFootprintBars,
    normalizeFootprintBar,
    normalizeFootprintBars,
    normalizeOrderFlowTrade,
    normalizeOrderFlowTrades,
} = require('../src/orderflow/model.js');

const grid = { tickSize: 0.01 };

function exactBar(overrides = {}) {
    return {
        dataMode: OrderFlowDataMode.Exact,
        time: 100,
        open: 100,
        high: 100.02,
        low: 99.99,
        close: 100.01,
        levels: [
            { price: 99.99, bidVolume: 10, askVolume: 0, tradeCount: 1 },
            { price: 100, bidVolume: 4, askVolume: 6, tradeCount: 2 },
            { price: 100.01, bidVolume: 0, askVolume: 9, tradeCount: 3 },
        ],
        ...overrides,
    };
}

describe('exact order-flow model', () => {
    it('normalizes immutable exact levels without changing aggressor-side meaning', () => {
        const source = exactBar();
        const result = normalizeFootprintBar(source, grid);

        source.levels[0].bidVolume = 999;
        assert.equal(result.levels[0].bidVolume, 10);
        assert.equal(result.levels[0].askVolume, 0);
        assert.equal(footprintLevelVolume(result.levels[1]), 10);
        assert.equal(footprintBarVolume(result), 29);
        assert.equal(isExactFootprintBar(result), true);
        assert.equal(isApproximateFootprintBar(result), false);
        assert.equal(Object.isFrozen(result), true);
        assert.equal(Object.isFrozen(result.levels), true);
        assert.equal(Object.isFrozen(result.levels[0]), true);
    });

    it('accepts floating-point tick noise and canonicalizes prices onto the grid', () => {
        const result = normalizeFootprintBar(exactBar({
            high: 100.02000000000001,
            levels: [{ price: 100.02000000000001, bidVolume: 1, askVolume: 2 }],
        }), grid);

        assert.ok(Math.abs(result.high - 100.02) < 1e-12);
        assert.equal(result.levels[0].price, result.high);
    });

    it('rejects invalid OHLC, tick alignment and malformed exact levels', () => {
        assert.throws(
            () => normalizeFootprintBar(exactBar({ open: 100.005 }), grid),
            /align to tickSize/,
        );
        assert.throws(
            () => normalizeFootprintBar(exactBar({ high: 99.98 }), grid),
            /OHLC range/,
        );
        assert.throws(
            () => normalizeFootprintBar(exactBar({ levels: [] }), grid),
            /non-empty array/,
        );
        assert.throws(
            () => normalizeFootprintBar(exactBar({
                levels: [{ price: 100, bidVolume: 0, askVolume: 0 }],
            }), grid),
            /positive executed volume/,
        );
        assert.throws(
            () => normalizeFootprintBar(exactBar({
                levels: [{ price: 100, bidVolume: -1, askVolume: 1 }],
            }), grid),
            /non-negative/,
        );
        assert.throws(
            () => normalizeFootprintBar(exactBar({
                levels: [
                    { price: 100.01, bidVolume: 1, askVolume: 1 },
                    { price: 100, bidVolume: 1, askVolume: 1 },
                ],
            }), grid),
            /unique ascending prices/,
        );
        assert.throws(
            () => normalizeFootprintBar(exactBar({
                levels: [{ price: 100.03, bidVolume: 1, askVolume: 1 }],
            }), grid),
            /inside bar low\/high/,
        );
    });

    it('requires strictly increasing exact and approximate bar times', () => {
        assert.throws(
            () => normalizeFootprintBars([exactBar(), exactBar()], grid),
            /strictly increasing/,
        );
        const first = approximateBar();
        assert.throws(
            () => normalizeApproximateFootprintBars([first, { ...first }], grid),
            /strictly increasing/,
        );
    });
});

function approximateBar(overrides = {}) {
    return {
        dataMode: OrderFlowDataMode.Approximate,
        approximation: FootprintApproximation.UnclassifiedTrades,
        time: 200,
        open: 10,
        high: 11,
        low: 9,
        close: 10,
        levels: [{ price: 10, totalVolume: 20, tradeCount: 3 }],
        ...overrides,
    };
}

describe('approximate order-flow model', () => {
    it('keeps approximate volume separate and never fabricates bid/ask fields', () => {
        const result = normalizeApproximateFootprintBar(approximateBar(), { tickSize: 1 });

        assert.equal(result.levels[0].totalVolume, 20);
        assert.equal('bidVolume' in result.levels[0], false);
        assert.equal('askVolume' in result.levels[0], false);
        assert.equal(isApproximateFootprintBar(result), true);
        assert.equal(isExactFootprintBar(result), false);
        assert.equal(Object.isFrozen(result.levels[0]), true);
    });

    it('requires a declared approximation reason and positive total volume', () => {
        assert.throws(
            () => normalizeApproximateFootprintBar(approximateBar({ approximation: undefined }), {
                tickSize: 1,
            }),
            /reason is invalid/,
        );
        assert.throws(
            () => normalizeApproximateFootprintBar(approximateBar({
                levels: [{ price: 10, totalVolume: 0 }],
            }), { tickSize: 1 }),
            /must be positive/,
        );
        assert.throws(
            () => normalizeFootprintBar(approximateBar(), { tickSize: 1 }),
            /dataMode must be 'exact'/,
        );
    });
});

describe('classified order-flow trades', () => {
    it('normalizes ordered trades and preserves explicit aggressor side', () => {
        const trades = normalizeOrderFlowTrades([
            {
                id: ' a ', time: 1, sequence: 1, price: 100,
                volume: 2, aggressorSide: TradeAggressorSide.Sell,
            },
            {
                id: 'b', time: 1, sequence: 2, price: 100.01,
                volume: 3, aggressorSide: TradeAggressorSide.Buy,
            },
        ], grid);

        assert.equal(trades[0].id, 'a');
        assert.equal(trades[0].aggressorSide, TradeAggressorSide.Sell);
        assert.equal(trades[1].aggressorSide, TradeAggressorSide.Buy);
        assert.equal(Object.isFrozen(trades), true);
    });

    it('rejects invalid trades, order, sequences and duplicate ids', () => {
        const base = {
            id: 'a', time: 2, price: 100, volume: 1,
            aggressorSide: TradeAggressorSide.Buy,
        };
        assert.throws(
            () => normalizeOrderFlowTrade({ ...base, aggressorSide: 'unknown' }, grid),
            /aggressorSide is invalid/,
        );
        assert.throws(
            () => normalizeOrderFlowTrade({ ...base, volume: 0 }, grid),
            /must be positive/,
        );
        assert.throws(
            () => normalizeOrderFlowTrades([base, { ...base, id: 'b', time: 1 }], grid),
            /ordered by time/,
        );
        assert.throws(
            () => normalizeOrderFlowTrades([
                { ...base, sequence: 2 },
                { ...base, id: 'b', sequence: 1 },
            ], grid),
            /sequence must be ordered/,
        );
        assert.throws(
            () => normalizeOrderFlowTrades([base, { ...base }], grid),
            /duplicate order-flow trade id/,
        );
    });
});
