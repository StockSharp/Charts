// Jurik Moving Average: two-stage cascade with hidden state. The reference
// vector below is a REGRESSION LOCK-IN (verified against StockSharp .cs
// behaviour once); do NOT try to re-derive these numbers from first
// principles or third-party Jurik docs — the .cs is a simplified variant.
//
// JMA is a DecimalLengthIndicator: not formed until `length` warm-up bars are
// consumed, so the first length-1 outputs are null; the last warm-up bar (index
// length-1) emits its close, then the recurrence runs from index length.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcJurikMovingAverage } = require('../../src/chart/indicators/calc/jma.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function mk(c, i) {
    return { time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0 };
}

describe('calcJurikMovingAverage', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcJurikMovingAverage([], {}), []);
    });

    it('warm-up: first length-1 outputs null, then close, then recurrence', () => {
        const closes = [5, 7, 11, 13, 17, 19, 23, 29];
        const candles = closes.map(mk);
        const r = calcJurikMovingAverage(candles, { length: 4, phase: 0 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        assert.strictEqual(r[2].value, null);
        approxEq(r[3].value, closes[3]); // last warm-up bar emits its close (13)
        // From bar 4 onward the recurrence kicks in — value differs from close.
        assert.notStrictEqual(r[4].value, 17);
    });

    it('regression lock-in: length=5, phase=0 over a known 20-bar ramp+dip+ramp', () => {
        // Reference vector verified against the StockSharp .cs runtime. length=5,
        // so indices 0..3 are warm-up null; index 4 is the latched close (14),
        // and the recurrence values from index 5 on are unchanged by the gate.
        const closes = [10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
        const expected = [
            10,
            11,
            12,
            13,
            14,
            14.33656509695291,
            14.242090683773142,
            13.825035872959845,
            13.18782427520063,
            12.408226142050566,
            11.539732704872998,
            11.29023771093264,
            11.492568032318847,
            11.999036235977556,
            12.700490211744007,
            13.522943647825393,
            14.418752257615647,
            15.358258983688108,
            16.323443734182593,
            17.30355324271627,
        ];
        const candles = closes.map(mk);
        const r = calcJurikMovingAverage(candles, { length: 5, phase: 0 });
        assert.strictEqual(r.length, expected.length);
        for (let i = 0; i < expected.length; i++) {
            if (i < 4) assert.strictEqual(r[i].value, null);
            else approxEq(r[i].value, expected[i], 1e-9);
        }
    });

    it('flat input → output stays at the constant (after warm-up)', () => {
        const candles = [];
        for (let i = 0; i < 30; i++) candles.push(mk(42, i));
        const r = calcJurikMovingAverage(candles, { length: 10, phase: 0 });
        for (let i = 0; i < 9; i++) assert.strictEqual(r[i].value, null);
        for (let i = 9; i < 30; i++) approxEq(r[i].value, 42, 1e-12);
    });

    it('phase out of [-100, 100] is clamped (does not throw)', () => {
        const candles = [mk(1, 0), mk(2, 1), mk(3, 2)];
        const r1 = calcJurikMovingAverage(candles, { length: 2, phase: 500 });
        const r2 = calcJurikMovingAverage(candles, { length: 2, phase: -500 });
        for (const p of r1) assert.ok(p.value === null || Number.isFinite(p.value));
        for (const p of r2) assert.ok(p.value === null || Number.isFinite(p.value));
    });

    it('output length matches input length and timestamps pass through', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) candles.push(mk(i + 1, i));
        const r = calcJurikMovingAverage(candles, { length: 5 });
        assert.strictEqual(r.length, 10);
        for (let i = 0; i < 10; i++) assert.strictEqual(r[i].time, candles[i].time);
    });
});
