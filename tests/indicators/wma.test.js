// WMA indicator: warm-up nulls + hand-computed linear-weighted means.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcWMA } = require('../../src/chart/indicators/calc/wma.js');

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

function approxEq(actual, expected, eps = 1e-9) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

describe('calcWMA', () => {
    it('empty candle array → empty result', () => {
        assert.deepStrictEqual(calcWMA([], { length: 5 }), []);
    });

    it('length larger than candle count → every value null', () => {
        const out = calcWMA(makeCandles([1, 2, 3]), { length: 10 });
        assert.strictEqual(out.length, 3);
        for (const p of out) assert.strictEqual(p.value, null);
    });

    it('length=3 over [1,2,3,4,5,6] matches hand-computed WMA', () => {
        // denom = 3*4/2 = 6
        // i=2: closes [1,2,3], weights newest→oldest [3,2,1] → (3*3 + 2*2 + 1*1)/6 = 14/6
        // i=3: closes [2,3,4] → (3*4 + 2*3 + 1*2)/6 = 20/6
        // i=4: closes [3,4,5] → (3*5 + 2*4 + 1*3)/6 = 26/6
        // i=5: closes [4,5,6] → (3*6 + 2*5 + 1*4)/6 = 32/6
        const out = calcWMA(makeCandles([1, 2, 3, 4, 5, 6]), { length: 3 });
        assert.strictEqual(out.length, 6);
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        approxEq(out[2].value, 14 / 6);
        approxEq(out[3].value, 20 / 6);
        approxEq(out[4].value, 26 / 6);
        approxEq(out[5].value, 32 / 6);
    });

    it('length=4 over [10,20,30,40,50] matches hand-computed WMA', () => {
        // denom = 4*5/2 = 10
        // i=3: closes [10,20,30,40], weights [4,3,2,1] → (4*40 + 3*30 + 2*20 + 1*10)/10 = (160+90+40+10)/10 = 30
        // i=4: closes [20,30,40,50] → (4*50 + 3*40 + 2*30 + 1*20)/10 = (200+120+60+20)/10 = 40
        const out = calcWMA(makeCandles([10, 20, 30, 40, 50]), { length: 4 });
        for (let i = 0; i < 3; i++) assert.strictEqual(out[i].value, null);
        approxEq(out[3].value, 30);
        approxEq(out[4].value, 40);
    });

    it('time field passed through unchanged', () => {
        const candles = makeCandles([1, 2, 3, 4, 5]);
        const out = calcWMA(candles, { length: 2 });
        for (let i = 0; i < candles.length; i++) {
            assert.strictEqual(out[i].time, candles[i].time);
        }
    });

    it('default length=20 applies when params omitted', () => {
        const closes = [];
        for (let i = 1; i <= 20; i++) closes.push(i);
        const out = calcWMA(makeCandles(closes));
        for (let i = 0; i < 19; i++) assert.strictEqual(out[i].value, null);
        // denom = 20*21/2 = 210
        // Σ_{k=0..19} (20-k) * (20-k) (since closes[i-k] = i+1-k, with i=19 → 20-k)
        // = Σ_{w=1..20} w*w = 20*21*41/6 = 2870
        // WMA = 2870 / 210 = 13.6666...
        approxEq(out[19].value, 2870 / 210);
    });
});
