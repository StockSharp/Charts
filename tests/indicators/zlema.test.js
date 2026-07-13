// ZLEMA: zero-lag EMA, k*(2*close - close[lag]) + (1-k)*prev.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcZLEMA } = require('../../src/chart/indicators/calc/zlema.js');

function mk(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 1,
    }));
}

describe('calcZLEMA', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcZLEMA([], { length: 3 }), []);
    });

    it('length larger than candles → all null', () => {
        const out = calcZLEMA(mk([1, 2, 3]), { length: 10 });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('warm-up null until index length-1', () => {
        const out = calcZLEMA(mk([1, 2, 3, 4, 5, 6, 7]), { length: 4 });
        for (let i = 0; i < 3; i++) assert.strictEqual(out[i].value, null);
        assert.notStrictEqual(out[3].value, null);
    });

    it('output length equals input length', () => {
        const out = calcZLEMA(mk([1, 2, 3, 4, 5, 6]), { length: 3 });
        assert.strictEqual(out.length, 6);
    });

    it('flat input converges to that value', () => {
        const out = calcZLEMA(mk([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]), { length: 4 });
        // After enough bars, ZLEMA on flat input approaches 5.
        // (k=0.4) z = 0.4*(10-5) + 0.6*prev → fixed point at z=5 only when prev=5.
        // Starting from prev=0: z1 = 0.4*5 = 2; z2 = 0.4*5 + 0.6*2 = 3.2; z3 = 0.4*5 + 0.6*3.2 = 3.92; ...
        // We assert monotone convergence to 5.
        let prev = -Infinity;
        for (let i = 3; i < 10; i++) {
            assert.ok(out[i].value > prev);
            assert.ok(out[i].value <= 5);
            prev = out[i].value;
        }
    });
});
