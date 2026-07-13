// Envelope: shape integrity (three same-length series), warm-up nulls,
// hand-computed bands.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcEnvelope } = require('../../src/chart/indicators/calc/envelope.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: c,
        high: c,
        low: c,
        close: c,
        volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcEnvelope', () => {
    it('empty candles → {upper:[], middle:[], lower:[]}', () => {
        const r = calcEnvelope([], { length: 20, percent: 1 });
        assert.deepStrictEqual(r, { upper: [], middle: [], lower: [] });
    });

    it('length larger than candle count → every value null on all three series', () => {
        const r = calcEnvelope(makeCandles([1, 2, 3]), { length: 10, percent: 1 });
        assert.strictEqual(r.upper.length, 3);
        assert.strictEqual(r.middle.length, 3);
        assert.strictEqual(r.lower.length, 3);
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(r.upper[i].value, null);
            assert.strictEqual(r.middle[i].value, null);
            assert.strictEqual(r.lower[i].value, null);
        }
    });

    it('all three sub-series have the same length as candles[]', () => {
        const candles = makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const r = calcEnvelope(candles, { length: 4, percent: 2 });
        assert.strictEqual(r.upper.length, candles.length);
        assert.strictEqual(r.middle.length, candles.length);
        assert.strictEqual(r.lower.length, candles.length);
    });

    it('length=3, percent=2 on [2,4,6,8]: bands = middle * (1 ± 0.02)', () => {
        const r = calcEnvelope(makeCandles([2, 4, 6, 8]), { length: 3, percent: 2 });
        // i=0,1: null
        assert.strictEqual(r.middle[0].value, null);
        assert.strictEqual(r.middle[1].value, null);
        // i=2: SMA(2,4,6) = 4
        assert.strictEqual(r.middle[2].value, 4);
        approxEq(r.upper[2].value, 4 * 1.02);
        approxEq(r.lower[2].value, 4 * 0.98);
        // i=3: SMA(4,6,8) = 6
        assert.strictEqual(r.middle[3].value, 6);
        approxEq(r.upper[3].value, 6 * 1.02);
        approxEq(r.lower[3].value, 6 * 0.98);
    });

    it('default params (length=20, percent=1) when params omitted', () => {
        const closes = [];
        for (let i = 1; i <= 20; i++) closes.push(i);
        const r = calcEnvelope(makeCandles(closes));
        for (let i = 0; i < 19; i++) {
            assert.strictEqual(r.middle[i].value, null);
            assert.strictEqual(r.upper[i].value, null);
            assert.strictEqual(r.lower[i].value, null);
        }
        // Mean of 1..20 = 10.5; bands = 10.5 * 1.01 / 0.99
        assert.strictEqual(r.middle[19].value, 10.5);
        approxEq(r.upper[19].value, 10.5 * 1.01);
        approxEq(r.lower[19].value, 10.5 * 0.99);
    });

    it('time field passed through unchanged on all three series', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const r = calcEnvelope(candles, { length: 3, percent: 1 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.upper[i].time, candles[i].time);
            assert.strictEqual(r.middle[i].time, candles[i].time);
            assert.strictEqual(r.lower[i].time, candles[i].time);
        }
    });
});
