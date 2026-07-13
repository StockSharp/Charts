// PriceVolumeTrend: cumulative volume-weighted pct change.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcPriceVolumeTrend } = require('../../src/chart/indicators/calc/pricevolumetrend.js');

describe('calcPriceVolumeTrend', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcPriceVolumeTrend([], {}), []);
    });

    it('first bar is null (warm-up; needs prev close)', () => {
        const r = calcPriceVolumeTrend([
            { time: 't0', open: 0, high: 0, low: 0, close: 10, volume: 100 },
        ], {});
        assert.strictEqual(r.length, 1);
        assert.strictEqual(r[0].value, null);
    });

    it('cumulative increment on 4 bars', () => {
        // bar0 c=50 v=100 → null (seed)
        // bar1 c=55 v=200 → pvt = 0 + 200 * (55-50)/50 = 20
        // bar2 c=53 v=150 → pvt = 20 + 150 * (53-55)/55 = 20 - 300/55
        // bar3 c=60 v=100 → pvt = prev + 100 * (60-53)/53
        const candles = [
            { time: 't0', open: 50, high: 50, low: 50, close: 50, volume: 100 },
            { time: 't1', open: 55, high: 55, low: 55, close: 55, volume: 200 },
            { time: 't2', open: 53, high: 53, low: 53, close: 53, volume: 150 },
            { time: 't3', open: 60, high: 60, low: 60, close: 60, volume: 100 },
        ];
        const r = calcPriceVolumeTrend(candles, {});
        assert.strictEqual(r[0].value, null);
        const e1 = 200 * (5 / 50);
        assert.ok(Math.abs(r[1].value - e1) < 1e-9, `bar1: got ${r[1].value}, want ${e1}`);
        const e2 = e1 + 150 * ((53 - 55) / 55);
        assert.ok(Math.abs(r[2].value - e2) < 1e-9, `bar2: got ${r[2].value}, want ${e2}`);
        const e3 = e2 + 100 * ((60 - 53) / 53);
        assert.ok(Math.abs(r[3].value - e3) < 1e-9, `bar3: got ${r[3].value}, want ${e3}`);
    });

    it('time field passed through', () => {
        const candles = [
            { time: 'a', open: 1, high: 1, low: 1, close: 1, volume: 1 },
            { time: 'b', open: 2, high: 2, low: 2, close: 2, volume: 1 },
        ];
        const r = calcPriceVolumeTrend(candles, {});
        assert.strictEqual(r[0].time, 'a');
        assert.strictEqual(r[1].time, 'b');
    });

    it('output length equals input length', () => {
        const candles = [];
        for (let i = 0; i < 5; i++) candles.push({ time: `t${i}`, open: 10, high: 10, low: 10, close: 10 + i, volume: 100 });
        const r = calcPriceVolumeTrend(candles, {});
        assert.strictEqual(r.length, 5);
    });
});
