// NickRypockTrailingReverse tests.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcNickRypockTrailingReverse } = require('../../src/chart/indicators/calc/nrtr.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:0${i}:00Z`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcNickRypockTrailingReverse', () => {
    it('matches the explicit state-machine trace on length=2, multiple=100', () => {
        // multiple raw=100 ⇒ /1000 = 0.1.
        // Trace (verified by hand against the .cs):
        // i=0, p=10: k=10 → k'=(10+0)/2 *0.1... actually k=(k+(p-k)/L)*mult.
        //   Init: k=10, highP=10, lowP=10. k=(10+0/2)*0.1=1.
        //   trend=0: both branches.
        //   up: reverse=10-1=9, p(10)<=9? no → newTrend=+1.
        //   down: reverse=10+1=11, p(10)>=11? no → newTrend=-1.
        //   trend=-1. out=11.
        // i=1, p=11: k=(1+(11-1)/2)*0.1=0.6.
        //   trend=-1: only down branch. p<lowP(10)? no. reverse=10+0.6=10.6.
        //   p(11)>=10.6? yes → newTrend=+1, highP=11, reverse=11-0.6=10.4.
        //   trend=+1. out=10.4.
        // i=2, p=12: k=(0.6+(12-0.6)/2)*0.1=0.63.
        //   trend=+1: only up branch. p>highP(11)? yes → highP=12.
        //   reverse=12-0.63=11.37. p<=11.37? no → newTrend=+1. out=11.37.
        const out = calcNickRypockTrailingReverse(
            makeCandles([10, 11, 12]),
            { length: 2, multiple: 100 }
        );
        assert.strictEqual(out.length, 3);
        assert.ok(Math.abs(out[0].value - 11) < 1e-9);
        assert.ok(Math.abs(out[1].value - 10.4) < 1e-9);
        assert.ok(Math.abs(out[2].value - 11.37) < 1e-9);
    });

    it('clamps multiple ≤ 1 to 1 (per .cs setter)', () => {
        // multiple=0 → clamped to 1 → /1000 = 0.001.
        const out0 = calcNickRypockTrailingReverse(makeCandles([10, 10, 10]), { length: 2, multiple: 0 });
        const out1 = calcNickRypockTrailingReverse(makeCandles([10, 10, 10]), { length: 2, multiple: 1 });
        assert.deepStrictEqual(out0.map(p => p.value), out1.map(p => p.value));
    });

    it('emits a value for every candle (no warm-up null window)', () => {
        const out = calcNickRypockTrailingReverse(makeCandles([1, 2, 3, 4, 5]), { length: 3, multiple: 50 });
        // multiple=50 → clamped to 50/1000=0.05.
        for (const p of out) {
            assert.notStrictEqual(p.value, null);
            assert.ok(Number.isFinite(p.value));
        }
    });

    it('empty input → empty output', () => {
        assert.deepStrictEqual(
            calcNickRypockTrailingReverse([], { length: 5, multiple: 100 }),
            []
        );
    });

    it('preserves candle.time', () => {
        const candles = makeCandles([1, 2, 3, 4]);
        const out = calcNickRypockTrailingReverse(candles, { length: 2, multiple: 100 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });

    it('default params (length=50, multiple=100) run without error', () => {
        const closes = [];
        for (let i = 0; i < 60; i++) closes.push(100 + Math.sin(i / 5) * 5);
        const out = calcNickRypockTrailingReverse(makeCandles(closes));
        assert.strictEqual(out.length, 60);
        for (const p of out) assert.ok(Number.isFinite(p.value));
    });
});
