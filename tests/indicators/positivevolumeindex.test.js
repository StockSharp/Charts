// PositiveVolumeIndex: seed 1000, applies pct change on volume-up bars only.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcPositiveVolumeIndex } = require('../../src/chart/indicators/calc/positivevolumeindex.js');

describe('calcPositiveVolumeIndex', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcPositiveVolumeIndex([], {}), []);
    });

    it('first bar emits seed 1000 unchanged', () => {
        const r = calcPositiveVolumeIndex([
            { time: 't0', open: 0, high: 0, low: 0, close: 10, volume: 100 },
        ], {});
        assert.strictEqual(r[0].value, 1000);
    });

    it('volume-down bar does NOT change PVI; volume-up applies pct change', () => {
        // bar0 c=10 v=100 → 1000 (seed)
        // bar1 c=11 v=80  → volume DOWN → 1000 (unchanged)
        // bar2 c=12 v=150 → volume UP; pct = (12-11)/11; pvi = 1000 + 1000 * 1/11
        const candles = [
            { time: 't0', open: 10, high: 10, low: 10, close: 10, volume: 100 },
            { time: 't1', open: 11, high: 11, low: 11, close: 11, volume: 80 },
            { time: 't2', open: 12, high: 12, low: 12, close: 12, volume: 150 },
        ];
        const r = calcPositiveVolumeIndex(candles, {});
        assert.strictEqual(r[0].value, 1000);
        assert.strictEqual(r[1].value, 1000);
        const expected = 1000 + 1000 * ((12 - 11) / 11);
        assert.ok(Math.abs(r[2].value - expected) < 1e-9, `got ${r[2].value}, want ${expected}`);
    });

    it('zero-volume bar does NOT trigger update', () => {
        const candles = [
            { time: 't0', open: 10, high: 10, low: 10, close: 10, volume: 100 },
            { time: 't1', open: 11, high: 11, low: 11, close: 11, volume: 0 },
        ];
        const r = calcPositiveVolumeIndex(candles, {});
        assert.strictEqual(r[0].value, 1000);
        assert.strictEqual(r[1].value, 1000);
    });

    it('time field passed through', () => {
        const r = calcPositiveVolumeIndex([
            { time: 'x', open: 1, high: 1, low: 1, close: 1, volume: 1 },
        ], {});
        assert.strictEqual(r[0].time, 'x');
    });

    it('cumulative increment formula on 4 bars', () => {
        // bar0 c=50 v=100 → 1000
        // bar1 c=55 v=150 → volume UP, pct=(55-50)/50=0.1, pvi=1100
        // bar2 c=52 v=200 → volume UP, pct=(52-55)/55=-3/55, pvi=1100*(1-3/55)
        // bar3 c=60 v=199 → volume DOWN, pvi unchanged
        const candles = [
            { time: 't0', open: 50, high: 50, low: 50, close: 50, volume: 100 },
            { time: 't1', open: 55, high: 55, low: 55, close: 55, volume: 150 },
            { time: 't2', open: 52, high: 52, low: 52, close: 52, volume: 200 },
            { time: 't3', open: 60, high: 60, low: 60, close: 60, volume: 199 },
        ];
        const r = calcPositiveVolumeIndex(candles, {});
        assert.strictEqual(r[0].value, 1000);
        assert.ok(Math.abs(r[1].value - 1100) < 1e-9);
        const v2 = 1100 + 1100 * ((52 - 55) / 55);
        assert.ok(Math.abs(r[2].value - v2) < 1e-9);
        assert.ok(Math.abs(r[3].value - v2) < 1e-9);
    });
});
