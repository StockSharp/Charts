// MovingAverageRibbon: N SMAs at lengths spaced linearly from short..long.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMovingAverageRibbon } =
    require('../../src/chart/indicators/calc/maribbon.js');
const { calcSMA } = require('../../src/chart/indicators/calc/sma.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcMovingAverageRibbon', () => {
    it('defaults (10/100/10) produce lengths [10,20,30,40,50,60,70,80,90,100]', () => {
        const r = calcMovingAverageRibbon([]);
        assert.deepStrictEqual(r.lengths, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
        assert.strictEqual(r.averages.length, 10);
    });

    it('step uses C# integer division (truncated)', () => {
        // (99-10)/9 = 9 (int) → 10,19,28,37,46,55,64,73,82,91
        const r = calcMovingAverageRibbon([], {
            shortPeriod: 10, longPeriod: 99, ribbonCount: 10,
        });
        assert.deepStrictEqual(r.lengths, [10, 19, 28, 37, 46, 55, 64, 73, 82, 91]);
    });

    it('throws on invalid ribbonCount < 2 or periods < 1', () => {
        assert.throws(() => calcMovingAverageRibbon([], { ribbonCount: 1 }));
        assert.throws(() => calcMovingAverageRibbon([], { shortPeriod: 0 }));
        assert.throws(() => calcMovingAverageRibbon([], { longPeriod: 0 }));
    });

    it('each ribbon series equals the standalone SMA of that length', () => {
        const candles = makeCandles(Array.from({ length: 30 }, (_, i) => i + 1));
        const r = calcMovingAverageRibbon(candles, {
            shortPeriod: 3, longPeriod: 9, ribbonCount: 4,
        });
        // step=(9-3)/3=2 → lengths [3,5,7,9]
        assert.deepStrictEqual(r.lengths, [3, 5, 7, 9]);
        for (let s = 0; s < r.lengths.length; s++) {
            const ref = calcSMA(candles, { length: r.lengths[s] });
            for (let i = 0; i < candles.length; i++) {
                assert.strictEqual(r.averages[s][i].value, ref[i].value);
                assert.strictEqual(r.averages[s][i].time, candles[i].time);
            }
        }
    });

    it('empty candles → empty per-line arrays but lengths still computed', () => {
        const r = calcMovingAverageRibbon([], { shortPeriod: 2, longPeriod: 6, ribbonCount: 3 });
        // step=(6-2)/2=2 → [2,4,6]
        assert.deepStrictEqual(r.lengths, [2, 4, 6]);
        for (const s of r.averages) assert.deepStrictEqual(s, []);
    });

    it('first non-null appears at index (length - 1) for each ribbon line', () => {
        const candles = makeCandles(Array.from({ length: 25 }, (_, i) => i + 1));
        const r = calcMovingAverageRibbon(candles, {
            shortPeriod: 3, longPeriod: 9, ribbonCount: 4,
        });
        for (let s = 0; s < r.lengths.length; s++) {
            const L = r.lengths[s];
            if (L - 2 >= 0) assert.strictEqual(r.averages[s][L - 2].value, null);
            assert.notStrictEqual(r.averages[s][L - 1].value, null);
        }
    });
});
