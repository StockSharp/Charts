// McClellanOscillator: EMA(19) - EMA(39) of close.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMcClellanOscillator } =
    require('../../src/chart/indicators/calc/mcclellanosc.js');
const { calcEMA } = require('../../src/chart/indicators/calc/ema.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcMcClellanOscillator', () => {
    it('value is null until both EMAs are formed (max of two warm-ups)', () => {
        // With short=2, long=4 the first non-null lands at index 3 (long's warm-up).
        const candles = makeCandles([1, 2, 3, 4, 5, 6]);
        const out = calcMcClellanOscillator(candles, { shortLength: 2, longLength: 4 });
        assert.strictEqual(out.length, 6);
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, null);
        assert.notStrictEqual(out[3].value, null);
    });

    it('output equals EMA(short) - EMA(long) elementwise once both are formed', () => {
        const candles = makeCandles(Array.from({ length: 60 }, (_, i) => Math.sin(i / 3) * 5 + 100));
        const out = calcMcClellanOscillator(candles); // defaults 19, 39
        const fast = calcEMA(candles, { length: 19 });
        const slow = calcEMA(candles, { length: 39 });
        for (let i = 0; i < candles.length; i++) {
            if (fast[i].value === null || slow[i].value === null) {
                assert.strictEqual(out[i].value, null);
            } else {
                approxEq(out[i].value, fast[i].value - slow[i].value);
            }
        }
    });

    it('constant close series → oscillator is exactly zero once formed', () => {
        const candles = makeCandles(new Array(50).fill(7));
        const out = calcMcClellanOscillator(candles); // 19 vs 39
        // First fully-formed sample is at index 38.
        for (let i = 38; i < candles.length; i++) {
            approxEq(out[i].value, 0);
        }
    });

    it('defaults are 19 and 39 (.cs hard-coded values)', () => {
        const candles = makeCandles(Array.from({ length: 50 }, (_, i) => i + 1));
        const defaults = calcMcClellanOscillator(candles);
        const explicit = calcMcClellanOscillator(candles, { shortLength: 19, longLength: 39 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(defaults[i].value, explicit[i].value);
        }
    });

    it('empty input → empty output', () => {
        assert.deepStrictEqual(calcMcClellanOscillator([]), []);
    });
});
