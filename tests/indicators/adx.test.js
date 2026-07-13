// ADX (+DI, −DI, ADX) — shape integrity, warm-up cascade, and a
// monotonic-up reference series where the math saturates to +DI=100/-DI=0/
// DX=ADX=100 so the result is easy to verify by hand.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcADX } = require('../../src/chart/indicators/calc/adx.js');

function makeCandles(hlc) {
    return hlc.map((row, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: row[2],
        high: row[0],
        low: row[1],
        close: row[2],
        volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcADX', () => {
    it('empty candles → {adx:[], plusDI:[], minusDI:[]}', () => {
        const r = calcADX([], { length: 14 });
        assert.deepStrictEqual(r, { adx: [], plusDI: [], minusDI: [] });
    });

    it('candle count too small for warm-up → every value null on all three series', () => {
        // length=14 needs 2*14 - 1 = 27 candles for the first non-null ADX.
        const hlc = [];
        for (let i = 0; i < 5; i++) hlc.push([i + 1, i, i + 0.5]);
        const r = calcADX(makeCandles(hlc), { length: 14 });
        assert.strictEqual(r.adx.length, 5);
        for (let i = 0; i < 5; i++) {
            assert.strictEqual(r.adx[i].value, null);
            assert.strictEqual(r.plusDI[i].value, null);
            assert.strictEqual(r.minusDI[i].value, null);
        }
    });

    it('all three sub-series have the same length as candles[]', () => {
        const hlc = [];
        for (let i = 0; i < 10; i++) hlc.push([i + 1, i, i + 0.5]);
        const candles = makeCandles(hlc);
        const r = calcADX(candles, { length: 3 });
        assert.strictEqual(r.adx.length, candles.length);
        assert.strictEqual(r.plusDI.length, candles.length);
        assert.strictEqual(r.minusDI.length, candles.length);
    });

    it('length=2 on a strictly rising series saturates +DI=200/3, -DI=0, ADX=100', () => {
        // h_i = i+1, l_i = i, c_i = i+0.5 → upMove=1, downMove=-1, +DM=1, -DM=0
        // TR = max(1, |h-prev_close|, |l-prev_close|) = max(1, 1.5, 0.5) = 1.5
        // smPlusDM = smMinusDM-stays-0, smTR = 1.5 (constant after seed)
        // +DI = 100 * 1 / 1.5 = 200/3; -DI = 0; DX = 100; ADX saturates to 100.
        const hlc = [];
        for (let i = 0; i < 8; i++) hlc.push([i + 1, i, i + 0.5]);
        const r = calcADX(makeCandles(hlc), { length: 2 });

        // +DI/-DI warm-up: smoothing seeds at i=2 (first non-null DM at i=1,
        // need 2 values).
        assert.strictEqual(r.plusDI[0].value, null);
        assert.strictEqual(r.plusDI[1].value, null);
        approxEq(r.plusDI[2].value, 200 / 3);
        approxEq(r.plusDI[3].value, 200 / 3);
        assert.strictEqual(r.minusDI[2].value, 0);
        assert.strictEqual(r.minusDI[3].value, 0);

        // ADX warm-up: DX is null until i=2, then seeded over length=2 more
        // values → first non-null ADX at i=3.
        assert.strictEqual(r.adx[0].value, null);
        assert.strictEqual(r.adx[1].value, null);
        assert.strictEqual(r.adx[2].value, null);
        approxEq(r.adx[3].value, 100);
        approxEq(r.adx[4].value, 100);
    });

    it('time field passed through unchanged on all three series', () => {
        const hlc = [];
        for (let i = 0; i < 6; i++) hlc.push([i + 1, i, i + 0.5]);
        const candles = makeCandles(hlc);
        const r = calcADX(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.adx[i].time, candles[i].time);
            assert.strictEqual(r.plusDI[i].time, candles[i].time);
            assert.strictEqual(r.minusDI[i].time, candles[i].time);
        }
    });

    it('default length=14 produces null at index < 27 and a number from index 27 onward', () => {
        const hlc = [];
        for (let i = 0; i < 30; i++) hlc.push([i + 1, i, i + 0.5]);
        const r = calcADX(makeCandles(hlc));
        assert.strictEqual(r.adx[26].value, null);
        assert.notStrictEqual(r.adx[27].value, null);
    });
});
