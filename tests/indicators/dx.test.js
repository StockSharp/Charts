// Directional Index (DX): plusDI/minusDI/dx triplet, no ADX smoothing.
// Sanity-checked by comparing against the existing adx.js calc — both
// pipelines share the DI computation, so plusDI / minusDI / DX must match
// the adx.js output on the same input.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcDX } = require('../../src/chart/indicators/calc/dx.js');
const { calcADX } = require('../../src/chart/indicators/calc/adx.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function makeCandles(rows) {
    return rows.map((r, i) => ({
        time: `t${i}`, open: r[2], high: r[0], low: r[1], close: r[2], volume: 0,
    }));
}

describe('calcDX', () => {
    it('empty candles → empty triplet', () => {
        assert.deepStrictEqual(calcDX([], { length: 14 }), { plusDI: [], minusDI: [], dx: [] });
    });

    it('length larger than candles → every value null on all three', () => {
        const candles = makeCandles([[2, 1, 1.5], [3, 2, 2.5], [4, 3, 3.5]]);
        const r = calcDX(candles, { length: 14 });
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(r.plusDI[i].value, null);
            assert.strictEqual(r.minusDI[i].value, null);
            assert.strictEqual(r.dx[i].value, null);
        }
    });

    it('output length matches candles[] and time is passed through (all three series)', () => {
        const candles = makeCandles([
            [2, 1, 1.5], [3, 2, 2.5], [4, 3, 3.5], [5, 4, 4.5], [6, 5, 5.5],
        ]);
        const r = calcDX(candles, { length: 3 });
        assert.strictEqual(r.plusDI.length, candles.length);
        assert.strictEqual(r.minusDI.length, candles.length);
        assert.strictEqual(r.dx.length, candles.length);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.plusDI[i].time, candles[i].time);
            assert.strictEqual(r.minusDI[i].time, candles[i].time);
            assert.strictEqual(r.dx[i].time, candles[i].time);
        }
    });

    it('plusDI/minusDI match adx.js on the same input (shared DI logic)', () => {
        // Build a non-trivial candle set with mixed up/down moves.
        const rows = [
            [10, 8, 9],   [12, 9, 11],  [11, 7, 8],   [13, 9, 12],  [14, 10, 13],
            [13, 11, 12], [15, 11, 14], [16, 12, 15], [14, 11, 13], [13, 10, 11],
            [14, 9, 13],  [15, 12, 14], [16, 13, 15], [15, 13, 14], [16, 14, 15],
            [17, 14, 16], [18, 15, 17], [16, 14, 15], [17, 15, 16], [18, 16, 17],
        ];
        const candles = makeCandles(rows);
        const dx = calcDX(candles, { length: 5 });
        const adx = calcADX(candles, { length: 5 });
        for (let i = 0; i < rows.length; i++) {
            const a = adx.plusDI[i].value;
            const b = dx.plusDI[i].value;
            if (a === null) assert.strictEqual(b, null);
            else approxEq(b, a, 1e-12);
            const c = adx.minusDI[i].value;
            const d = dx.minusDI[i].value;
            if (c === null) assert.strictEqual(d, null);
            else approxEq(d, c, 1e-12);
        }
    });

    it('strictly rising HL series → +DI dominant, -DI near 0, DX near 100', () => {
        const rows = [];
        for (let i = 0; i < 30; i++) rows.push([10 + i, 9 + i, 9.5 + i]);
        const candles = makeCandles(rows);
        const r = calcDX(candles, { length: 5 });
        // Once formed: every up-move >0, no down-move → -DM = 0 →
        // smoothed -DI = 0, DX = 100 * |+DI - 0| / +DI = 100.
        const last = r.dx[rows.length - 1].value;
        approxEq(last, 100, 1e-9);
        const lastMinus = r.minusDI[rows.length - 1].value;
        approxEq(lastMinus, 0, 1e-9);
    });

    it('DX is bounded in [0, 100]', () => {
        const rows = [];
        for (let i = 0; i < 50; i++) {
            const m = i * 0.5 + (i % 3 === 0 ? 1.5 : 0);
            rows.push([10 + m + 1, 10 + m - 1, 10 + m]);
        }
        const candles = makeCandles(rows);
        const r = calcDX(candles, { length: 7 });
        for (let i = 0; i < rows.length; i++) {
            const v = r.dx[i].value;
            if (v === null) continue;
            assert.ok(v >= 0 && v <= 100, `dx out of range at i=${i}: ${v}`);
        }
    });
});
