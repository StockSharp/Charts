// ATR indicator: warm-up shape + Wilder smoothing against a hand-computed series.

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

    it('candle count ≤ length → every value null (need length+1 candles to seed)', () => {
        // length=14 needs 15 candles (1 prev-close + 14 TRs). 14 candles → all null.
        const rows = [];
        for (let i = 0; i < 14; i++) rows.push([i + 1, i, i + 0.5]);
        const out = calcATR(makeCandles(rows), { length: 14 });
        assert.strictEqual(out.length, 14);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('first (length) outputs are null; non-null ATR lands at index = length', () => {
        // length=3 → indices 0..2 null, first ATR at i=3.
        const rows = [
            [10, 8, 9], [12, 9, 11], [11, 9, 10], [13, 10, 12], [14, 11, 13],
        ];
        const out = calcATR(makeCandles(rows), { length: 3 });
        for (let i = 0; i < 3; i++) assert.strictEqual(out[i].value, null);
        assert.notStrictEqual(out[3].value, null);
    });

    it('length=3 over a known series matches hand-computed Wilder series', () => {
        // i=0: H=10 L=8 C=9     (no prev close → TR undefined)
        // i=1: H=12 L=9 C=11    prevClose=9   TR=max(12-9, |12-9|, |9-9|)=3
        // i=2: H=11 L=9 C=10    prevClose=11  TR=max(11-9, |11-11|, |9-11|)=2
        // i=3: H=13 L=10 C=12   prevClose=10  TR=max(13-10, |13-10|, |10-10|)=3
        // seed ATR = (3+2+3)/3 = 8/3
        // i=4: H=14 L=11 C=13   prevClose=12  TR=max(14-11, |14-12|, |11-12|)=3
        // ATR[4] = (ATR[3]*2 + 3)/3 = (16/3 + 3)/3 = (16/3 + 9/3)/3 = 25/9
        // i=5: H=12 L=10 C=11   prevClose=13  TR=max(12-10, |12-13|, |10-13|)=3
        // ATR[5] = (25/9*2 + 3)/3 = (50/9 + 27/9)/3 = 77/27
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
        approxEq(out[3].value, 8 / 3);
        approxEq(out[4].value, 25 / 9);
        approxEq(out[5].value, 77 / 27);
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
        // 14 candles is insufficient (need 15 for length=14) — first 14 all null.
        const rows = [];
        for (let i = 0; i < 14; i++) rows.push([i + 1, i, i + 0.5]);
        const out = calcATR(makeCandles(rows));
        assert.strictEqual(out.length, 14);
        for (const p of out) assert.strictEqual(p.value, null);
    });
});
