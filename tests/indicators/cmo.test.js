// Chande Momentum Oscillator: signed RSI-style oscillator on rolling
// sum of up vs down deltas.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcCMO } = require('../../src/chart/indicators/calc/cmo.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcCMO', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcCMO([], { length: 15 }), []);
    });

    it('length larger than candles → every value null', () => {
        const r = calcCMO(makeCandles([1, 2, 3]), { length: 15 });
        assert.strictEqual(r.length, 3);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('first (length) outputs are null; non-null lands at index = length', () => {
        const r = calcCMO(makeCandles([1, 2, 3, 4, 5, 6]), { length: 3 });
        for (let i = 0; i < 3; i++) assert.strictEqual(r[i].value, null);
        assert.notStrictEqual(r[3].value, null);
    });

    it('all-up monotonic series → CMO = +100 (sumDn = 0)', () => {
        const r = calcCMO(makeCandles([1, 2, 3, 4, 5, 6, 7]), { length: 3 });
        // Deltas all +1; for any window sumUp>0, sumDn=0 → 100*(s-0)/(s+0)=100.
        for (let i = 3; i < r.length; i++) approxEq(r[i].value, 100);
    });

    it('all-down monotonic series → CMO = -100 (sumUp = 0)', () => {
        const r = calcCMO(makeCandles([7, 6, 5, 4, 3, 2, 1]), { length: 3 });
        for (let i = 3; i < r.length; i++) approxEq(r[i].value, -100);
    });

    it('alternating equal moves → CMO oscillates around 0', () => {
        // closes = 1,2,1,2,1,2 ; deltas = +1,-1,+1,-1,+1
        // window length=2: at i=2 sumUp=1 sumDn=1 → 0
        const r = calcCMO(makeCandles([1, 2, 1, 2, 1, 2]), { length: 2 });
        for (let i = 2; i < r.length; i++) approxEq(r[i].value, 0);
    });

    it('hand-computed length=3 on [1,2,4,3,5]', () => {
        // deltas:           [+1, +2, -1, +2]
        // window @ i=3 (deltas 1..3) sumUp = 1+2+0 = 3, sumDn = 0+0+1 = 1
        //   → 100*(3-1)/(3+1) = 50
        // window @ i=4 (deltas 2..4) sumUp = 2+0+2 = 4, sumDn = 0+1+0 = 1
        //   → 100*(4-1)/(4+1) = 60
        const r = calcCMO(makeCandles([1, 2, 4, 3, 5]), { length: 3 });
        approxEq(r[3].value, 50);
        approxEq(r[4].value, 60);
    });

    it('zero total movement (flat closes inside window) → CMO = 0', () => {
        const r = calcCMO(makeCandles([5, 5, 5, 5, 5]), { length: 3 });
        for (let i = 3; i < r.length; i++) approxEq(r[i].value, 0);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const r = calcCMO(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) assert.strictEqual(r[i].time, candles[i].time);
    });
});
