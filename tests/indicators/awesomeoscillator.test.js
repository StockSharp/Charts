// Awesome Oscillator: shape, warm-up, hand-computed AO and up-flag toggle.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcAwesomeOscillator } = require('../../src/chart/indicators/calc/awesomeoscillator.js');

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

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcAwesomeOscillator', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcAwesomeOscillator([], {}), []);
    });

    it('longLength larger than candle count → every value null', () => {
        const candles = makeCandles([[2, 1], [3, 2], [4, 3]]);
        const r = calcAwesomeOscillator(candles, { shortLength: 5, longLength: 34 });
        assert.strictEqual(r.length, 3);
        for (let i = 0; i < 3; i++) assert.strictEqual(r[i].value, null);
    });

    it('output length matches candles[]', () => {
        const hl = [];
        for (let i = 0; i < 10; i++) hl.push([10 + i, 5 + i]);
        const r = calcAwesomeOscillator(makeCandles(hl), { shortLength: 3, longLength: 5 });
        assert.strictEqual(r.length, 10);
    });

    it('short=3, long=5 on rising medians: AO = SMA(3) - SMA(5) is positive constant', () => {
        // Medians 1..N for hl=[i+0.5, i-0.5].
        // For arithmetic progression with step 1, SMA(3) over window [i-2..i] = i-1.
        // SMA(5) over window [i-4..i] = i-2. Diff = 1.
        const hl = [];
        for (let i = 1; i <= 8; i++) hl.push([i + 0.5, i - 0.5]);
        const candles = makeCandles(hl);
        const r = calcAwesomeOscillator(candles, { shortLength: 3, longLength: 5 });
        for (let i = 0; i < 4; i++) assert.strictEqual(r[i].value, null); // long warm-up
        for (let i = 4; i < hl.length; i++) approxEq(r[i].value, 1);
    });

    it('up flag flips when AO decreases vs previous bar', () => {
        // Medians: 1,2,3,4,5,6,7,8,7,6 — AO will rise then fall.
        const hl = [
            [1.5, 0.5], [2.5, 1.5], [3.5, 2.5], [4.5, 3.5],
            [5.5, 4.5], [6.5, 5.5], [7.5, 6.5], [8.5, 7.5],
            [7.5, 6.5], [6.5, 5.5],
        ];
        const candles = makeCandles(hl);
        const r = calcAwesomeOscillator(candles, { shortLength: 2, longLength: 3 });
        // From the first non-null AO at i=2 (long=3 warm-up), check up flag direction.
        let prev = null;
        for (let i = 2; i < r.length; i++) {
            if (r[i].value === null) continue;
            if (prev === null) {
                // first non-null AO has no prev → up defaults to true
                assert.strictEqual(r[i].up, true);
            } else {
                assert.strictEqual(r[i].up, r[i].value >= prev,
                    `up flag wrong at ${i}: AO=${r[i].value} prev=${prev}`);
            }
            prev = r[i].value;
        }
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([[2, 1], [3, 2], [4, 3], [5, 4]]);
        const r = calcAwesomeOscillator(candles, { shortLength: 2, longLength: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
