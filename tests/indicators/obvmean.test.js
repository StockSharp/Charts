// OnBalanceVolumeMean: SMA over the OnBalanceVolume series.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcOnBalanceVolumeMean } = require('../../src/chart/indicators/calc/obvmean.js');
const { calcOnBalanceVolume } = require('../../src/chart/indicators/calc/onbalancevolume.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcOnBalanceVolumeMean', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcOnBalanceVolumeMean([], {}), []);
    });

    it('warm-up: first (length-1) values null', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) {
            candles.push({ time: `t${i}`, open: 0, high: 0, low: 0, close: 10 + i, volume: 100 });
        }
        const r = calcOnBalanceVolumeMean(candles, { length: 5 });
        assert.strictEqual(r.length, 10);
        for (let i = 0; i < 4; i++) assert.strictEqual(r[i].value, null);
        assert.notStrictEqual(r[4].value, null);
    });

    it('value at bar i equals mean of OBV[i-length+1..i]', () => {
        const candles = [];
        // Mix of up / down closes so OBV actually moves.
        const closes = [10, 11, 10, 12, 11, 13, 12, 14, 13, 15, 14, 16];
        for (let i = 0; i < closes.length; i++) {
            candles.push({ time: `t${i}`, open: closes[i], high: closes[i], low: closes[i], close: closes[i], volume: 100 });
        }
        const length = 4;
        const r = calcOnBalanceVolumeMean(candles, { length });
        const obv = calcOnBalanceVolume(candles, {});
        for (let i = length - 1; i < candles.length; i++) {
            let sum = 0;
            for (let k = i - length + 1; k <= i; k++) sum += obv[k].value;
            const expected = sum / length;
            approxEq(r[i].value, expected);
        }
    });

    it('shape matches input length and timestamps pass through', () => {
        const candles = [];
        for (let i = 0; i < 12; i++) {
            candles.push({ time: `t${i}`, open: 1, high: 1, low: 1, close: 1, volume: 1 });
        }
        const r = calcOnBalanceVolumeMean(candles, { length: 3 });
        assert.strictEqual(r.length, 12);
        for (let i = 0; i < 12; i++) assert.strictEqual(r[i].time, `t${i}`);
    });

    it('non-positive length → all null', () => {
        const candles = [];
        for (let i = 0; i < 5; i++) {
            candles.push({ time: `t${i}`, open: 1, high: 1, low: 1, close: i, volume: 10 });
        }
        const r = calcOnBalanceVolumeMean(candles, { length: 0 });
        for (const p of r) assert.strictEqual(p.value, null);
    });
});
