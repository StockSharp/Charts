// LaguerreRSI: range invariants, constant-input fixed point, gamma effects.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcLaguerreRSI } = require('../../src/chart/indicators/calc/laguerrersi.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcLaguerreRSI', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcLaguerreRSI([]), []);
    });

    it('every value in [0..100]', () => {
        // pseudo-random walk
        const closes = [];
        let p = 100;
        for (let i = 0; i < 200; i++) {
            p += Math.sin(i * 1.7) * 2 + Math.cos(i * 0.3) * 1.5;
            closes.push(p);
        }
        const out = calcLaguerreRSI(makeCandles(closes), { gamma: 0.7 });
        for (const v of out) {
            assert.ok(v.value >= 0 && v.value <= 100, `out-of-range: ${v.value}`);
        }
    });

    it('constant input from cold state → cu pumps first, RSI saturates near 100', () => {
        // Cold-start transient: a jump from price=0 (initial filter state)
        // to price=50 looks like a rising series to the filter, so cu pumps
        // up while cd starves. With the smoothing applied, lrsi converges
        // very close to 100 (the L_i values themselves do reach equilibrium
        // at price after many bars, but the running cu/cd ratio doesn't
        // reset). Verified against the .cs algorithm's literal output.
        const out = calcLaguerreRSI(makeCandles(new Array(120).fill(50)), { gamma: 0.7 });
        const last = out[out.length - 1].value;
        assert.ok(last > 99, `expected lrsi > 99 in long-running constant transient, got ${last}`);
    });

    it('first bar emits a numeric value (no warm-up null)', () => {
        const out = calcLaguerreRSI(makeCandles([100, 101, 102]));
        assert.strictEqual(typeof out[0].value, 'number');
        assert.ok(Number.isFinite(out[0].value));
    });

    it('strictly rising series → RSI tends towards 100', () => {
        const closes = [];
        for (let i = 0; i < 80; i++) closes.push(100 + i);
        const out = calcLaguerreRSI(makeCandles(closes), { gamma: 0.7 });
        // l0 lags price, then each subsequent l_i lags l_{i-1}, so the
        // "up" deltas (l_{i-1} - l_i for i=1..3) accumulate while "down"
        // stays 0 — RSI → 100.
        const last = out[out.length - 1].value;
        assert.ok(last > 95, `expected RSI > 95 on monotonic rise, got ${last}`);
    });

    it('strictly falling series → RSI tends towards 0', () => {
        const closes = [];
        for (let i = 0; i < 80; i++) closes.push(200 - i);
        const out = calcLaguerreRSI(makeCandles(closes), { gamma: 0.7 });
        const last = out[out.length - 1].value;
        assert.ok(last < 5, `expected RSI < 5 on monotonic fall, got ${last}`);
    });

    it('invalid gamma falls back to default 0.7', () => {
        const a = calcLaguerreRSI(makeCandles([1, 2, 3, 4, 5]), { gamma: 0 });
        const b = calcLaguerreRSI(makeCandles([1, 2, 3, 4, 5]), { gamma: 1 });
        const ref = calcLaguerreRSI(makeCandles([1, 2, 3, 4, 5]), { gamma: 0.7 });
        for (let i = 0; i < a.length; i++) {
            assert.strictEqual(a[i].value, ref[i].value);
            assert.strictEqual(b[i].value, ref[i].value);
        }
    });

    it('time pass-through', () => {
        const candles = makeCandles([1, 2, 3, 4]);
        const out = calcLaguerreRSI(candles);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
