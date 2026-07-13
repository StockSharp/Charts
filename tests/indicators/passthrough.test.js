// PassThrough indicator — returns close for every candle, no warm-up.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcPassThrough } = require('../../src/chart/indicators/calc/passthrough.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:0${i}:00Z`,
        open: c,
        high: c,
        low: c,
        close: c,
        volume: 0,
    }));
}

describe('calcPassThrough', () => {
    it('empty input → []', () => {
        assert.deepStrictEqual(calcPassThrough([], {}), []);
    });

    it('returns close verbatim for every bar, never null', () => {
        const out = calcPassThrough(makeCandles([1, 2, 3, 4, 5]));
        assert.strictEqual(out.length, 5);
        for (let i = 0; i < 5; i++) {
            assert.strictEqual(out[i].value, i + 1);
        }
    });

    it('preserves time', () => {
        const candles = makeCandles([1, 2, 3]);
        const out = calcPassThrough(candles);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
