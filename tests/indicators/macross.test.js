// MovingAverageCrossover: fast SMA vs slow SMA, sign signal { -1, 0, +1 }.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMovingAverageCrossover } =
    require('../../src/chart/indicators/calc/macross.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcMovingAverageCrossover', () => {
    it('signal null until both MAs are formed; once formed emits ±1/0', () => {
        // shortPeriod=2, longPeriod=4 → signal forms at index 3.
        // closes [1,2,3,4,5,6]:
        //  fast(2): _, 1.5, 2.5, 3.5, 4.5, 5.5
        //  slow(4): _,_,_, 2.5, 3.5, 4.5
        //  signal: _, _, _, +1, +1, +1   (fast > slow each formed step)
        const r = calcMovingAverageCrossover(makeCandles([1, 2, 3, 4, 5, 6]),
            { shortPeriod: 2, longPeriod: 4 });
        assert.strictEqual(r.fast.length, 6);
        assert.strictEqual(r.slow.length, 6);
        assert.strictEqual(r.signal.length, 6);
        assert.strictEqual(r.signal[0].value, null);
        assert.strictEqual(r.signal[1].value, null);
        assert.strictEqual(r.signal[2].value, null);
        assert.strictEqual(r.signal[3].value, 1);
        assert.strictEqual(r.signal[4].value, 1);
        assert.strictEqual(r.signal[5].value, 1);
    });

    it('emits 0 when fast == slow (constant series)', () => {
        const r = calcMovingAverageCrossover(makeCandles([5, 5, 5, 5, 5, 5]),
            { shortPeriod: 2, longPeriod: 4 });
        // From index 3 onward both MAs equal 5 → signal 0.
        for (let i = 3; i < 6; i++) assert.strictEqual(r.signal[i].value, 0);
    });

    it('emits -1 when fast < slow (downtrend)', () => {
        const r = calcMovingAverageCrossover(makeCandles([6, 5, 4, 3, 2, 1]),
            { shortPeriod: 2, longPeriod: 4 });
        // From index 3 onward fast < slow → signal -1.
        for (let i = 3; i < 6; i++) assert.strictEqual(r.signal[i].value, -1);
    });

    it('default periods (25 / 50) yield empty signal for short series', () => {
        const r = calcMovingAverageCrossover(makeCandles([1, 2, 3, 4, 5]));
        for (const p of r.signal) assert.strictEqual(p.value, null);
    });

    it('empty input → empty fast/slow/signal arrays', () => {
        const r = calcMovingAverageCrossover([]);
        assert.deepStrictEqual(r, { fast: [], slow: [], signal: [] });
    });

    it('fast & slow MAs are emitted alongside the signal with same length and timestamps', () => {
        const candles = makeCandles([10, 11, 12, 13, 14, 15]);
        const r = calcMovingAverageCrossover(candles, { shortPeriod: 2, longPeriod: 3 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.fast[i].time, candles[i].time);
            assert.strictEqual(r.slow[i].time, candles[i].time);
            assert.strictEqual(r.signal[i].time, candles[i].time);
        }
        // Fast is SMA(2): 10.5, 11.5, 12.5, 13.5, 14.5 starting at index 1.
        assert.strictEqual(r.fast[0].value, null);
        assert.strictEqual(r.fast[1].value, 10.5);
        // Slow is SMA(3): 11, 12, 13, 14 starting at index 2.
        assert.strictEqual(r.slow[1].value, null);
        assert.strictEqual(r.slow[2].value, 11);
    });
});
