const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    AverageTrueRange,
    ExpandingWilderMovingAverage,
    ExponentialMovingAverage,
    FixedWeightedMovingAverage,
    LinearWeightedMovingAverage,
    PartialSeedSimpleMovingAverage,
    PartialRelativeStrengthIndex,
    PartialSeedExponentialMovingAverage,
    RingBuffer,
    RollingEfficiencyRatio,
    RollingLinearRegression,
    RollingMaximum,
    RollingMeanDeviation,
    RollingMedian,
    RollingMinimum,
    RollingStandardDeviation,
    RollingSum,
    RollingVariance,
    SimpleMovingAverage,
    SmoothedMovingAverage,
    TrueRange,
    WilderMovingAverage,
} = require('../src/indicators/index.js');
const { calcSMA } = require('../src/chart/indicators/calc/sma.js');
const { calcEMA } = require('../src/chart/indicators/calc/ema.js');
const { calcATR } = require('../src/chart/indicators/calc/atr.js');

function candle(time, high, low, close) {
    return { time, open: close, high, low, close };
}

function closeTo(actual, expected, epsilon = 1e-12) {
    assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

describe('incremental indicator math kernel', () => {
    it('keeps a bounded FIFO snapshot and restores logical order', () => {
        const buffer = new RingBuffer(3);
        buffer.push(1);
        buffer.push(2);
        const checkpoint = buffer.checkpoint();
        buffer.push(3);
        buffer.push(4);
        assert.deepEqual(buffer.toArray(), [2, 3, 4]);
        assert.equal(buffer.front(), 2);
        assert.equal(buffer.back(), 4);

        buffer.restore(checkpoint);
        assert.deepEqual(buffer.toArray(), [1, 2]);
        assert.equal(Object.isFrozen(checkpoint), true);
        assert.equal(Object.isFrozen(checkpoint.values), true);
        assert.throws(() => new RingBuffer(0), /positive integer/);
    });

    it('updates rolling sum, min and max in O(1) without committing previews', () => {
        const sum = new RollingSum(3);
        const min = new RollingMinimum(3);
        const max = new RollingMaximum(3);
        for (const value of [4, 2, 5]) {
            sum.push(value);
            min.push(value);
            max.push(value);
        }
        assert.equal(sum.value, 11);
        assert.equal(min.value, 2);
        assert.equal(max.value, 5);
        assert.equal(sum.preview(1), 8);
        assert.equal(min.preview(1), 1);
        assert.equal(max.preview(1), 5);
        assert.equal(sum.value, 11);
        assert.equal(min.value, 2);
        assert.equal(max.value, 5);

        assert.equal(sum.push(null), null);
        assert.equal(min.push(null), null);
        assert.equal(max.push(null), null);
        assert.equal(sum.push(7), null);
        assert.equal(min.push(7), null);
        assert.equal(max.push(7), null);
        assert.equal(sum.push(3), null);
        assert.equal(min.push(3), null);
        assert.equal(max.push(3), null);
        assert.equal(sum.push(6), 16);
        assert.equal(min.push(6), 3);
        assert.equal(max.push(6), 7);
    });

    it('exposes expanding extrema without changing full-window semantics', () => {
        const min = new RollingMinimum(3);
        const max = new RollingMaximum(3);
        min.push(4);
        max.push(4);
        assert.equal(min.value, null);
        assert.equal(max.value, null);
        assert.equal(min.partialValue, 4);
        assert.equal(max.partialValue, 4);
        assert.equal(min.previewPartial(2), 2);
        assert.equal(max.previewPartial(7), 7);
        assert.equal(min.partialValue, 4);
        assert.equal(max.partialValue, 4);
        min.push(null);
        max.push(null);
        assert.equal(min.partialValue, null);
        assert.equal(max.partialValue, null);
    });

    it('implements classic SMA, EMA and Wilder seeds and compact checkpoints', () => {
        const sma = new SimpleMovingAverage(3);
        assert.deepEqual([1, 2, 3, 4].map((value) => sma.push(value)), [null, null, 2, 3]);

        const ema = new ExponentialMovingAverage(3);
        assert.deepEqual([1, 2, 3].map((value) => ema.push(value)), [null, null, 2]);
        const checkpoint = ema.checkpoint();
        assert.equal(ema.preview(10), 6);
        assert.deepEqual(ema.checkpoint(), checkpoint);
        assert.equal(ema.value, 2);
        assert.equal(ema.push(4), 3);
        ema.restore(checkpoint);
        assert.equal(ema.push(4), 3);

        const wilder = new WilderMovingAverage(3);
        assert.deepEqual([1, 2, 3].map((value) => wilder.push(value)), [null, null, 2]);
        closeTo(wilder.push(4), 8 / 3);
        assert.equal(wilder.push(Number.NaN), null);
        assert.equal(wilder.push(5), null);
    });

    it('implements StockSharp partial-seed SMA with skipped gaps and isolated previews', () => {
        const average = new PartialSeedSimpleMovingAverage(3);
        assert.deepEqual([3, 6].map((value) => average.push(value)), [1, 3]);
        const checkpoint = average.checkpoint();
        assert.equal(average.isFormed, false);
        assert.equal(average.preview(9), 6);
        assert.deepEqual(average.checkpoint(), checkpoint);
        assert.equal(average.push(Number.NaN), null);
        assert.deepEqual(average.checkpoint(), checkpoint);
        assert.equal(average.push(9), 6);
        assert.equal(average.isFormed, true);
        assert.equal(average.push(12), 9);
        average.restore(checkpoint);
        assert.equal(average.push(9), 6);
    });

    it('implements StockSharp partial-seed EMA and its full-window transition', () => {
        const average = new PartialSeedExponentialMovingAverage(3);
        assert.deepEqual([3, 6].map((value) => average.push(value)), [1, 3]);
        const checkpoint = average.checkpoint();
        assert.equal(average.isFormed, false);
        assert.equal(average.preview(9), 6);
        assert.deepEqual(average.checkpoint(), checkpoint);
        assert.equal(average.push(Number.NaN), null);
        assert.equal(average.push(9), 6);
        assert.equal(average.isFormed, true);
        assert.equal(average.push(12), 9);
        average.restore(checkpoint);
        assert.equal(average.push(9), 6);
    });

    it('streams StockSharp partial RSI without committing forming values', () => {
        const rsi = new PartialRelativeStrengthIndex(3);
        assert.equal(rsi.push(100), null);
        closeTo(rsi.push(101), 100);
        const checkpoint = rsi.checkpoint();
        closeTo(rsi.preview(99), 100 / 3);
        assert.deepEqual(rsi.checkpoint(), checkpoint);
        closeTo(rsi.push(102), 100);
        assert.equal(rsi.isFormed, false);
        closeTo(rsi.push(103), 100);
        assert.equal(rsi.isFormed, true);
        assert.equal(rsi.push(Number.NaN), null);
        assert.equal(rsi.push(104), null);
        rsi.restore(checkpoint);
        closeTo(rsi.push(102), 100);
    });

    it('updates linear WMA in O(1) with preview, gaps and restore', () => {
        const average = new LinearWeightedMovingAverage(3);
        assert.deepEqual([1, 2].map((value) => average.push(value)), [null, null]);
        const checkpoint = average.checkpoint();
        closeTo(average.preview(3), 14 / 6);
        assert.deepEqual(average.checkpoint(), checkpoint);
        closeTo(average.push(3), 14 / 6);
        closeTo(average.preview(4), 20 / 6);
        closeTo(average.value, 14 / 6);
        assert.equal(average.push(null), null);
        assert.equal(average.push(5), null);
        assert.equal(average.push(6), null);
        closeTo(average.push(7), 38 / 6);
        average.restore(checkpoint);
        closeTo(average.push(3), 14 / 6);
    });

    it('updates rolling linear regression in O(1) with preview, gaps and restore', () => {
        const regression = new RollingLinearRegression(3);
        assert.equal(regression.push(1), null);
        assert.equal(regression.push(3), null);
        const checkpoint = regression.checkpoint();
        closeTo(regression.preview(2), 2.5);
        closeTo(regression.previewSlope(2), 0.5);
        closeTo(regression.previewNext(2), 3);
        closeTo(regression.previewStandardError(2), Math.sqrt(1.5));
        closeTo(regression.previewRSquared(2), 0.25);
        assert.deepEqual(regression.checkpoint(), checkpoint);
        closeTo(regression.push(2), 2.5);
        closeTo(regression.slopeValue, 0.5);
        closeTo(regression.nextValue, 3);
        closeTo(regression.standardErrorValue, Math.sqrt(1.5));
        closeTo(regression.rSquaredValue, 0.25);
        closeTo(regression.preview(4), 3.5);
        closeTo(regression.previewSlope(4), 0.5);
        closeTo(regression.value, 2.5);
        assert.equal(regression.push(null), null);
        assert.equal(regression.slopeValue, null);
        assert.equal(regression.push(5), null);
        assert.equal(regression.push(6), null);
        closeTo(regression.push(7), 7);
        closeTo(regression.standardErrorValue, 0);
        closeTo(regression.rSquaredValue, 1);
        regression.restore(checkpoint);
        closeTo(regression.push(2), 2.5);
        closeTo(regression.standardErrorValue, Math.sqrt(1.5));
        closeTo(regression.rSquaredValue, 0.25);
        assert.throws(
            () => regression.restore({ values: [Number.NaN] }),
            /invalid linear regression checkpoint/,
        );
    });

    it('keeps regression standard error stable for large absolute prices', () => {
        const regression = new RollingLinearRegression(5);
        const base = 1_000_000_000_000;
        for (const offset of [0, 1, 0, -1, 0]) regression.push(base + offset);
        closeTo(regression.standardErrorValue, Math.sqrt(1.6 / 3));

        const checkpoint = regression.checkpoint();
        closeTo(regression.previewStandardError(base + 2), Math.sqrt(4.8 / 3));
        assert.deepEqual(regression.checkpoint(), checkpoint);
    });

    it('keeps regression R squared stable for large absolute prices', () => {
        const regression = new RollingLinearRegression(5);
        const base = 1_000_000_000_000;
        for (const offset of [0, 2, 1, 3, 4]) regression.push(base + offset);
        closeTo(regression.rSquaredValue, 0.81);

        const checkpoint = regression.checkpoint();
        closeTo(regression.previewRSquared(base + 5), 0.81);
        assert.deepEqual(regression.checkpoint(), checkpoint);
    });

    it('applies fixed newest-to-oldest weights without mutating previews', () => {
        const average = new FixedWeightedMovingAverage([1, 2, 4]);
        assert.equal(average.push(10), null);
        assert.equal(average.push(20), null);
        const checkpoint = average.checkpoint();
        closeTo(average.preview(30), (30 + 40 + 40) / 7);
        assert.deepEqual(average.checkpoint(), checkpoint);
        closeTo(average.push(30), (30 + 40 + 40) / 7);
        closeTo(average.preview(40), (40 + 60 + 80) / 7);
        assert.equal(average.push(null), null);
        assert.equal(average.push(50), null);
        assert.equal(average.push(60), null);
        closeTo(average.push(70), (70 + 120 + 200) / 7);
        average.restore(checkpoint);
        closeTo(average.push(30), (30 + 40 + 40) / 7);
        assert.equal(Object.isFrozen(average.weights), true);
        assert.throws(() => new FixedWeightedMovingAverage([1, -1]), /non-zero/);
    });

    it('implements StockSharp partial-seed SMMA and skips invalid samples', () => {
        const average = new SmoothedMovingAverage(3);
        assert.deepEqual([3, 6].map((value) => average.push(value)), [1, 3]);
        const checkpoint = average.checkpoint();
        assert.equal(average.isFormed, false);
        assert.equal(average.preview(9), 6);
        assert.deepEqual(average.checkpoint(), checkpoint);
        assert.equal(average.value, 3);
        assert.equal(average.push(9), 6);
        assert.equal(average.isFormed, true);
        assert.equal(average.push(Number.NaN), null);
        assert.equal(average.push(12), 8);
        average.restore(checkpoint);
        assert.equal(average.push(9), 6);
    });

    it('implements expanding Wilder warm-up with preview and gap recovery', () => {
        const average = new ExpandingWilderMovingAverage(3);
        assert.deepEqual([10, 20].map((value) => average.push(value)), [10, 15]);
        const checkpoint = average.checkpoint();
        assert.equal(average.preview(30), 20);
        assert.deepEqual(average.checkpoint(), checkpoint);
        assert.equal(average.push(30), 20);
        assert.equal(average.isFormed, true);
        assert.equal(average.push(Number.NaN), null);
        closeTo(average.push(40), 80 / 3);
        average.restore(checkpoint);
        assert.equal(average.push(30), 20);
    });

    it('maintains Kaufman efficiency ratio through eviction, preview and gaps', () => {
        const ratio = new RollingEfficiencyRatio(3);
        assert.deepEqual([1, 2, 3].map((value) => ratio.push(value)), [null, null, 1]);
        const checkpoint = ratio.checkpoint();
        assert.equal(ratio.preview(2), 0);
        assert.equal(ratio.value, 1);
        assert.equal(ratio.push(2), 0);
        assert.equal(ratio.push(null), null);
        assert.equal(ratio.push(4), null);
        assert.equal(ratio.push(5), null);
        closeTo(ratio.push(6), 1);
        ratio.restore(checkpoint);
        assert.equal(ratio.push(2), 0);

        const single = new RollingEfficiencyRatio(1);
        assert.equal(single.push(10), 0);
        assert.equal(single.preview(20), 0);
    });

    it('maintains population/sample variance and standard deviation after eviction', () => {
        const population = new RollingVariance(3);
        const sample = new RollingVariance(3, true);
        const deviation = new RollingStandardDeviation(3);
        for (const value of [1, 2, 3]) {
            population.push(value);
            sample.push(value);
            deviation.push(value);
        }
        closeTo(population.value, 2 / 3);
        closeTo(sample.value, 1);
        closeTo(deviation.value, Math.sqrt(2 / 3));
        closeTo(population.preview(4), 2 / 3);
        closeTo(population.value, 2 / 3);
        closeTo(population.push(4), 2 / 3);
        assert.equal(population.push(null), null);
    });

    it('maintains rolling mean deviation across preview, eviction, gaps and restore', () => {
        const deviation = new RollingMeanDeviation(3);
        assert.deepEqual([2, 4].map((value) => deviation.push(value)), [null, null]);
        const checkpoint = deviation.checkpoint();
        closeTo(deviation.preview(6), 4 / 3);
        assert.deepEqual(deviation.checkpoint(), checkpoint);
        closeTo(deviation.push(6), 4 / 3);
        closeTo(deviation.preview(10), 20 / 9);
        closeTo(deviation.value, 4 / 3);
        assert.equal(deviation.push(null), null);
        assert.equal(deviation.push(8), null);
        assert.equal(deviation.push(10), null);
        closeTo(deviation.push(12), 4 / 3);
        deviation.restore(checkpoint);
        closeTo(deviation.push(6), 4 / 3);
        assert.throws(
            () => deviation.restore({ values: [Number.NaN] }),
            /invalid rolling mean deviation checkpoint/,
        );
    });

    it('maintains rolling median across preview, duplicates, gaps and restore', () => {
        const median = new RollingMedian(4);
        assert.deepEqual([9, 1, 7].map((value) => median.push(value)), [null, null, null]);
        const checkpoint = median.checkpoint();
        assert.equal(median.preview(3), 5);
        assert.deepEqual(median.checkpoint(), checkpoint);
        assert.equal(median.push(3), 5);
        assert.equal(median.preview(5), 4);
        assert.equal(median.value, 5);
        assert.equal(median.push(null), null);
        assert.equal(median.push(5), null);
        assert.equal(median.push(5), null);
        assert.equal(median.push(8), null);
        assert.equal(median.push(2), 5);
        median.restore(checkpoint);
        assert.equal(median.push(3), 5);
        assert.throws(
            () => median.restore({ values: [Number.NaN] }),
            /invalid rolling median checkpoint/,
        );
    });

    it('computes true range and Wilder ATR with non-mutating forming bars', () => {
        const bars = [
            candle(1, 12, 9, 11),
            candle(2, 15, 10, 14),
            candle(3, 16, 13, 15),
            candle(4, 18, 14, 17),
        ];
        const range = new TrueRange();
        assert.equal(range.push(bars[0]), 3);
        assert.equal(range.preview(bars[1]), 5);
        assert.equal(range.preview({ ...bars[1], high: 20 }), 10);
        assert.equal(range.push(bars[1]), 5);
        assert.equal(range.push(bars[2]), 3);

        const atr = new AverageTrueRange(3);
        assert.deepEqual(bars.slice(0, 3).map((bar) => atr.push(bar)), [null, null, 11 / 3]);
        const checkpoint = atr.checkpoint();
        closeTo(atr.preview(bars[3]), 34 / 9);
        assert.deepEqual(atr.checkpoint(), checkpoint);
        closeTo(atr.value, 11 / 3);
        closeTo(atr.push(bars[3]), 34 / 9);
        atr.restore(checkpoint);
        closeTo(atr.push(bars[3]), 34 / 9);
    });

    it('matches the independent batch oracle for SMA, EMA and ATR', () => {
        const bars = Array.from({ length: 80 }, (_, index) => {
            const close = 100 + Math.sin(index / 4) * 7 + index * 0.13;
            return {
                time: index + 1,
                open: close - 0.25,
                high: close + 1 + (index % 3) * 0.1,
                low: close - 1 - (index % 5) * 0.1,
                close,
            };
        });
        const length = 14;
        const cases = [
            [new SimpleMovingAverage(length), calcSMA(bars, { length })],
            [new ExponentialMovingAverage(length), calcEMA(bars, { length })],
            [new AverageTrueRange(length), calcATR(bars, { length })],
        ];

        for (const [kernel, expected] of cases) {
            bars.forEach((bar, index) => {
                const input = kernel instanceof AverageTrueRange ? bar : bar.close;
                const actual = kernel.push(input);
                const oracle = expected[index].value;
                if (oracle === null) assert.equal(actual, null);
                else closeTo(actual, oracle, 1e-10);
            });
        }
    });
});
