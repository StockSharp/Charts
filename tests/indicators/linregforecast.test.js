// LinearRegressionForecast: warm-up, perfect-linear forecast invariant.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcLinearRegForecast } = require('../../src/chart/indicators/calc/linregforecast.js');

function makeCandles(closes) {
    return closes.map((c, i) => ({
        time: `t${i}`,
        open: c, high: c, low: c, close: c, volume: 0,
    }));
}

describe('calcLinearRegForecast', () => {
    it('empty candles → empty result', () => {
        assert.deepStrictEqual(calcLinearRegForecast([], { length: 14 }), []);
    });

    it('warm-up: first (length-1) values are null', () => {
        const out = calcLinearRegForecast(makeCandles([1, 2, 3, 4, 5]), { length: 3 });
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        assert.notStrictEqual(out[2].value, null);
    });

    it('perfect linear y = 2x + 5 → forecast = next y value', () => {
        // x=0..9 → closes[i] = 2i+5. For window ending at i (size L), x ranges
        // 0..L-1 over closes[i-L+1..i], so window x=k maps to true x=i-L+1+k.
        // The forecast at x=L corresponds to true x = i-L+1+L = i+1, so
        // forecast value should equal 2*(i+1)+5 = 2i+7.
        const closes = [];
        for (let i = 0; i < 10; i++) closes.push(2 * i + 5);
        const out = calcLinearRegForecast(makeCandles(closes), { length: 4 });
        for (let i = 3; i < 10; i++) {
            const expected = 2 * (i + 1) + 5;
            assert.ok(Math.abs(out[i].value - expected) < 1e-9,
                `i=${i}: got ${out[i].value}, expected ${expected}`);
        }
    });

    it('constant series → forecast equals the constant', () => {
        const out = calcLinearRegForecast(makeCandles([8, 8, 8, 8, 8, 8]), { length: 4 });
        for (let i = 3; i < 6; i++) {
            assert.ok(Math.abs(out[i].value - 8) < 1e-9);
        }
    });

    it('hand-computed length=3 over [1,3,2]: slope=0.5,b=1.5 → forecast=3.0', () => {
        // slope * Length + intercept = 0.5 * 3 + 1.5 = 3.0
        const out = calcLinearRegForecast(makeCandles([1, 3, 2]), { length: 3 });
        assert.ok(Math.abs(out[2].value - 3.0) < 1e-9);
    });

    it('length larger than candle count → all null', () => {
        const out = calcLinearRegForecast(makeCandles([1, 2, 3]), { length: 14 });
        assert.strictEqual(out.length, 3);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('time pass-through', () => {
        const candles = makeCandles([1, 2, 3, 4]);
        const out = calcLinearRegForecast(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });
});
