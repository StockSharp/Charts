// Detrended Price Oscillator: close[i] - SMA(close, length)[i - lookBack],
// where lookBack = length/2 + 1 (integer division). Matches StockSharp
// DetrendedPriceOscillator.cs.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcDPO } = require('../../src/chart/indicators/calc/dpo.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcDPO', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcDPO([], { length: 3 }), []);
    });

    it('candles below warm-up → all null', () => {
        // length=5 → first valid at index 2*5-2 = 8; with 7 bars all null.
        const r = calcDPO(makeCandles([1, 2, 3, 4, 5, 6, 7]), { length: 5 });
        assert.strictEqual(r.length, 7);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('hand-computed length=3 on [1..7]', () => {
        // length=3, lookBack=3/2+1=2.
        // SMA: [null,null,2,3,4,5,6]
        // First valid DPO at i = 2*3-2 = 4.
        //   DPO[4] = close[4] - SMA[4-2] = 5 - 2 = 3
        //   DPO[5] = close[5] - SMA[3]   = 6 - 3 = 3
        //   DPO[6] = close[6] - SMA[4]   = 7 - 4 = 3
        const r = calcDPO(makeCandles([1, 2, 3, 4, 5, 6, 7]), { length: 3 });
        for (let i = 0; i < 4; i++) assert.strictEqual(r[i].value, null);
        approxEq(r[4].value, 3);
        approxEq(r[5].value, 3);
        approxEq(r[6].value, 3);
    });

    it('flat closes → DPO = 0 across the formed segment', () => {
        const r = calcDPO(makeCandles([5, 5, 5, 5, 5, 5, 5]), { length: 3 });
        for (let i = 4; i < 7; i++) approxEq(r[i].value, 0);
    });

    it('hand-computed length=4, lookBack = 4/2+1 = 3', () => {
        // closes = [10,20,30,40,50,60,70,80,90,100], length=4, lookBack=3.
        // SMA[3]=25, SMA[4]=35, SMA[5]=45, SMA[6]=55, SMA[7]=65, SMA[8]=75, SMA[9]=85
        // First valid at i = 2*4-2 = 6.
        //   DPO[6] = 70 - SMA[6-3=3] = 70 - 25 = 45
        //   DPO[7] = 80 - SMA[4]     = 80 - 35 = 45
        //   DPO[8] = 90 - SMA[5]     = 90 - 45 = 45
        //   DPO[9] = 100 - SMA[6]    = 100 - 55 = 45
        const closes = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        const r = calcDPO(makeCandles(closes), { length: 4 });
        for (let i = 0; i < 6; i++) assert.strictEqual(r[i].value, null);
        approxEq(r[6].value, 45);
        approxEq(r[7].value, 45);
        approxEq(r[8].value, 45);
        approxEq(r[9].value, 45);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([1, 2, 3, 4, 5, 6, 7]);
        const r = calcDPO(candles, { length: 3 });
        for (let i = 0; i < candles.length; i++) assert.strictEqual(r[i].time, candles[i].time);
    });
});
