const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    FootprintAuctionCompletion,
    FootprintPocTieBreak,
    OrderFlowDataMode,
    calculateFootprintMetrics,
} = require('../src/orderflow/index.js');

function bar(overrides = {}) {
    return {
        dataMode: OrderFlowDataMode.Exact,
        time: 60,
        open: 100,
        high: 104,
        low: 100,
        close: 103,
        levels: [
            { price: 100, bidVolume: 10, askVolume: 0, tradeCount: 1 },
            { price: 101, bidVolume: 10, askVolume: 40, tradeCount: 2 },
            { price: 102, bidVolume: 5, askVolume: 40, tradeCount: 3 },
            { price: 103, bidVolume: 5, askVolume: 20, tradeCount: 4 },
            { price: 104, bidVolume: 20, askVolume: 0, tradeCount: 5 },
        ],
        ...overrides,
    };
}

describe('footprint metrics', () => {
    it('calculates independent bid/ask totals, delta, POC and value area', () => {
        const result = calculateFootprintMetrics(bar(), {
            tickSize: 1,
            valueAreaPercentage: 0.7,
            imbalanceMinimumVolume: 10,
        });

        assert.equal(result.totalBidVolume, 50);
        assert.equal(result.totalAskVolume, 100);
        assert.equal(result.totalVolume, 150);
        assert.equal(result.delta, 50);
        assert.equal(result.tradeCount, 15);
        assert.equal(result.pocPrice, 101);
        assert.equal(result.pocVolume, 50);
        assert.deepEqual(result.valueArea, {
            low: 101,
            high: 103,
            volume: 120,
            targetVolume: 105,
            percentage: 0.7,
        });
        assert.equal(Object.isFrozen(result), true);
        assert.equal(Object.isFrozen(result.levels), true);
    });

    it('uses a deterministic POC tie policy', () => {
        const tied = bar({
            high: 102,
            close: 101,
            levels: [
                { price: 100, bidVolume: 10, askVolume: 10 },
                { price: 101, bidVolume: 1, askVolume: 1 },
                { price: 102, bidVolume: 15, askVolume: 5 },
            ],
        });

        assert.equal(calculateFootprintMetrics(tied, { tickSize: 1 }).pocPrice, 100);
        assert.equal(calculateFootprintMetrics(tied, {
            tickSize: 1,
            pocTieBreak: FootprintPocTieBreak.HigherPrice,
        }).pocPrice, 102);
        assert.equal(calculateFootprintMetrics(tied, {
            tickSize: 1,
            pocTieBreak: FootprintPocTieBreak.LowerPrice,
        }).pocPrice, 100);
    });

    it('finds diagonal and stacked imbalances on adjacent ticks', () => {
        const result = calculateFootprintMetrics(bar(), {
            tickSize: 1,
            imbalanceRatio: 3,
            imbalanceMinimumVolume: 10,
            stackedImbalanceCount: 3,
        });

        assert.deepEqual(
            result.imbalances.map(item => ({
                side: item.side,
                price: item.price,
                comparedPrice: item.comparedPrice,
                ratio: item.ratio,
            })),
            [
                { side: 'buy', price: 101, comparedPrice: 100, ratio: 4 },
                { side: 'buy', price: 102, comparedPrice: 101, ratio: 4 },
                { side: 'buy', price: 103, comparedPrice: 102, ratio: 4 },
            ],
        );
        assert.deepEqual(result.stackedImbalances, [{
            side: 'buy',
            low: 101,
            high: 103,
            levelCount: 3,
        }]);
        assert.equal(result.levels[1].buyImbalance, true);
        assert.equal(result.levels[1].sellImbalance, false);
    });

    it('treats a missing in-range opposing cell as zero but not an out-of-range cell', () => {
        const result = calculateFootprintMetrics(bar({
            high: 102,
            close: 102,
            levels: [
                { price: 100, bidVolume: 1, askVolume: 50 },
                { price: 102, bidVolume: 50, askVolume: 10 },
            ],
        }), {
            tickSize: 1,
            imbalanceRatio: 3,
            imbalanceMinimumVolume: 10,
            stackedImbalanceCount: 2,
        });

        assert.deepEqual(result.imbalances.map(item => ({
            side: item.side,
            price: item.price,
            comparedPrice: item.comparedPrice,
            comparedVolume: item.comparedVolume,
            ratio: item.ratio,
        })), [
            {
                side: 'buy', price: 102, comparedPrice: 101,
                comparedVolume: 0, ratio: Infinity,
            },
        ]);
        assert.deepEqual(result.stackedImbalances, []);
    });

    it('reports finished, unfinished and unavailable auction boundaries explicitly', () => {
        const complete = calculateFootprintMetrics(bar(), { tickSize: 1 });
        const partial = calculateFootprintMetrics(bar({
            levels: [
                { price: 101, bidVolume: 1, askVolume: 1 },
                { price: 103, bidVolume: 1, askVolume: 1 },
            ],
        }), { tickSize: 1 });

        assert.deepEqual(complete.auction, {
            low: FootprintAuctionCompletion.Finished,
            high: FootprintAuctionCompletion.Unfinished,
        });
        assert.deepEqual(partial.auction, {
            low: FootprintAuctionCompletion.Unavailable,
            high: FootprintAuctionCompletion.Unavailable,
        });
        assert.equal(partial.tradeCount, null);
    });

    it('rejects invalid calculation policy instead of silently coercing it', () => {
        assert.throws(
            () => calculateFootprintMetrics(bar(), { tickSize: 1, valueAreaPercentage: 0 }),
            /valueAreaPercentage/,
        );
        assert.throws(
            () => calculateFootprintMetrics(bar(), { tickSize: 1, imbalanceRatio: 0.5 }),
            /imbalanceRatio/,
        );
        assert.throws(
            () => calculateFootprintMetrics(bar(), { tickSize: 1, stackedImbalanceCount: 0 }),
            /stackedImbalanceCount/,
        );
    });
});
