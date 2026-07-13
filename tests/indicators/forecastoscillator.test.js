// Forecast Oscillator (FOSC): ((close - LinearReg-forecast) / close) * 100.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcForecastOscillator } = require('../../src/chart/indicators/calc/forecastoscillator.js');

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcForecastOscillator', () => {
    it('empty candles → empty array', () => {
        assert.deepStrictEqual(calcForecastOscillator([], { length: 14 }), []);
    });

    it('length larger than data → every value null', () => {
        const candles = [];
        for (let i = 0; i < 5; i++) {
            candles.push({ time: `t${i}`, open: 1, high: 1, low: 1, close: 1 + i, volume: 0 });
        }
        const r = calcForecastOscillator(candles, { length: 14 });
        assert.strictEqual(r.length, 5);
        for (const p of r) assert.strictEqual(p.value, null);
    });

    it('perfectly linear closes: forecast == close ⇒ FOSC == 0 after warm-up', () => {
        // y = 10, 11, 12, 13, 14, 15 — linear in x. LinearReg endpoint at
        // index L-1 should equal y[L-1] exactly, so FOSC == 0.
        const closes = [10, 11, 12, 13, 14, 15];
        const candles = closes.map((c, i) => ({
            time: `t${i}`, open: c, high: c, low: c, close: c, volume: 0,
        }));
        const r = calcForecastOscillator(candles, { length: 4 });
        for (let i = 0; i < 3; i++) assert.strictEqual(r[i].value, null);
        for (let i = 3; i < closes.length; i++) approxEq(r[i].value, 0);
    });

    it('length=2 reference vector: forecast = last close → FOSC == 0', () => {
        // With length=2, two-point regression goes exactly through both
        // points and the endpoint equals close[i].
        const candles = [
            { time: 't0', open: 5, high: 5, low: 5, close: 5,  volume: 0 },
            { time: 't1', open: 7, high: 7, low: 7, close: 7,  volume: 0 },
            { time: 't2', open: 9, high: 9, low: 9, close: 11, volume: 0 },
        ];
        const r = calcForecastOscillator(candles, { length: 2 });
        assert.strictEqual(r[0].value, null);
        approxEq(r[1].value, 0);
        approxEq(r[2].value, 0);
    });

    it('non-linear closes: hand-computed FOSC at one point', () => {
        // closes window of length 3: y = [3, 7, 4].
        // x = 0,1,2. sumX=3, sumY=14, sumXy = 0+7+8=15, sumX2 = 0+1+4=5.
        // divisor = 3*5 - 9 = 6.
        // slope = (3*15 - 3*14)/6 = (45-42)/6 = 0.5
        // b = (14 - 0.5*3)/3 = 12.5/3 ≈ 4.16667
        // forecast(x=2) = 0.5*2 + 4.16667 = 5.16667
        // FOSC = (4 - 5.16667)/4 * 100 = -29.1667
        const candles = [
            { time: 't0', open: 3, high: 3, low: 3, close: 3, volume: 0 },
            { time: 't1', open: 7, high: 7, low: 7, close: 7, volume: 0 },
            { time: 't2', open: 4, high: 4, low: 4, close: 4, volume: 0 },
        ];
        const r = calcForecastOscillator(candles, { length: 3 });
        assert.strictEqual(r[0].value, null);
        assert.strictEqual(r[1].value, null);
        approxEq(r[2].value, ((4 - (0.5 * 2 + 12.5 / 3)) / 4) * 100, 1e-9);
    });

    it('time field passed through unchanged', () => {
        const candles = [
            { time: 'a', open: 1, high: 1, low: 1, close: 1, volume: 0 },
            { time: 'b', open: 2, high: 2, low: 2, close: 2, volume: 0 },
            { time: 'c', open: 3, high: 3, low: 3, close: 3, volume: 0 },
        ];
        const r = calcForecastOscillator(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r[i].time, candles[i].time);
        }
    });
});
