// Chande Kroll Stop — long/short adaptive stops.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcChandeKrollStop } = require('../../src/chart/indicators/calc/chandekrollstop.js');

function makeCandles(rows) {
    // rows: [high, low]
    return rows.map((r, i) => ({
        time: `t${i}`, open: (r[0] + r[1]) / 2, high: r[0], low: r[1],
        close: (r[0] + r[1]) / 2, volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcChandeKrollStop', () => {
    it('empty candles → empty pair', () => {
        assert.deepStrictEqual(calcChandeKrollStop([], {}),
                               { longStop: [], shortStop: [] });
    });

    it('candles fewer than warm-up → all-null on both lines', () => {
        // default period=10: lines are gated on Highest/Lowest.IsFormed (bar 9),
        // so fewer than `period` candles → all null.
        const rows = [];
        for (let i = 0; i < 8; i++) rows.push([10 + i, 8 + i]);
        const r = calcChandeKrollStop(makeCandles(rows), {});
        assert.strictEqual(r.longStop.length, 8);
        assert.strictEqual(r.shortStop.length, 8);
        for (let i = 0; i < 8; i++) {
            assert.strictEqual(r.longStop[i].value, null);
            assert.strictEqual(r.shortStop[i].value, null);
        }
    });

    it('shape consistency: both lines have same length and times', () => {
        const rows = [];
        for (let i = 0; i < 20; i++) rows.push([10 + i, 8 + i]);
        const candles = makeCandles(rows);
        const r = calcChandeKrollStop(candles, { period: 3, multiplier: 1.5, stopPeriod: 2 });
        assert.strictEqual(r.longStop.length, candles.length);
        assert.strictEqual(r.shortStop.length, candles.length);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.longStop[i].time, candles[i].time);
            assert.strictEqual(r.shortStop[i].time, candles[i].time);
        }
    });

    it('warm-up: first non-null at period - 1 (partial-seed SMA)', () => {
        // period=3 → Highest/Lowest form at bar 2; the partial-seed SMA emits a
        // (growing) value from that same bar, so first non-null is index 2.
        const rows = [];
        for (let i = 0; i < 8; i++) rows.push([10 + i, 8 + i]);
        const r = calcChandeKrollStop(makeCandles(rows), {
            period: 3, multiplier: 1, stopPeriod: 2,
        });
        for (let i = 0; i < 2; i++) {
            assert.strictEqual(r.longStop[i].value, null);
            assert.strictEqual(r.shortStop[i].value, null);
        }
        assert.notStrictEqual(r.longStop[2].value, null);
        assert.notStrictEqual(r.shortStop[2].value, null);
    });

    it('hand-computed: period=2, multiplier=1, stopPeriod=2', () => {
        // rows: [(high, low)]
        // bar 0: H=10 L=8
        // bar 1: H=11 L=9
        // bar 2: H=12 L=10
        // bar 3: H=13 L=11
        //
        // Period=2:
        //   bar 1: maxH=11, minL=8, diff=3 → stopLong=11-3=8, stopShort=8+3=11
        //   bar 2: maxH=12, minL=9, diff=3 → stopLong=12-3=9, stopShort=9+3=12
        //   bar 3: maxH=13, minL=10, diff=3 → stopLong=13-3=10, stopShort=10+3=13
        //
        // StopPeriod=2 partial-seed SMA (Buffer.Sum / StopPeriod), emitting from
        // bar 1 (Period-1) where Highest/Lowest first form:
        //   bar 1: longStop = 8/2 = 4,     shortStop = 11/2 = 5.5   (partial seed)
        //   bar 2: longStop = (8+9)/2 = 8.5, shortStop = (11+12)/2 = 11.5
        //   bar 3: longStop = (9+10)/2 = 9.5, shortStop = (12+13)/2 = 12.5
        const rows = [[10, 8], [11, 9], [12, 10], [13, 11]];
        const r = calcChandeKrollStop(makeCandles(rows), {
            period: 2, multiplier: 1, stopPeriod: 2,
        });
        assert.strictEqual(r.longStop[0].value, null);
        approxEq(r.longStop[1].value, 4);
        approxEq(r.shortStop[1].value, 5.5);
        approxEq(r.longStop[2].value, 8.5);
        approxEq(r.shortStop[2].value, 11.5);
        approxEq(r.longStop[3].value, 9.5);
        approxEq(r.shortStop[3].value, 12.5);
    });

    it('shortStop > longStop whenever multiplier > 0 and range > 0', () => {
        const rows = [];
        for (let i = 0; i < 15; i++) rows.push([10 + (i % 3), 8 - (i % 2)]);
        const r = calcChandeKrollStop(makeCandles(rows), {
            period: 3, multiplier: 1.5, stopPeriod: 2,
        });
        for (let i = 0; i < rows.length; i++) {
            const ls = r.longStop[i].value;
            const ss = r.shortStop[i].value;
            if (ls === null || ss === null) continue;
            assert.ok(ss >= ls, `bar ${i}: shortStop ${ss} should be >= longStop ${ls}`);
        }
    });
});
