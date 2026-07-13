// Fractal Dimension Index: FDI in [1, 2], 1.5 for degenerate cases.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcFractalDimension } = require('../../src/chart/indicators/calc/fractaldimension.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcFractalDimension', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcFractalDimension([], { length: 30 }), []);
    });

    it('first bar is always 1.5 (mid-value), regardless of length', () => {
        const candles = [{ time: 't0', open: 5, high: 5, low: 5, close: 5, volume: 0 }];
        const r = calcFractalDimension(candles, { length: 100 });
        assert.strictEqual(r.length, 1);
        approxEq(r[0].value, 1.5);
    });

    it('flat close series → all outputs 1.5 (range == 0 degenerate branch)', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) {
            candles.push({ time: `t${i}`, open: 5, high: 5, low: 5, close: 5, volume: 0 });
        }
        const r = calcFractalDimension(candles, { length: 5 });
        for (const p of r) approxEq(p.value, 1.5);
    });

    it('length larger than data → nontrivial buffer still produces values (no null warm-up gate)', () => {
        // FractalDimension does NOT gate on IsFormed — it emits as soon as
        // it has 2 samples. Confirm we never see null for valid closes.
        const candles = [];
        for (let i = 0; i < 5; i++) {
            candles.push({ time: `t${i}`, open: 1, high: 1, low: 1, close: i + 1, volume: 0 });
        }
        const r = calcFractalDimension(candles, { length: 100 });
        for (let i = 0; i < 5; i++) {
            assert.notStrictEqual(r[i].value, null);
        }
        // Bar 0: 1.5 (count < 2). Bars 1..: clamped FDI value.
        approxEq(r[0].value, 1.5);
    });

    it('hand-computed reference: linear ramp closes [1,2,3] length=3', () => {
        // buffer at i=2: [1,2,3]. range=2, pathLength=|2-1|+|3-2|=2.
        // logDen = log(2*(3-1)) = log(4).
        // fd = 1 + (log(2) - log(2)) / log(4) = 1.0 → clamped to 1.0.
        const candles = [1, 2, 3].map((c, i) => ({
            time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
        }));
        const r = calcFractalDimension(candles, { length: 3 });
        // i=0: 1.5. i=1: buffer=[1,2], range=1, pathLength=1, fd=1 + (log1-log1)/log4 = 1.
        approxEq(r[0].value, 1.5);
        approxEq(r[1].value, 1);
        approxEq(r[2].value, 1);
    });

    it('FDI is always clamped into [1, 2]', () => {
        const candles = [];
        // Zigzag closes to push pathLength up relative to range.
        for (let i = 0; i < 30; i++) {
            const close = (i % 2 === 0) ? 1 : 10;
            candles.push({ time: `t${i}`, open: close, high: close, low: close, close, volume: 0 });
        }
        const r = calcFractalDimension(candles, { length: 30 });
        for (const p of r) {
            if (p.value !== null) {
                assert.ok(p.value >= 1 && p.value <= 2, `value ${p.value} out of [1,2]`);
            }
        }
    });

    it('time field passed through unchanged', () => {
        const candles = [
            { time: 'a', open: 1, high: 1, low: 1, close: 1, volume: 0 },
            { time: 'b', open: 2, high: 2, low: 2, close: 2, volume: 0 },
            { time: 'c', open: 3, high: 3, low: 3, close: 3, volume: 0 },
        ];
        const r = calcFractalDimension(candles, { length: 5 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
