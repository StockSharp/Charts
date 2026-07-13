// MACD-with-signal (BaseComplexIndicator wrapper around MACD + EMA(signal)).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMovingAverageConvergenceDivergenceSignal } =
    require('../../src/chart/indicators/calc/macdsignal.js');
const { calcMACD } = require('../../src/chart/indicators/calc/macd.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcMovingAverageConvergenceDivergenceSignal', () => {
    it('exposes only { macd, signal } (no histogram)', () => {
        const r = calcMovingAverageConvergenceDivergenceSignal(makeCandles([1, 2, 3, 4, 5]),
            { longLength: 3, shortLength: 2, signalLength: 2 });
        assert.deepStrictEqual(Object.keys(r).sort(), ['macd', 'signal']);
    });

    it('matches calcMACD output (same math, narrower shape)', () => {
        const candles = makeCandles(
            Array.from({ length: 50 }, (_, i) => Math.sin(i / 3) * 5 + 100),
        );
        const wrapper = calcMovingAverageConvergenceDivergenceSignal(candles, {
            longLength: 26, shortLength: 12, signalLength: 9,
        });
        const raw = calcMACD(candles, { fastLength: 12, slowLength: 26, signalLength: 9 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(wrapper.macd[i].time, raw.macd[i].time);
            assert.strictEqual(wrapper.macd[i].value, raw.macd[i].value);
            assert.strictEqual(wrapper.signal[i].value, raw.signal[i].value);
        }
    });

    it('default parameters (26 / 12 / 9) match the .cs ctor', () => {
        const candles = makeCandles(
            Array.from({ length: 60 }, (_, i) => i + 1),
        );
        const def = calcMovingAverageConvergenceDivergenceSignal(candles);
        const expl = calcMovingAverageConvergenceDivergenceSignal(candles, {
            longLength: 26, shortLength: 12, signalLength: 9,
        });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(def.macd[i].value, expl.macd[i].value);
            assert.strictEqual(def.signal[i].value, expl.signal[i].value);
        }
    });

    it('empty input → empty macd & signal arrays', () => {
        const r = calcMovingAverageConvergenceDivergenceSignal([]);
        assert.deepStrictEqual(r, { macd: [], signal: [] });
    });

    it('series length == candles length, timestamps preserved', () => {
        const candles = makeCandles([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
        const r = calcMovingAverageConvergenceDivergenceSignal(candles, {
            longLength: 4, shortLength: 2, signalLength: 2,
        });
        assert.strictEqual(r.macd.length, candles.length);
        assert.strictEqual(r.signal.length, candles.length);
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(r.macd[i].time, candles[i].time);
            assert.strictEqual(r.signal[i].time, candles[i].time);
        }
    });
});
