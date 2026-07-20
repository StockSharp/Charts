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
    it('empty candles → {adx:[], dx:[], plusDI:[], minusDI:[]}', () => {
        const r = calcADX([], { length: 14 });
        assert.deepStrictEqual(r, { adx: [], dx: [], plusDI: [], minusDI: [] });
    });

    it('candle count too small for warm-up → every value null on all three series', () => {
        // length=14 needs 2*14 = 28 candles for the first non-null ADX.
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

    it('length=2 on a strictly rising series → -DI=0, DX=ADX=100, +DI per expanding Wilder', () => {
        // h_i = i+1, l_i = i, c_i = i+0.5 → upMove=1, downMove=-1, +DM=1, -DM=0.
        // TR[0]=high-low=1, TR[i>=1]=max(1,1.5,0.5)=1.5. Both DM and TR are
        // smoothed by the EXPANDING WilderMovingAverage, so smTR is not yet
        // saturated to 1.5 in the first bars:
        //   smTR: 1 (i0), 1.25 (i1), 1.375 (i2), 1.4375 (i3), ...
        //   smPlusDM: 1 from i1 onward (constant +DM=1).
        // Since -DM=0 → -DI=0 → DX=100 (constant), and ADX = WilderMA(DX=100)=100.
        const hlc = [];
        for (let i = 0; i < 8; i++) hlc.push([i + 1, i, i + 0.5]);
        const r = calcADX(makeCandles(hlc), { length: 2 });

        // DiPart.IsFormed → +DI/−DI/DX emitted from bar length+1 = 3.
        assert.strictEqual(r.plusDI[0].value, null);
        assert.strictEqual(r.plusDI[1].value, null);
        assert.strictEqual(r.plusDI[2].value, null);
        approxEq(r.plusDI[3].value, 100 / 1.4375); // 100 * smPlus(1) / smTR(1.4375)
        assert.strictEqual(r.minusDI[3].value, 0);
        // DX = 100 whenever +DI>0 and -DI=0.
        assert.strictEqual(r.dx[2].value, null);
        approxEq(r.dx[3].value, 100);

        // ADX: DX (=100) is fed only once DX is formed (bar 3), so the ADX
        // WilderMA forms at bar diFirst + length - 1 = 4, then stays 100.
        assert.strictEqual(r.adx[3].value, null);
        approxEq(r.adx[4].value, 100);
        approxEq(r.adx[5].value, 100);
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

    it('default length=14 produces null at index < 28 and a number from index 28 onward', () => {
        const hlc = [];
        for (let i = 0; i < 32; i++) hlc.push([i + 1, i, i + 0.5]);
        const r = calcADX(makeCandles(hlc));
        // ADX first appears at diFirst + length - 1 = 15 + 13 = 28.
        assert.strictEqual(r.adx[27].value, null);
        assert.notStrictEqual(r.adx[28].value, null);
    });
});
