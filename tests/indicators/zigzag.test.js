// ZigZag: warm-up nulls, hand-traced pivot pattern. Output is dense
// (length = candles.length); non-pivot bars carry `value: null`.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcZigZag } = require('../../src/chart/indicators/calc/zigzag.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: c,
        high: c,
        low: c,
        close: c,
        volume: 0,
    }));
}

describe('calcZigZag', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcZigZag([], { deviation: 0.05 }), []);
    });

    it('all bars non-pivot → every value null', () => {
        const out = calcZigZag(makeCandles([100, 100.1, 100.2, 100.15, 100.1, 100.05]), {
            deviation: 0.05,
        });
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('invalid deviation (≤0 or ≥1) → every value null', () => {
        const c = makeCandles([1, 2, 3, 4, 5, 4, 3, 2, 1]);
        const a = calcZigZag(c, { deviation: 0 });
        const b = calcZigZag(c, { deviation: 1 });
        for (const p of a) assert.strictEqual(p.value, null);
        for (const p of b) assert.strictEqual(p.value, null);
    });

    it('hand-traced peak+trough pattern at 10% deviation', () => {
        const closes = [10, 11, 12, 13, 12, 11, 10, 9, 8, 7, 8, 9, 10, 11, 12];
        const out = calcZigZag(makeCandles(closes), { deviation: 0.10 });
        assert.strictEqual(out.length, closes.length);
        for (let i = 0; i < closes.length; i++) {
            if (i === 5) {
                assert.strictEqual(out[i].value, 13);
                assert.strictEqual(out[i].shift, 3);
                assert.strictEqual(out[i].isUp, true);
            } else if (i === 10) {
                assert.strictEqual(out[i].value, 7);
                assert.strictEqual(out[i].shift, 5);
                assert.strictEqual(out[i].isUp, false);
            } else {
                assert.strictEqual(out[i].value, null);
            }
        }
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([10, 11, 12, 13, 12, 11, 10, 9, 8, 7]);
        const out = calcZigZag(candles, { deviation: 0.10 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
