// Chaikin Volatility: two-stage EMA + ROC. Hand-checked vector for the
// EMA stage, plus invariants (constant range → CV = 0; not-enough-data →
// all nulls).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcChaikinVolatility } = require('../../src/chart/indicators/calc/chaikinvolatility.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function makeCandles(hl) {
    return hl.map(([h, l], i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: (h + l) / 2,
        high: h,
        low: l,
        close: (h + l) / 2,
        volume: 0,
    }));
}

describe('calcChaikinVolatility', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcChaikinVolatility([], {}), []);
    });

    it('not enough data → every value null', () => {
        const candles = makeCandles([[2, 1], [3, 2], [4, 3]]);
        const r = calcChaikinVolatility(candles, { emaLength: 5, rocLength: 5 });
        assert.strictEqual(r.length, 3);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('constant range (h-l) → CV = 0 once warmed up', () => {
        // h-l = 1 on every bar → EMA = 1 → ROC = 0.
        const hl = [];
        for (let i = 0; i < 15; i++) hl.push([10 + i, 9 + i]);
        const r = calcChaikinVolatility(makeCandles(hl), { emaLength: 3, rocLength: 3 });
        // first non-null at emaLength + rocLength - 1 = 5
        for (let i = 0; i < 5; i++) assert.strictEqual(r[i].value, null);
        for (let i = 5; i < hl.length; i++) approxEq(r[i].value, 0);
    });

    it('hand-checked vector: emaLength=2, rocLength=1 on increasing ranges', () => {
        // ranges (h-l) = 1, 2, 3, 4, 5
        // EMA(2) seed at i=1 = mean(1,2) = 1.5
        // i=2: 3*(2/3) + 1.5*(1/3) = 2 + 0.5 = 2.5
        // i=3: 4*(2/3) + 2.5*(1/3) = 2.6666... + 0.8333... = 3.5
        // i=4: 5*(2/3) + 3.5*(1/3) = 3.3333... + 1.1666... = 4.5
        // ROC(1): (ema[i] - ema[i-1]) / ema[i-1] * 100
        //   i=2: (2.5 - 1.5) / 1.5 * 100 = 66.6666...
        //   i=3: (3.5 - 2.5) / 2.5 * 100 = 40
        //   i=4: (4.5 - 3.5) / 3.5 * 100 = 28.5714...
        const hl = [
            [2, 1],     // range 1
            [4, 2],     // range 2
            [6, 3],     // range 3
            [8, 4],     // range 4
            [10, 5],    // range 5
        ];
        const r = calcChaikinVolatility(makeCandles(hl), { emaLength: 2, rocLength: 1 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        approxEq(r[2].value, (2.5 - 1.5) / 1.5 * 100);
        approxEq(r[3].value, (3.5 - 2.5) / 2.5 * 100);
        approxEq(r[4].value, (4.5 - 3.5) / 3.5 * 100);
    });

    it('time field passed through unchanged', () => {
        const hl = [];
        for (let i = 0; i < 8; i++) hl.push([10 + i, 5 + i]);
        const candles = makeCandles(hl);
        const r = calcChaikinVolatility(candles, { emaLength: 2, rocLength: 1 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
