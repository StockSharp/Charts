// Bill Williams Fractals: empty input, no-pivot edge cases, hand-crafted
// peak + trough.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcFractals } = require('../../src/chart/indicators/calc/fractals.js');

function makeCandles(rows) {
    // rows: [high, low]
    return rows.map(([h, l], i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: (h + l) / 2,
        high: h,
        low: l,
        close: (h + l) / 2,
        volume: 0,
    }));
}

describe('calcFractals', () => {
    it('empty candles → empty up/down series', () => {
        assert.deepStrictEqual(calcFractals([], {}), { up: [], down: [] });
    });

    it('candle count < length → every up/down value null', () => {
        const c = makeCandles([[2, 1], [3, 2], [4, 3]]);
        const r = calcFractals(c, { length: 5 });
        assert.strictEqual(r.up.length, 3);
        assert.strictEqual(r.down.length, 3);
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(r.up[i].value, null);
            assert.strictEqual(r.down[i].value, null);
        }
    });

    it('rejects length ≤ 2 or even length (.cs throws — we return all-null)', () => {
        const c = makeCandles([[2, 1], [3, 2], [4, 3], [3, 2], [2, 1]]);
        for (const bad of [1, 2, 4, 6]) {
            const r = calcFractals(c, { length: bad });
            for (const p of r.up) assert.strictEqual(p.value, null);
            for (const p of r.down) assert.strictEqual(p.value, null);
        }
    });

    it('hand-crafted single up-fractal and single down-fractal at length=5', () => {
        // bars 0..8.
        //   Highs: [1, 2, 5, 3, 1, 0, 1, 0, 1]
        //     Up-window highs[0..4] = [1,2,5,3,1] → strict up-then-down
        //       around index 2 → UP fractal confirmed at i=4, value=5,
        //       shift=2. After that, upCounter resets and never re-reaches
        //       length within 8 bars, so no second up-fractal fires.
        //   Lows:  [3, 2, 1, 2, 0, -1, -3, -1, 0]
        //     Down-window lows[4..8] = [0,-1,-3,-1,0] → strict down-then-up
        //       around index 6 → DOWN fractal confirmed at i=8, value=-3,
        //       shift=2. Earlier down-windows fail the strict pattern.
        const candles = makeCandles([
            [1, 3], [2, 2], [5, 1], [3, 2], [1, 0],
            [0, -1], [1, -3], [0, -1], [1, 0],
        ]);
        const r = calcFractals(candles, { length: 5 });
        assert.strictEqual(r.up.length, 9);
        assert.strictEqual(r.down.length, 9);

        for (let i = 0; i < 9; i++) {
            if (i === 4) {
                assert.strictEqual(r.up[i].value, 5);
                assert.strictEqual(r.up[i].shift, 2);
            } else {
                assert.strictEqual(r.up[i].value, null);
            }
            if (i === 8) {
                assert.strictEqual(r.down[i].value, -3);
                assert.strictEqual(r.down[i].shift, 2);
            } else {
                assert.strictEqual(r.down[i].value, null);
            }
        }
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([
            [2, 1], [3, 2], [4, 3], [3, 2], [2, 1],
        ]);
        const r = calcFractals(candles, { length: 5 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.up[i].time, candles[i].time);
            assert.strictEqual(r.down[i].time, candles[i].time);
        }
    });
});
