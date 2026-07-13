// Intraday Intensity Index: SMA of 2*((close-low)-(high-close)) / ((high-low)*volume).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcIntradayIntensityIndex } = require('../../src/chart/indicators/calc/iii.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function mkCandle(h, l, c, v, i) {
    return { time: `t${i}`, open: (h + l) / 2, high: h, low: l, close: c, volume: v };
}

describe('calcIntradayIntensityIndex', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcIntradayIntensityIndex([], { length: 14 }), []);
    });

    it('warm-up: length-1 leading nulls', () => {
        const candles = [];
        for (let i = 0; i < 14; i++) candles.push(mkCandle(2, 1, 1.5, 100, i));
        const r = calcIntradayIntensityIndex(candles, { length: 14 });
        for (let i = 0; i < 13; i++) assert.strictEqual(r[i].value, null);
        assert.notStrictEqual(r[13].value, null);
    });

    it('zero denom (volume=0) → that bar contributes 0 to the SMA', () => {
        // length=3. Bars [v=100, v=0, v=100]. Each bar: close=mid → ((c-l)-(h-c))=0 → raw=0.
        const candles = [mkCandle(2, 1, 1.5, 100, 0), mkCandle(2, 1, 1.5, 0, 1), mkCandle(2, 1, 1.5, 100, 2)];
        const r = calcIntradayIntensityIndex(candles, { length: 3 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        approxEq(r[2].value, 0);
    });

    it('hand-computed reference: length=2 with two known bars', () => {
        // Bar 0: h=10 l=0 c=8 v=10 → denom=10*10=100, num=2*((8-0)-(10-8))=2*(8-2)=12 → raw=12/100=0.12
        // Bar 1: h=10 l=0 c=2 v=10 → denom=100, num=2*((2-0)-(10-2))=2*(-6)=-12 → raw=-0.12
        const candles = [mkCandle(10, 0, 8, 10, 0), mkCandle(10, 0, 2, 10, 1)];
        const r = calcIntradayIntensityIndex(candles, { length: 2 });
        assert.strictEqual(r[0].value, null);
        approxEq(r[1].value, (0.12 + -0.12) / 2);
    });

    it('output length matches input length and timestamps pass through', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) candles.push(mkCandle(2 + i * 0.1, 1, 1.5, 100, i));
        const r = calcIntradayIntensityIndex(candles, { length: 5 });
        assert.strictEqual(r.length, 10);
        for (let i = 0; i < 10; i++) assert.strictEqual(r[i].time, candles[i].time);
    });

    it('all close=high (top of bar) → raw is positive; all close=low → raw is negative', () => {
        const upBars = [];
        const dnBars = [];
        for (let i = 0; i < 5; i++) {
            upBars.push(mkCandle(2, 1, 2, 100, i)); // close = high
            dnBars.push(mkCandle(2, 1, 1, 100, i)); // close = low
        }
        const ru = calcIntradayIntensityIndex(upBars, { length: 5 });
        const rd = calcIntradayIntensityIndex(dnBars, { length: 5 });
        // raw_up = 2*((2-1)-(2-2)) / ((2-1)*100) = 2/100 = 0.02
        // raw_dn = 2*((1-1)-(2-1)) / 100 = -0.02
        approxEq(ru[4].value, 0.02);
        approxEq(rd[4].value, -0.02);
    });
});
