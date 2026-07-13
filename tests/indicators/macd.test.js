// MACD: three-series shape integrity, warm-up cascade
// (fast/slow/signal stack their nulls), and hand-computed sanity vector.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMACD } = require('../../src/chart/indicators/calc/macd.js');

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

describe('calcMACD', () => {
    it('empty candles → {macd:[], signal:[], histogram:[]}', () => {
        const r = calcMACD([], { fastLength: 12, slowLength: 26, signalLength: 9 });
        assert.deepStrictEqual(r, { macd: [], signal: [], histogram: [] });
    });

    it('candle count shorter than slowLength → every value null on all three series', () => {
        const r = calcMACD(makeCandles([1, 2, 3, 4]), { fastLength: 2, slowLength: 10, signalLength: 2 });
        for (let i = 0; i < 4; i++) {
            assert.strictEqual(r.macd[i].value, null);
            assert.strictEqual(r.signal[i].value, null);
            assert.strictEqual(r.histogram[i].value, null);
        }
    });

    it('all three sub-series have the same length as candles[]', () => {
        const candles = makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const r = calcMACD(candles, { fastLength: 2, slowLength: 4, signalLength: 2 });
        assert.strictEqual(r.macd.length, candles.length);
        assert.strictEqual(r.signal.length, candles.length);
        assert.strictEqual(r.histogram.length, candles.length);
    });

    it('fast=2/slow=4/signal=2 on [1..6] matches hand-computed values', () => {
        const r = calcMACD(makeCandles([1, 2, 3, 4, 5, 6]), { fastLength: 2, slowLength: 4, signalLength: 2 });

        // macd null until slow EMA seeds at index 3
        assert.strictEqual(r.macd[0].value, null);
        assert.strictEqual(r.macd[1].value, null);
        assert.strictEqual(r.macd[2].value, null);

        // EMA fast seed at i=1: 1.5; then 2.5, 3.5, 4.5, 5.5
        // EMA slow seed at i=3: 2.5; then 3.5, 4.5
        // macd[3] = 3.5 - 2.5 = 1.0
        // macd[4] = 4.5 - 3.5 = 1.0
        // macd[5] = 5.5 - 4.5 = 1.0
        approxEq(r.macd[3].value, 1.0);
        approxEq(r.macd[4].value, 1.0);
        approxEq(r.macd[5].value, 1.0);

        // signal: EMA(macd, 2). Seeds after 2 non-null macd values (i=3 → null, i=4 → seed=1.0)
        assert.strictEqual(r.signal[3].value, null);
        approxEq(r.signal[4].value, 1.0);
        approxEq(r.signal[5].value, 1.0);

        // histogram = macd − signal
        assert.strictEqual(r.histogram[3].value, null);
        approxEq(r.histogram[4].value, 0);
        approxEq(r.histogram[5].value, 0);
    });

    it('time field passed through unchanged on all three series', () => {
        const candles = makeCandles([1, 2, 3, 4, 5, 6, 7, 8]);
        const r = calcMACD(candles, { fastLength: 2, slowLength: 4, signalLength: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.macd[i].time, candles[i].time);
            assert.strictEqual(r.signal[i].time, candles[i].time);
            assert.strictEqual(r.histogram[i].time, candles[i].time);
        }
    });

    it('default params (12/26/9) — last non-null index is past slow+signal warm-up', () => {
        // 35 candles is the minimum to get a non-null signal under defaults:
        // slow EMA seeds at i=25, signal EMA needs 9 non-null macd values
        // (i=25..i=33), so first non-null signal is at i=33.
        const closes = [];
        for (let i = 1; i <= 35; i++) closes.push(i);
        const r = calcMACD(makeCandles(closes));
        assert.strictEqual(r.signal[32].value, null);
        assert.notStrictEqual(r.signal[33].value, null);
    });
});
