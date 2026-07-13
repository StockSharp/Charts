// Keltner Channels: middle = EMA(close, N); upper/lower = middle ± mult * ATR(N).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcKeltnerChannels } = require('../../src/chart/indicators/calc/keltner.js');
const { partialSeedEMA, csATR } = require('../../src/chart/indicators/calc/helpers.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function mk(h, l, c, i) {
    return { time: `t${i}`, open: (h + l) / 2, high: h, low: l, close: c, volume: 1 };
}

describe('calcKeltnerChannels', () => {
    it('empty candles → empty middle/upper/lower', () => {
        assert.deepStrictEqual(calcKeltnerChannels([], {}), { middle: [], upper: [], lower: [] });
    });

    it('warm-up: null until both EMA and ATR are formed', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) candles.push(mk(2 + i * 0.1, 1, 1.5 + i * 0.05, i));
        const r = calcKeltnerChannels(candles, { length: 5, multiplier: 2 });
        // C# Middle (EMA) and ATR both form at bar length-1=4 — Middle's
        // buffer fills with `length` closes and the underlying ATR's buffer
        // fills with `length` TR samples (TR[0]=high-low seeds at bar 0).
        // Outer KeltnerChannels.IsFormed iff both formed, so first non-null
        // is bar length-1=4.
        for (let i = 0; i < 4; i++) {
            assert.strictEqual(r.middle[i].value, null);
            assert.strictEqual(r.upper[i].value, null);
            assert.strictEqual(r.lower[i].value, null);
        }
        assert.notStrictEqual(r.middle[4].value, null);
    });

    it('upper >= middle >= lower once warmed up', () => {
        const candles = [];
        for (let i = 0; i < 40; i++) {
            const c = 100 + Math.sin(i / 3) * 5;
            candles.push(mk(c + 1, c - 1, c, i));
        }
        const r = calcKeltnerChannels(candles, { length: 10, multiplier: 2 });
        for (let i = 10; i < 40; i++) {
            if (r.middle[i].value !== null) {
                assert.ok(r.upper[i].value >= r.middle[i].value);
                assert.ok(r.lower[i].value <= r.middle[i].value);
            }
        }
    });

    it('formula check: middle == EMA(close); upper-middle == multiplier*ATR; middle-lower == multiplier*ATR', () => {
        const candles = [];
        for (let i = 0; i < 30; i++) {
            const c = 50 + i * 0.5;
            candles.push(mk(c + 1, c - 1, c, i));
        }
        const r = calcKeltnerChannels(candles, { length: 10, multiplier: 2.5 });
        const closes = candles.map(c => c.close);
        const ema = partialSeedEMA(closes, 10);
        const atr = csATR(candles, 10);
        for (let i = 10; i < 30; i++) {
            if (r.middle[i].value !== null && ema[i] !== null && atr[i].value !== null) {
                approxEq(r.middle[i].value, ema[i]);
                approxEq(r.upper[i].value - r.middle[i].value, 2.5 * atr[i].value);
                approxEq(r.middle[i].value - r.lower[i].value, 2.5 * atr[i].value);
            }
        }
    });

    it('flat candles (TR=0) → upper == middle == lower once formed', () => {
        const candles = [];
        for (let i = 0; i < 30; i++) candles.push(mk(5, 5, 5, i));
        const r = calcKeltnerChannels(candles, { length: 5, multiplier: 2 });
        for (let i = 5; i < 30; i++) {
            if (r.middle[i].value !== null) {
                approxEq(r.upper[i].value, r.middle[i].value);
                approxEq(r.lower[i].value, r.middle[i].value);
            }
        }
    });

    it('output shapes match input length; timestamps pass through', () => {
        const candles = [];
        for (let i = 0; i < 15; i++) candles.push(mk(2, 1, 1.5, i));
        const r = calcKeltnerChannels(candles, { length: 5, multiplier: 1 });
        assert.strictEqual(r.middle.length, 15);
        assert.strictEqual(r.upper.length, 15);
        assert.strictEqual(r.lower.length, 15);
        for (let i = 0; i < 15; i++) {
            assert.strictEqual(r.middle[i].time, candles[i].time);
            assert.strictEqual(r.upper[i].time, candles[i].time);
            assert.strictEqual(r.lower[i].time, candles[i].time);
        }
    });
});
