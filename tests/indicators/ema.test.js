// EMA indicator: seed-equals-SMA invariant + recursion smoke tests.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcEMA } = require('../../src/chart/indicators/calc/ema.js');

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

describe('calcEMA', () => {
    it('length=3 over [1..6]: warm-up nulls, seed = SMA(first 3), then recurses', () => {
        const out = calcEMA(makeCandles([1, 2, 3, 4, 5, 6]), { length: 3 });
        assert.strictEqual(out.length, 6);
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        // seed = (1+2+3)/3 = 2
        assert.strictEqual(out[2].value, 2);
        // k = 2/4 = 0.5
        // ema[3] = 4*0.5 + 2*0.5 = 3
        assert.strictEqual(out[3].value, 3);
        // ema[4] = 5*0.5 + 3*0.5 = 4
        assert.strictEqual(out[4].value, 4);
        // ema[5] = 6*0.5 + 4*0.5 = 5
        assert.strictEqual(out[5].value, 5);
    });

    it('first non-null value equals SMA of the first N closes (seed invariant)', () => {
        const closes = [10, 20, 30, 40, 50];
        const len = 4;
        const out = calcEMA(makeCandles(closes), { length: len });
        const expectedSeed = (10 + 20 + 30 + 40) / len;
        for (let i = 0; i < len - 1; i++) assert.strictEqual(out[i].value, null);
        assert.strictEqual(out[len - 1].value, expectedSeed);
    });

    it('length larger than candle count → every value null', () => {
        const out = calcEMA(makeCandles([1, 2, 3]), { length: 10 });
        assert.strictEqual(out.length, 3);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('empty candle array → empty result', () => {
        assert.deepStrictEqual(calcEMA([], { length: 5 }), []);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([1, 2, 3, 4]);
        const out = calcEMA(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
