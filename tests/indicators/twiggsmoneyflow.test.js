// TwiggsMoneyFlow: EMA(ad)/EMA(volume), where ad = volume*(2*tp - h - l) / (h - l).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcTwiggsMoneyFlow } = require('../../src/chart/indicators/calc/twiggsmoneyflow.js');

function mk(h, l, c, v, i) {
    return { time: `t${i}`, open: (h+l)/2, high: h, low: l, close: c, volume: v };
}

describe('calcTwiggsMoneyFlow', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcTwiggsMoneyFlow([], {}), []);
    });

    it('first (length-1) bars are null', () => {
        const candles = Array.from({ length: 10 }, (_, i) => mk(10+i, 5+i, 7+i, 100+i, i));
        const r = calcTwiggsMoneyFlow(candles, { length: 4 });
        for (let i = 0; i < 3; i++) assert.strictEqual(r[i].value, null);
        assert.notStrictEqual(r[3].value, null);
    });

    it('close at high: ad = volume per bar → tmf = 1 (after EMAs converge)', () => {
        // For close == high: 2*tp - h - l = 2*(h+l+h)/3 - h - l = (4h+2l-3h-3l)/3 = (h-l)/3
        // ad = v * (h-l)/3 / (h-l) = v/3. So adEma/volEma = 1/3 once EMAs converge on identical inputs.
        const candles = Array.from({ length: 30 }, (_, i) => mk(10, 5, 10, 100, i));
        const r = calcTwiggsMoneyFlow(candles, { length: 5 });
        // After EMA convergence (many bars in), tmf ≈ (100/3)/100 = 1/3
        assert.ok(Math.abs(r[29].value - 1 / 3) < 1e-6);
    });

    it('output length equals input length', () => {
        const candles = Array.from({ length: 15 }, (_, i) => mk(10+i, 5+i, 7+i, 100+i, i));
        const r = calcTwiggsMoneyFlow(candles, { length: 5 });
        assert.strictEqual(r.length, 15);
    });

    it('flat candle (h==l) uses prevAd', () => {
        // First bar: h=l=10, c=10, v=100 → range=0, prevAd was 0, so ad=0.
        // Subsequent bars with h==l also keep ad=0.
        const candles = Array.from({ length: 10 }, (_, i) => mk(10, 10, 10, 100, i));
        const r = calcTwiggsMoneyFlow(candles, { length: 3 });
        // All ad=0 → adEma=0 → tmf=0 → null per .cs.
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('time field passed through', () => {
        const candles = Array.from({ length: 5 }, (_, i) => mk(10+i, 5+i, 7+i, 100+i, i));
        const r = calcTwiggsMoneyFlow(candles, { length: 3 });
        for (let i = 0; i < 5; i++) assert.strictEqual(r[i].time, candles[i].time);
    });
});
