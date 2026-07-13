// Gator Oscillator: {upper: |Jaw-Lips|, lower: -|Lips-Teeth|}.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcGatorOscillator } = require('../../src/chart/indicators/calc/gator.js');
const { calcAlligator } = require('../../src/chart/indicators/calc/alligator.js');

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

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcGatorOscillator', () => {
    it('empty candles → empty upper/lower arrays', () => {
        assert.deepStrictEqual(calcGatorOscillator([], {}), { upper: [], lower: [] });
    });

    it('not enough data for any alligator line → every value null on both histograms', () => {
        const candles = makeCandles([[2, 1], [3, 2], [4, 3], [5, 4], [6, 5]]);
        const r = calcGatorOscillator(candles, {});
        assert.strictEqual(r.upper.length, 5);
        assert.strictEqual(r.lower.length, 5);
        for (let i = 0; i < 5; i++) {
            assert.strictEqual(r.upper[i].value, null);
            assert.strictEqual(r.lower[i].value, null);
        }
    });

    it('shape: upper and lower arrays match candles length and share timestamps', () => {
        const hl = [];
        for (let i = 0; i < 30; i++) hl.push([10 + i, 5 + i]);
        const candles = makeCandles(hl);
        const r = calcGatorOscillator(candles, {});
        assert.strictEqual(r.upper.length, candles.length);
        assert.strictEqual(r.lower.length, candles.length);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.upper[i].time, candles[i].time);
            assert.strictEqual(r.lower[i].time, candles[i].time);
        }
    });

    it('upper is always >= 0 and lower is always <= 0 once both warm up', () => {
        const hl = [];
        for (let i = 0; i < 50; i++) hl.push([10 + (i % 7), 5 - (i % 5)]);
        const candles = makeCandles(hl);
        const r = calcGatorOscillator(candles, {});
        for (let i = 0; i < candles.length; i++) {
            if (r.upper[i].value !== null) assert.ok(r.upper[i].value >= 0);
            if (r.lower[i].value !== null) assert.ok(r.lower[i].value <= 0);
        }
    });

    it('reference vector: upper == |jaw-lips|, lower == -|lips-teeth|', () => {
        const hl = [];
        for (let i = 1; i <= 50; i++) hl.push([i + 0.5, i - 0.5]); // median = i
        const candles = makeCandles(hl);
        const all = calcAlligator(candles, {});
        const r = calcGatorOscillator(candles, {});
        for (let i = 0; i < candles.length; i++) {
            const j = all.jaw[i].value;
            const t = all.teeth[i].value;
            const l = all.lips[i].value;
            if (j !== null && l !== null) approxEq(r.upper[i].value, Math.abs(j - l));
            else assert.strictEqual(r.upper[i].value, null);
            if (l !== null && t !== null) approxEq(r.lower[i].value, -Math.abs(l - t));
            else assert.strictEqual(r.lower[i].value, null);
        }
    });
});
