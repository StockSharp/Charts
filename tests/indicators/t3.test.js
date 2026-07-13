// T3 Moving Average: 6-stage EMA cascade weighted by VolumeFactor.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcT3 } = require('../../src/chart/indicators/calc/t3.js');

function mk(close, i) {
    return { time: `t${i}`, open: close, high: close, low: close, close, volume: 1 };
}

describe('calcT3', () => {
    it('empty candles → empty', () => {
        assert.deepStrictEqual(calcT3([], {}), []);
    });

    it('all bars null until EMA chain + 10-bar settling forms', () => {
        // length=2 → C# EMA emits partial Buffer.Sum/Length from bar 0,
        // so each cascade level produces non-null from bar 0 and IsFormed
        // at bar length-1=1. All six EMAs form simultaneously at bar 1.
        // The outer indicator then waits the 10-bar `_defaultWarmUpPeriod`
        // (decrementing on bars 1..10), so first emitted bar is bar 11.
        const closes = Array.from({ length: 18 }, (_, i) => 100 + i);
        const r = calcT3(closes.map(mk), { length: 2, volumeFactor: 0.7 });
        for (let i = 0; i < 11; i++) {
            assert.strictEqual(r[i].value, null, `bar ${i} should be null, got ${r[i].value}`);
        }
        assert.notStrictEqual(r[11].value, null);
    });

    it('flat data → T3 equals constant (after warm-up)', () => {
        const c = Array.from({ length: 50 }, (_, i) => mk(100, i));
        const r = calcT3(c, { length: 2, volumeFactor: 0.7 });
        // c1+c2+c3+c4 should equal 1 by construction. With C# partial-seed
        // EMA semantics each cascade level introduces a transient that
        // damps with time, so the full converge takes a few extra bars
        // beyond the 10-bar settling counter — by bar 30 we're well below
        // 1e-9 of 100.
        for (let i = 30; i < 50; i++) {
            assert.ok(Math.abs(r[i].value - 100) < 1e-9, `bar ${i}: got ${r[i].value}`);
        }
    });

    it('invalid volumeFactor (≤0 or ≥1) → all null', () => {
        const c = Array.from({ length: 30 }, (_, i) => mk(100 + i, i));
        for (const bad of [0, -0.1, 1, 1.5]) {
            const r = calcT3(c, { length: 2, volumeFactor: bad });
            for (const p of r) assert.strictEqual(p.value, null);
        }
    });

    it('output length equals input length', () => {
        const c = Array.from({ length: 25 }, (_, i) => mk(100 + i, i));
        const r = calcT3(c, { length: 2, volumeFactor: 0.7 });
        assert.strictEqual(r.length, 25);
    });

    it('time field passed through', () => {
        const c = Array.from({ length: 20 }, (_, i) => mk(100 + i, i));
        const r = calcT3(c, { length: 2, volumeFactor: 0.7 });
        for (let i = 0; i < 20; i++) assert.strictEqual(r[i].time, c[i].time);
    });
});
