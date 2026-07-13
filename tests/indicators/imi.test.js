// Intraday Momentum Index: RSI-style on (open, close) pairs.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcIntradayMomentumIndex } = require('../../src/chart/indicators/calc/imi.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function mk(o, cl, i) {
    return { time: `t${i}`, open: o, high: Math.max(o, cl), low: Math.min(o, cl), close: cl, volume: 1 };
}

describe('calcIntradayMomentumIndex', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcIntradayMomentumIndex([], {}), []);
    });

    it('warm-up: length-1 leading nulls', () => {
        const candles = [];
        for (let i = 0; i < 14; i++) candles.push(mk(1, 2, i));
        const r = calcIntradayMomentumIndex(candles, { length: 14 });
        for (let i = 0; i < 13; i++) assert.strictEqual(r[i].value, null);
        assert.notStrictEqual(r[13].value, null);
    });

    it('all-up bars → 100; all-down bars → 0', () => {
        const up = [];
        const dn = [];
        for (let i = 0; i < 14; i++) { up.push(mk(1, 2, i)); dn.push(mk(2, 1, i)); }
        const ru = calcIntradayMomentumIndex(up, { length: 14 });
        const rd = calcIntradayMomentumIndex(dn, { length: 14 });
        approxEq(ru[13].value, 100);
        approxEq(rd[13].value, 0);
    });

    it('all bars open == close → denom is 0 → output is 0 (not null)', () => {
        const candles = [];
        for (let i = 0; i < 5; i++) candles.push(mk(5, 5, i));
        const r = calcIntradayMomentumIndex(candles, { length: 5 });
        approxEq(r[4].value, 0);
    });

    it('hand-computed reference: length=3 with [(1,2),(3,2),(2,4)]', () => {
        // upMove   = [1, 0, 2]
        // downMove = [0, 1, 0]
        // sumUp=3, sumDown=1, denom=4 → 100*3/4 = 75
        const candles = [mk(1, 2, 0), mk(3, 2, 1), mk(2, 4, 2)];
        const r = calcIntradayMomentumIndex(candles, { length: 3 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        approxEq(r[2].value, 75);
    });

    it('output length matches input length; timestamps pass through', () => {
        const candles = [];
        for (let i = 0; i < 10; i++) candles.push(mk(1, 1 + (i % 3) - 1, i));
        const r = calcIntradayMomentumIndex(candles, { length: 4 });
        assert.strictEqual(r.length, 10);
        for (let i = 0; i < 10; i++) assert.strictEqual(r[i].time, candles[i].time);
    });
});
