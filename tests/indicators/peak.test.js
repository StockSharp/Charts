// Peak: ZigZag's up-pivots only, using candle HIGH as the price feed.
// Output is dense (length = candles.length); non-peak bars carry
// `value: null`.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcPeak } = require('../../src/chart/indicators/calc/peak.js');

function makeCandles(highs) {
    return highs.map((h, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: h,
        high: h,
        low: h,
        close: h,
        volume: 0,
    }));
}

describe('calcPeak', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcPeak([], { deviation: 0.05 }), []);
    });

    it('no swings beyond deviation → every value null', () => {
        const out = calcPeak(makeCandles([100, 100.1, 100.2, 100.15, 100.1, 100.05]), {
            deviation: 0.05,
        });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('invalid deviation (≤0 or ≥1) → every value null', () => {
        const c = makeCandles([1, 2, 3, 4, 5, 4, 3, 2, 1]);
        for (const bad of [0, -0.1, 1, 1.5]) {
            const r = calcPeak(c, { deviation: bad });
            for (const p of r) assert.strictEqual(p.value, null);
        }
    });

    it('up-pivot is emitted, down-pivot is suppressed', () => {
        // Same trace as the ZigZag hand-traced test, but indexed by HIGH
        // (we use flat candles so high == close). At 10% deviation:
        //   i=5  → up-pivot confirmed at value=13, shift=3
        //   i=10 → down-pivot confirmed at value=7   → SUPPRESSED
        const highs = [10, 11, 12, 13, 12, 11, 10, 9, 8, 7, 8, 9, 10, 11, 12];
        const out = calcPeak(makeCandles(highs), { deviation: 0.10 });
        assert.strictEqual(out.length, highs.length);
        for (let i = 0; i < highs.length; i++) {
            if (i === 5) {
                assert.strictEqual(out[i].value, 13);
                assert.strictEqual(out[i].shift, 3);
            } else {
                assert.strictEqual(out[i].value, null);
            }
        }
    });

    it('peak uses candle.high (not close) as the price feed', () => {
        const candles = [];
        const highs = [50, 60, 55, 48, 50, 51, 52];
        for (let i = 0; i < highs.length; i++) {
            candles.push({
                time: `t${i}`,
                open: 50, high: highs[i], low: 49, close: 50, volume: 0,
            });
        }
        const r = calcPeak(candles, { deviation: 0.10 });
        // 60 → 48: drop is 12/60 = 20% — over 10%, fires at i=3.
        assert.strictEqual(r[3].value, 60);
        let count = 0;
        for (const p of r) if (p.value !== null) count++;
        assert.strictEqual(count, 1);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([10, 11, 12, 13, 12, 11, 10]);
        const out = calcPeak(candles, { deviation: 0.10 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
