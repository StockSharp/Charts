// Elliot Wave Oscillator: SMA(close, short) - SMA(close, long).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcElliotWaveOscillator } = require('../../src/chart/indicators/calc/ewo.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcElliotWaveOscillator', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcElliotWaveOscillator([], {}), []);
    });

    it('longPeriod larger than data → every value null', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) {
            candles.push({ time: `t${i}`, open: 1, high: 1, low: 1, close: 1, volume: 0 });
        }
        const r = calcElliotWaveOscillator(candles, { shortPeriod: 5, longPeriod: 34 });
        assert.strictEqual(r.length, 10);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('hand-computed reference vector with short=2, long=4', () => {
        // closes = [1, 2, 3, 4, 5, 6]
        // SMA(2): [_, 1.5, 2.5, 3.5, 4.5, 5.5]
        // SMA(4): [_, _, _, 2.5, 3.5, 4.5]
        // EWO   : [_, _, _, 1.0, 1.0, 1.0]
        const closes = [1, 2, 3, 4, 5, 6];
        const candles = closes.map((c, i) => ({
            time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
        }));
        const r = calcElliotWaveOscillator(candles, { shortPeriod: 2, longPeriod: 4 });
        for (let i = 0; i < 3; i++) assert.strictEqual(r[i].value, null);
        approxEq(r[3].value, 1);
        approxEq(r[4].value, 1);
        approxEq(r[5].value, 1);
    });

    it('constant close series → EWO is zero after warm-up', () => {
        const candles = [];
        for (let i = 0; i < 40; i++) {
            candles.push({ time: `t${i}`, open: 5, high: 5, low: 5, close: 5, volume: 0 });
        }
        const r = calcElliotWaveOscillator(candles, { shortPeriod: 5, longPeriod: 34 });
        for (let i = 0; i < 33; i++) assert.strictEqual(r[i].value, null);
        for (let i = 33; i < 40; i++) approxEq(r[i].value, 0);
    });

    it('time field passed through unchanged', () => {
        const candles = [
            { time: 'a', open: 1, high: 1, low: 1, close: 1, volume: 0 },
            { time: 'b', open: 2, high: 2, low: 2, close: 2, volume: 0 },
            { time: 'c', open: 3, high: 3, low: 3, close: 3, volume: 0 },
            { time: 'd', open: 4, high: 4, low: 4, close: 4, volume: 0 },
        ];
        const r = calcElliotWaveOscillator(candles, { shortPeriod: 2, longPeriod: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
