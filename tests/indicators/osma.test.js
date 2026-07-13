// OscillatorOfMovingAverage: percentage gap between short SMA and long SMA.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcOscillatorOfMovingAverage } = require('../../src/chart/indicators/calc/osma.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function mk(close, i) {
    return { time: `t${i}`, open: close, high: close, low: close, close, volume: 1 };
}

describe('calcOscillatorOfMovingAverage', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcOscillatorOfMovingAverage([], {}), []);
    });

    it('warm-up: first max(short,long)-1 values are null; formula valid afterwards', () => {
        const candles = [];
        for (let i = 0; i < 15; i++) candles.push(mk(10 + i, i));
        const r = calcOscillatorOfMovingAverage(candles, { shortPeriod: 3, longPeriod: 5 });
        // longPeriod=5 wins; first 4 indices null.
        for (let i = 0; i < 4; i++) assert.strictEqual(r[i].value, null);
        assert.notStrictEqual(r[4].value, null);
    });

    it('flat closes → OMA == 0 (short SMA equals long SMA)', () => {
        const candles = [];
        for (let i = 0; i < 15; i++) candles.push(mk(100, i));
        const r = calcOscillatorOfMovingAverage(candles, { shortPeriod: 3, longPeriod: 5 });
        for (let i = 4; i < 15; i++) approxEq(r[i].value, 0);
    });

    it('hand-computed value with shortPeriod=2, longPeriod=4', () => {
        // closes: [10, 12, 14, 16, 18, 20]
        // At i=3: shortSMA(2) over [14,16]=15; longSMA(4) over [10,12,14,16]=13
        //   OMA = (15-13)/13 * 100 = 200/13 ≈ 15.3846153846
        const candles = [10, 12, 14, 16, 18, 20].map((c, i) => mk(c, i));
        const r = calcOscillatorOfMovingAverage(candles, { shortPeriod: 2, longPeriod: 4 });
        const expected = ((15 - 13) / 13) * 100;
        approxEq(r[3].value, expected);

        // At i=4: shortSMA(2) over [16,18]=17; longSMA(4) over [12,14,16,18]=15
        //   OMA = (17-15)/15 * 100 = 200/15 ≈ 13.3333...
        const expected4 = ((17 - 15) / 15) * 100;
        approxEq(r[4].value, expected4);
    });

    it('non-positive period → all null', () => {
        const candles = [];
        for (let i = 0; i < 5; i++) candles.push(mk(10, i));
        const a = calcOscillatorOfMovingAverage(candles, { shortPeriod: 0, longPeriod: 3 });
        for (const p of a) assert.strictEqual(p.value, null);
        const b = calcOscillatorOfMovingAverage(candles, { shortPeriod: 2, longPeriod: -1 });
        for (const p of b) assert.strictEqual(p.value, null);
    });

    it('time field passed through unchanged; output length matches input', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) candles.push(mk(10 + i * 0.5, i));
        const r = calcOscillatorOfMovingAverage(candles, { shortPeriod: 3, longPeriod: 5 });
        assert.strictEqual(r.length, 10);
        for (let i = 0; i < 10; i++) assert.strictEqual(r[i].time, candles[i].time);
    });
});
