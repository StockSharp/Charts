// Negative Volume Index: seed value, volume-down trigger rule, hand-traced trace.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcNVI } = require('../../src/chart/indicators/calc/nvi.js');

describe('calcNVI', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcNVI([], {}), []);
    });

    it('first bar emits seed value 1000 unchanged', () => {
        const r = calcNVI([{ time: 't0', open: 1, high: 1, low: 1, close: 10, volume: 100 }], {});
        assert.strictEqual(r.length, 1);
        assert.strictEqual(r[0].value, 1000);
    });

    it('volume-up bar does NOT change NVI; volume-down bar applies pct change', () => {
        // bar 0 c=10 v=100  → 1000 (seed)
        // bar 1 c=11 v=200  → volume UP → NVI stays 1000
        // bar 2 c=12 v=150  → volume DOWN; pct = (12-11)/11 = +0.090909...
        //                     NVI = 1000 + 1000 * 1/11 ≈ 1090.9090909...
        const candles = [
            { time: 't0', open: 10, high: 10, low: 10, close: 10, volume: 100 },
            { time: 't1', open: 11, high: 11, low: 11, close: 11, volume: 200 },
            { time: 't2', open: 12, high: 12, low: 12, close: 12, volume: 150 },
        ];
        const r = calcNVI(candles, {});
        assert.strictEqual(r[0].value, 1000);
        assert.strictEqual(r[1].value, 1000);
        const expected = 1000 + 1000 * ((12 - 11) / 11);
        assert.ok(Math.abs(r[2].value - expected) < 1e-9, `got ${r[2].value}, want ${expected}`);
    });

    it('zero-volume bar does NOT trigger NVI update even if close moves', () => {
        // .cs checks `candle.TotalVolume != 0` before any update logic.
        const candles = [
            { time: 't0', open: 10, high: 10, low: 10, close: 10, volume: 100 },
            { time: 't1', open: 11, high: 11, low: 11, close: 11, volume: 0 },
        ];
        const r = calcNVI(candles, {});
        assert.strictEqual(r[0].value, 1000);
        // volume=0 → skip update branch entirely; NVI stays at seed.
        assert.strictEqual(r[1].value, 1000);
    });

    it('time field passed through unchanged', () => {
        const candles = [
            { time: 'a', open: 1, high: 1, low: 1, close: 1, volume: 1 },
            { time: 'b', open: 2, high: 2, low: 2, close: 2, volume: 2 },
            { time: 'c', open: 3, high: 3, low: 3, close: 3, volume: 0.5 },
        ];
        const r = calcNVI(candles, {});
        assert.strictEqual(r[0].time, 'a');
        assert.strictEqual(r[1].time, 'b');
        assert.strictEqual(r[2].time, 'c');
    });
});
