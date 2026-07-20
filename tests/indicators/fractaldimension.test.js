// Fractal Dimension Index: FDI in [1, 2], 1.5 for degenerate cases. FractalDimension
// is a DecimalLengthIndicator, so it is not formed — and emits nothing — before the
// buffer holds `length` closes (index length-1).

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

    it('single candle with length 100 → not formed → null', () => {
        const candles = [{ time: 't0', open: 5, high: 5, low: 5, close: 5, volume: 0 }];
        const r = calcFractalDimension(candles, { length: 100 });
        assert.strictEqual(r.length, 1);
        assert.strictEqual(r[0].value, null);
    });

    it('flat close series → warm-up null, then 1.5 (range == 0 degenerate branch)', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) {
            candles.push({ time: `t${i}`, open: 5, high: 5, low: 5, close: 5, volume: 0 });
        }
        const r = calcFractalDimension(candles, { length: 5 });
        for (let i = 0; i < 4; i++) assert.strictEqual(r[i].value, null); // warm-up
        for (let i = 4; i < 10; i++) approxEq(r[i].value, 1.5);
    });

    it('length larger than data → never formed → all null', () => {
        const candles = [];
        for (let i = 0; i < 5; i++) {
            candles.push({ time: `t${i}`, open: 1, high: 1, low: 1, close: i + 1, volume: 0 });
        }
        const r = calcFractalDimension(candles, { length: 100 });
        for (let i = 0; i < 5; i++) assert.strictEqual(r[i].value, null);
    });

    it('hand-computed reference: linear ramp closes [1,2,3] length=3', () => {
        // Warm-up (index 0,1) null; buffer at i=2: [1,2,3]. range=2, pathLength=2,
        // logDen=log(4). fd = 1 + (log2 - log2)/log4 = 1.
        const candles = [1, 2, 3].map((c, i) => ({
            time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
        }));
        const r = calcFractalDimension(candles, { length: 3 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        approxEq(r[2].value, 1);
    });

    it('FDI is always clamped into [1, 2]', () => {
        const candles = [];
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
