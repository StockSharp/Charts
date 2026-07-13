// Mass Index indicator tests.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMassIndex } = require('../../src/chart/indicators/calc/massindex.js');

function makeCandlesHL(rangesAround) {
    // Build candles with deterministic high/low so range = highs[i]-lows[i].
    return rangesAround.map((r, i) => ({
        time: `2025-01-01T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
        open: 100,
        high: 100 + r,
        low: 100,
        close: 100,
        volume: 0,
    }));
}

describe('calcMassIndex', () => {
    it('returns null for indices before Sum is formed (defaults need 33 candles for index 32)', () => {
        // First non-null at index (emaLength-1) + (length-1) = 8 + 24 = 32.
        // With 32 candles (indices 0..31), all are null.
        const ranges = new Array(32).fill(1);
        const out = calcMassIndex(makeCandlesHL(ranges));
        assert.strictEqual(out.length, 32);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('on a constant range series, output converges asymptotically to `length`', () => {
        // Constant input ⇒ singleEma → range exactly; doubleEma exponentially
        // approaches range; ratio → 1; Sum → length. EMA converges
        // asymptotically (never exactly), so use a wide tolerance and many bars.
        const length = 25;
        const emaLength = 9;
        const firstFormed = (emaLength - 1) + (length - 1); // 32
        const ranges = new Array(firstFormed + 500).fill(2);
        const out = calcMassIndex(makeCandlesHL(ranges), { length, emaLength });
        for (let i = 0; i < firstFormed; i++) assert.strictEqual(out[i].value, null);
        // After a generous warm-up tail, the result should be within 0.01 of length.
        const final = out[out.length - 1].value;
        assert.ok(Math.abs(final - length) < 0.01, `final got ${final}`);
        // Output should be finite and monotonically approach `length` from below.
        assert.ok(final < length);
        assert.ok(final > length - 5);
    });

    it('respects custom emaLength=3, length=4 — null until index (emaLength-1)+(length-1)=5', () => {
        const length = 4;
        const emaLength = 3;
        const ranges = new Array(60).fill(5);
        const out = calcMassIndex(makeCandlesHL(ranges), { length, emaLength });
        const firstFormed = (emaLength - 1) + (length - 1); // 5
        for (let i = 0; i < firstFormed; i++) assert.strictEqual(out[i].value, null, `index ${i}`);
        // Tail converges to length (smaller emaLength ⇒ faster convergence).
        const final = out[out.length - 1].value;
        assert.ok(Math.abs(final - length) < 1e-6, `final got ${final}`);
    });

    it('empty input → empty output', () => {
        assert.deepStrictEqual(calcMassIndex([], {}), []);
    });

    it('preserves candle.time field', () => {
        const candles = makeCandlesHL(new Array(5).fill(1));
        const out = calcMassIndex(candles);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
