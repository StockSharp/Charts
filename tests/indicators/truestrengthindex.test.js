// TSI: double-smoothed momentum oscillator.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcTrueStrengthIndex } = require('../../src/chart/indicators/calc/truestrengthindex.js');

function mk(close, i) {
    return { time: `t${i}`, open: close, high: close, low: close, close, volume: 1 };
}

describe('calcTrueStrengthIndex', () => {
    it('empty candles → both series empty', () => {
        assert.deepStrictEqual(calcTrueStrengthIndex([], {}), { tsi: [], signal: [] });
    });

    it('warm-up bars are null on both series', () => {
        // The dumped lines are gated on their inner IsFormed flags. The Tsi
        // Line forms once its double-smoothing EMAs (fed from bar 1) have
        // secondLength inputs → bar secondLength=3. The Signal EMA is fed the
        // tsi only from that bar (Sequence-mode gate) and forms signalLength
        // bars later → bar secondLength + signalLength - 1 = 4.
        const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
        const r = calcTrueStrengthIndex(closes.map(mk), { firstLength: 3, secondLength: 3, signalLength: 2 });
        for (let i = 0; i < 3; i++) assert.strictEqual(r.tsi[i].value, null, `tsi[${i}]`);
        let firstNonNull = -1;
        for (let i = 0; i < 20; i++) if (r.tsi[i].value !== null) { firstNonNull = i; break; }
        assert.strictEqual(firstNonNull, 3);
        // signal lags TSI: fed tsi from bar 3, forms at bar 3 + 2 - 1 = 4.
        let firstSignal = -1;
        for (let i = 0; i < 20; i++) if (r.signal[i].value !== null) { firstSignal = i; break; }
        assert.strictEqual(firstSignal, 4);
    });

    it('monotonic increasing closes → TSI converges to +100', () => {
        const closes = Array.from({ length: 100 }, (_, i) => 100 + i);
        const r = calcTrueStrengthIndex(closes.map(mk), { firstLength: 5, secondLength: 5, signalLength: 3 });
        // After plenty of warmup, TSI should be very close to 100.
        assert.ok(Math.abs(r.tsi[99].value - 100) < 1e-3, `got ${r.tsi[99].value}`);
    });

    it('monotonic decreasing closes → TSI converges to -100', () => {
        const closes = Array.from({ length: 100 }, (_, i) => 200 - i);
        const r = calcTrueStrengthIndex(closes.map(mk), { firstLength: 5, secondLength: 5, signalLength: 3 });
        assert.ok(Math.abs(r.tsi[99].value + 100) < 1e-3, `got ${r.tsi[99].value}`);
    });

    it('both series have same length as input', () => {
        const closes = Array.from({ length: 50 }, (_, i) => 100 + (i % 3));
        const r = calcTrueStrengthIndex(closes.map(mk), { firstLength: 5, secondLength: 5, signalLength: 3 });
        assert.strictEqual(r.tsi.length, 50);
        assert.strictEqual(r.signal.length, 50);
    });

    it('time field passed through on both series', () => {
        const closes = Array.from({ length: 5 }, (_, i) => 100 + i);
        const r = calcTrueStrengthIndex(closes.map(mk), { firstLength: 2, secondLength: 2, signalLength: 2 });
        for (let i = 0; i < 5; i++) {
            assert.strictEqual(r.tsi[i].time, `t${i}`);
            assert.strictEqual(r.signal[i].time, `t${i}`);
        }
    });
});
