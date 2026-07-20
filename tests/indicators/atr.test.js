// ATR indicator: matches StockSharp AverageTrueRange = WilderMovingAverage over
// TrueRange, where TR[0] = high[0]-low[0]. Seeded by the SMA of the first `length`
// TRs (TR[0..length-1]); first non-null lands at index length-1.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcATR } = require('../../src/chart/indicators/calc/atr.js');

function makeCandles(rows) {
    // rows: [high, low, close]
    return rows.map((row, i) => ({
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

describe('calcATR', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcATR([], { length: 14 }), []);
    });

    it('fewer than length candles → every value null', () => {
        // length=14 needs 14 TRs (TR[0]=H-L then 13 more). 13 candles → all null.
        const rows = [];
        for (let i = 0; i < 13; i++) rows.push([i + 1, i, i + 0.5]);
        const out = calcATR(makeCandles(rows), { length: 14 });
        assert.strictEqual(out.length, 13);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('first (length-1) outputs are null; non-null ATR lands at index length-1', () => {
        // length=3 → indices 0..1 null, first ATR at i=2.
        const rows = [
            [10, 8, 9], [12, 9, 11], [11, 9, 10], [13, 10, 12], [14, 11, 13],
        ];
        const out = calcATR(makeCandles(rows), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.notStrictEqual(out[2].value, null);
    });

    it('length=3 over a known series matches hand-computed Wilder series (with TR[0])', () => {
        // TR[0]=10-8=2; TR[1]=max(3,|9-12|=3,|9-9|=0)=3; TR[2]=max(2,0,|11-9|=2)=2
        // TR[3]=max(3,|10-13|=3,0)=3; TR[4]=max(3,|12-14|=2,|12-11|=1)=3; TR[5]=max(2,|13-12|=1,|13-10|=3)=3
        // seed ATR[2] = (2+3+2)/3 = 7/3
        // ATR[3] = (7/3*2 + 3)/3 = 23/9
        // ATR[4] = (23/9*2 + 3)/3 = 73/27
        // ATR[5] = (73/27*2 + 3)/3 = 227/81
        const rows = [
            [10, 8, 9],
            [12, 9, 11],
            [11, 9, 10],
            [13, 10, 12],
            [14, 11, 13],
            [12, 10, 11],
        ];
        const out = calcATR(makeCandles(rows), { length: 3 });
        assert.strictEqual(out.length, 6);
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        approxEq(out[2].value, 7 / 3);
        approxEq(out[3].value, 23 / 9);
        approxEq(out[4].value, 73 / 27);
        approxEq(out[5].value, 227 / 81);
    });

    it('time field passed through unchanged', () => {
        const rows = [
            [10, 8, 9], [12, 9, 11], [11, 9, 10], [13, 10, 12],
        ];
        const candles = makeCandles(rows);
        const out = calcATR(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });

    it('default length=14 applies when params omitted', () => {
        // 14 candles → 14 TRs → forms exactly at index 13 (length-1); 0..12 null.
        const rows = [];
        for (let i = 0; i < 14; i++) rows.push([i + 1, i, i + 0.5]);
        const out = calcATR(makeCandles(rows));
        assert.strictEqual(out.length, 14);
        for (let i = 0; i < 13; i++) assert.strictEqual(out[i].value, null);
        assert.notStrictEqual(out[13].value, null);
    });
});
