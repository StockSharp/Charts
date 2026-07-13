// UltimateOscillator: Williams' three-period oscillator with weights 4/2/1.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcUltimateOscillator } = require('../../src/chart/indicators/calc/ultimateoscillator.js');

function mk(h, l, c, i) {
    return { time: `t${i}`, open: (h+l)/2, high: h, low: l, close: c, volume: 1 };
}

describe('calcUltimateOscillator', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcUltimateOscillator([], {}), []);
    });

    it('first 28 bars are null (warm-up of largest period)', () => {
        // index 0 captures prevClose. bp/tr available from index 1.
        // 28-period sum requires 28 valid bp/tr → first formed at index 28.
        const candles = Array.from({ length: 30 }, (_, i) =>
            mk(100 + i, 95 + i, 98 + i, i));
        const r = calcUltimateOscillator(candles, {});
        for (let i = 0; i < 28; i++) {
            assert.strictEqual(r[i].value, null, `bar ${i} should be null`);
        }
        assert.notStrictEqual(r[28].value, null);
    });

    it('all-up moves (close == high, low == prev close) → UO = 100', () => {
        // BP = close - min(low, prev close)
        // TR = max(high, prev close) - min(low, prev close)
        // If low == prev close and close == high: BP = high - prev close = TR.
        // So avg7 = avg14 = avg28 = 1 → UO = 100.
        const candles = [];
        let prev = 100;
        for (let i = 0; i < 35; i++) {
            const h = prev + 2;
            const l = prev;     // low = prev close
            const c = h;        // close = high
            candles.push(mk(h, l, c, i));
            prev = c;
        }
        const r = calcUltimateOscillator(candles, {});
        assert.ok(Math.abs(r[34].value - 100) < 1e-9, `got ${r[34].value}`);
    });

    it('all-down moves (close == low, high == prev close) → UO = 0', () => {
        // BP = close - min(low, prev close) = close - close = 0 → avg=0 → UO=0.
        const candles = [];
        let prev = 200;
        for (let i = 0; i < 35; i++) {
            const h = prev;
            const l = prev - 2;
            const c = l;
            candles.push(mk(h, l, c, i));
            prev = c;
        }
        const r = calcUltimateOscillator(candles, {});
        assert.ok(Math.abs(r[34].value - 0) < 1e-9, `got ${r[34].value}`);
    });

    it('output length equals input length', () => {
        const c = Array.from({ length: 40 }, (_, i) =>
            mk(100 + (i % 5), 95 + (i % 5), 98 + (i % 5), i));
        const r = calcUltimateOscillator(c, {});
        assert.strictEqual(r.length, 40);
    });

    it('time field passed through', () => {
        const c = Array.from({ length: 30 }, (_, i) =>
            mk(100 + i, 95 + i, 98 + i, i));
        const r = calcUltimateOscillator(c, {});
        for (let i = 0; i < 30; i++) assert.strictEqual(r[i].time, c[i].time);
    });
});
