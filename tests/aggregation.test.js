const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    aggregateOhlcvBars,
    ohlcvDataViewBuilder,
    parseFixedResolution,
    resolutionToSeconds,
} = require('../src/data/aggregation.js');

function candle(time, open, high, low, close, volume) {
    const result = { time, open, high, low, close };
    if (volume !== undefined) result.volume = volume;
    return result;
}

describe('OHLCV aggregation', () => {
    it('uses first open, extrema, last close and summed volume per stable time bucket', () => {
        const result = aggregateOhlcvBars([
            candle(0, 10, 12, 9, 11, 2),
            candle(60, 11, 15, 10, 14, 3),
            candle(120, 20, 23, 18, 21),
            candle(180, 21, 24, 19, 22, 7),
            candle(360, 30, 31, 28, 29, 4),
        ], { intervalSeconds: 120 });

        assert.deepEqual(result, [
            candle(0, 10, 15, 9, 14, 5),
            candle(120, 20, 24, 18, 22, 7),
            candle(360, 30, 31, 28, 29, 4),
        ]);
        assert.equal(Object.isFrozen(result), true);
        assert.equal(Object.isFrozen(result[0]), true);
    });

    it('deduplicates timestamps before reduction and omits volume when absent', () => {
        const result = aggregateOhlcvBars([
            candle(0, 10, 12, 9, 11),
            candle(60, 11, 13, 10, 12, 100),
            candle(60, 12, 14, 8, 13, 3),
        ], { intervalSeconds: 120 });
        assert.deepEqual(result, [candle(0, 10, 14, 8, 13, 3)]);
        assert.deepEqual(
            aggregateOhlcvBars([candle(0, 1, 2, 0, 1)], { intervalSeconds: 60 }),
            [candle(0, 1, 2, 0, 1)],
        );
    });

    it('parses fixed resolutions and builds grouped controller views', () => {
        assert.equal(resolutionToSeconds('1'), 60);
        assert.equal(resolutionToSeconds('15m'), 900);
        assert.equal(resolutionToSeconds('2H'), 7200);
        assert.equal(resolutionToSeconds('1D'), 86400);
        assert.equal(resolutionToSeconds('1W'), 604800);
        assert.throws(() => resolutionToSeconds('1M'), /unsupported/);
        assert.deepEqual(parseFixedResolution('15m'), {
            amount: 15,
            unit: 'minute',
            seconds: 900,
        });
        assert.equal(Object.isFrozen(parseFixedResolution('2D')), true);

        const view = ohlcvDataViewBuilder([
            candle(0, 1, 2, 0, 1),
            candle(60, 1, 3, 1, 2),
        ], { symbol: 'X', resolution: '1m', groupingLevel: 2 });
        assert.deepEqual(view, [candle(0, 1, 3, 0, 2)]);
    });

    it('rejects malformed fields, order and intervals', () => {
        assert.throws(() => aggregateOhlcvBars([
            candle(60, 1, 2, 0, 1), candle(0, 1, 2, 0, 1),
        ], { intervalSeconds: 60 }), /ascending/);
        assert.throws(() => aggregateOhlcvBars([
            candle(0, 1, Number.NaN, 0, 1),
        ], { intervalSeconds: 60 }), /non-finite/);
        assert.throws(() => aggregateOhlcvBars([
            candle(0, 1, 2, 0, 1, -1),
        ], { intervalSeconds: 60 }), /non-negative/);
        assert.throws(() => aggregateOhlcvBars([], { intervalSeconds: 0 }), /positive/);
    });
});
