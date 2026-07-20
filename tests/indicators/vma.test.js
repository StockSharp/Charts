// VMA — variable moving average with volatility-driven smoothing constant.
// Matches StockSharp's VariableMovingAverage.cs:
//   bar 0 emits close[0] (sets _prevFinalValue);
//   bars 1..Length-1 emit close[0] unchanged (stdDev not formed yet);
//   bar Length onward emits the EMA-with-variable-k recurrence.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcVMA } = require('../../src/chart/indicators/calc/vma.js');

function mk(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 1,
    }));
}

describe('calcVMA', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcVMA([], { length: 3 }), []);
    });

    it('warm-up null until stdDev forms (bar length), then variable smoothing', () => {
        // length=3 → not formed until stdDev forms at bar 3; StockSharp nulls bars 0..2.
        const out = calcVMA(mk([10, 11, 12, 13, 14]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, null);
        assert.ok(Math.abs(out[3].value - 11.481851104594815) < 1e-9);
        assert.ok(Math.abs(out[4].value - 12.727657766902565) < 1e-9);
    });

    it('flat closes → warm-up null, then VMA pinned to the constant', () => {
        const out = calcVMA(mk([5, 5, 5, 5, 5, 5]), { length: 3 });
        for (let i = 0; i < 3; i++) assert.strictEqual(out[i].value, null);
        for (let i = 3; i < out.length; i++) {
            assert.ok(Math.abs(out[i].value - 5) < 1e-12, `bar ${i} = ${out[i].value}`);
        }
    });

    it('output length equals input length', () => {
        const out = calcVMA(mk([1, 2, 3, 4, 5, 6]), { length: 3 });
        assert.strictEqual(out.length, 6);
    });

    it('time field passed through unchanged', () => {
        const c = mk([1, 2, 3, 4, 5]);
        const out = calcVMA(c, { length: 3 });
        for (let i = 0; i < c.length; i++) assert.strictEqual(out[i].time, c[i].time);
    });
});
