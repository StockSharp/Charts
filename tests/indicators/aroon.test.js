// Aroon: shape, warm-up, hand-computed up/down for known windows.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcAroon } = require('../../src/chart/indicators/calc/aroon.js');

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

describe('calcAroon', () => {
    it('empty candles → {up:[], down:[]}', () => {
        assert.deepStrictEqual(calcAroon([], { length: 14 }), { up: [], down: [] });
    });

    it('length larger than candle count → every value null on both lines', () => {
        const candles = makeCandles([[2, 1], [3, 2], [4, 3]]);
        const r = calcAroon(candles, { length: 14 });
        assert.strictEqual(r.up.length, 3);
        assert.strictEqual(r.down.length, 3);
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(r.up[i].value, null);
            assert.strictEqual(r.down[i].value, null);
        }
    });

    it('both sub-series have the same length as candles[]', () => {
        const hl = [];
        for (let i = 0; i < 10; i++) hl.push([10 + i, 5 + i]);
        const r = calcAroon(makeCandles(hl), { length: 3 });
        assert.strictEqual(r.up.length, 10);
        assert.strictEqual(r.down.length, 10);
    });

    it('strictly rising window: aroonUp=100 each bar', () => {
        // Highs and lows both strictly rising → current bar is always the
        // highest high (age=0 → up=100). Window length=4. The Aroon.cs
        // eviction-rescan re-assigns `_minValueAge = i` (a buffer index
        // treated as a bars-ago count) on the first eviction, so the
        // exact down value depends on that quirky bookkeeping.
        const candles = makeCandles([[1, 0], [2, 1], [3, 2], [4, 3], [5, 4]]);
        const r = calcAroon(candles, { length: 4 }); // window covers 4 bars
        // First non-null at i = length-1 = 3.
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(r.up[i].value, null);
            assert.strictEqual(r.down[i].value, null);
        }
        // i=3: first formed. up: highest=h[3]=4 set age=0 → 100. down:
        // lowest=l[0]=0 set on bar 0, age=3 → 100*(4-3)/4 = 25.
        assert.strictEqual(r.up[3].value, 100);
        assert.strictEqual(r.down[3].value, 25);
        // i=4: aging makes minValueAge++ = 4 first, then eviction-rescan
        // (since bufL[0] == minValue) resets to bufL index 1 of the
        // remaining buffer (bar 1 with l=1) → minValueAge = 1.
        // Output down = 100*(4-1)/4 = 75.
        assert.strictEqual(r.up[4].value, 100);
        assert.strictEqual(r.down[4].value, 75);
    });

    it('strictly falling window: aroonDown=100 each bar', () => {
        const candles = makeCandles([[5, 4], [4, 3], [3, 2], [2, 1], [1, 0]]);
        const r = calcAroon(candles, { length: 4 });
        // i=4 mirrors the rising case: highest=5 at bar 0, but its
        // _maxValueAge gets reassigned to buffer index 1 (bar 1 with h=4)
        // by the rescan → up = 100*(4-1)/4 = 75. Lowest = current bar.
        assert.strictEqual(r.up[4].value, 75);
        assert.strictEqual(r.down[4].value, 100);
    });

    it('time field passed through unchanged on both series', () => {
        const candles = makeCandles([[2, 1], [3, 2], [4, 3], [5, 4], [6, 5]]);
        const r = calcAroon(candles, { length: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.up[i].time, candles[i].time);
            assert.strictEqual(r.down[i].time, candles[i].time);
        }
    });
});
