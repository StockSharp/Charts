// CCI indicator: warm-up nulls, hand-computed reference, flat-window fallback.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcCCI } = require('../../src/chart/indicators/calc/cci.js');

function makeCandles(rows) {
    // rows: [high, low, close]
    return rows.map((row, i) => ({
        time: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
        open: row[2],
        high: row[0],
        low: row[1],
        close: row[2],
        volume: 0,
    }));
}

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcCCI', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcCCI([], { length: 20 }), []);
    });

    it('length larger than candle count → every value null', () => {
        const out = calcCCI(
            makeCandles([[2, 1, 1.5], [3, 2, 2.5], [4, 3, 3.5]]),
            { length: 10 },
        );
        assert.strictEqual(out.length, 3);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('length=3 over a known series matches hand-computed CCI', () => {
        // typical = (H+L+C)/3
        // i=0: (3+1+2)/3 = 2
        // i=1: (4+2+3)/3 = 3
        // i=2: (5+3+4)/3 = 4
        // i=3: (8+6+7)/3 = 7
        // i=4: (7+5+6)/3 = 6
        //
        // i=2: smaTP=mean(2,3,4)=3, devs=|2-3|+|3-3|+|4-3|=2, meanDev=2/3
        //      CCI = (4 - 3) / (0.015 * 2/3) = 1 / 0.01 = 100
        // i=3: smaTP=mean(3,4,7)=14/3, devs=|3-14/3|+|4-14/3|+|7-14/3|
        //      = 5/3 + 2/3 + 7/3 = 14/3, meanDev=14/9
        //      CCI = (7 - 14/3) / (0.015 * 14/9) = (7/3) / (0.015 * 14/9)
        //          = (7/3) * 9 / (0.015 * 14) = 21 / 0.21 = 100
        // i=4: smaTP=mean(4,7,6)=17/3, devs=|4-17/3|+|7-17/3|+|6-17/3|
        //      = 5/3 + 4/3 + 1/3 = 10/3, meanDev=10/9
        //      CCI = (6 - 17/3) / (0.015 * 10/9) = (1/3) / (0.015 * 10/9)
        //          = (1/3) * 9 / (0.015 * 10) = 3 / 0.15 = 20
        const rows = [
            [3, 1, 2],
            [4, 2, 3],
            [5, 3, 4],
            [8, 6, 7],
            [7, 5, 6],
        ];
        const out = calcCCI(makeCandles(rows), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        approxEq(out[2].value, 100, 1e-7);
        approxEq(out[3].value, 100, 1e-7);
        approxEq(out[4].value, 20, 1e-7);
    });

    it('flat typical-price window → CCI=0 (zero-meanDeviation fallback)', () => {
        const out = calcCCI(
            makeCandles([[5, 5, 5], [5, 5, 5], [5, 5, 5]]),
            { length: 3 },
        );
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.strictEqual(out[2].value, 0);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([[2, 1, 1.5], [3, 2, 2.5], [4, 3, 3.5], [5, 4, 4.5]]);
        const out = calcCCI(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
