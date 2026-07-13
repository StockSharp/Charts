// MarketFacilitationIndex: (high - low) / volume per bar.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calcMarketFacilitationIndex } =
    require('../../src/chart/indicators/calc/mfi_market.js');

function approxEq(actual, expected, eps = 1e-12) {
    assert.ok(
        Math.abs(actual - expected) < eps,
        `expected ${expected}, got ${actual} (delta ${Math.abs(actual - expected)})`,
    );
}

function makeCandles(rows) {
    return rows.map((r, i) => ({
        time: `t${i}`,
        open: r.open ?? 0,
        high: r.high,
        low: r.low,
        close: r.close ?? r.high,
        volume: r.volume,
    }));
}

describe('calcMarketFacilitationIndex', () => {
    it('returns (high-low)/volume per bar from the first one', () => {
        const out = calcMarketFacilitationIndex(makeCandles([
            { high: 10, low: 6, volume: 2 },
            { high: 12, low: 8, volume: 4 },
            { high: 9, low: 5, volume: 8 },
        ]));
        assert.strictEqual(out.length, 3);
        approxEq(out[0].value, 2);     // (10-6)/2
        approxEq(out[1].value, 1);     // (12-8)/4
        approxEq(out[2].value, 0.5);   // (9-5)/8
    });

    it('zero volume → null for that bar (no division by zero)', () => {
        const out = calcMarketFacilitationIndex(makeCandles([
            { high: 10, low: 6, volume: 0 },
            { high: 12, low: 8, volume: 4 },
        ]));
        assert.strictEqual(out[0].value, null);
        approxEq(out[1].value, 1);
    });

    it('preserves candle.time on every point', () => {
        const candles = makeCandles([
            { high: 2, low: 1, volume: 1 },
            { high: 3, low: 1, volume: 2 },
        ]);
        const out = calcMarketFacilitationIndex(candles);
        assert.strictEqual(out[0].time, candles[0].time);
        assert.strictEqual(out[1].time, candles[1].time);
    });

    it('empty input → empty output', () => {
        assert.deepStrictEqual(calcMarketFacilitationIndex([]), []);
    });

    it('missing/NaN volume or price → null', () => {
        const out = calcMarketFacilitationIndex(makeCandles([
            { high: 10, low: 6, volume: undefined },
            { high: NaN, low: 5, volume: 2 },
            { high: 8, low: 4, volume: 4 },
        ]));
        assert.strictEqual(out[0].value, null);
        assert.strictEqual(out[1].value, null);
        approxEq(out[2].value, 1);
    });
});
