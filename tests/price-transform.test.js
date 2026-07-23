const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    InternalPriceScaleMode,
    isRelativePriceScale,
    priceToScale,
    scaleToPrice,
} = require('../src/core/scale/price-transform.js');

describe('price scale transforms', () => {
    it('round-trips normal, logarithmic, percentage and indexed values', () => {
        const cases = [
            [InternalPriceScaleMode.Normal, 125, 100],
            [InternalPriceScaleMode.Logarithmic, 125, 100],
            [InternalPriceScaleMode.Percentage, 125, 100],
            [InternalPriceScaleMode.IndexedTo100, 125, 100],
        ];
        for (const [mode, price, base] of cases) {
            const scaled = priceToScale(price, mode, base);
            assert.ok(Number.isFinite(scaled));
            assert.ok(Math.abs(scaleToPrice(scaled, mode, base) - price) < 1e-10);
        }
        assert.equal(priceToScale(125, InternalPriceScaleMode.Percentage, 100), 25);
        assert.equal(priceToScale(125, InternalPriceScaleMode.IndexedTo100, 100), 125);
    });

    it('rejects invalid logarithmic and zero-base conversions', () => {
        assert.equal(Number.isNaN(priceToScale(0, InternalPriceScaleMode.Logarithmic)), true);
        assert.equal(Number.isNaN(priceToScale(10, InternalPriceScaleMode.Percentage, 0)), true);
        assert.equal(isRelativePriceScale(InternalPriceScaleMode.Percentage), true);
        assert.equal(isRelativePriceScale(InternalPriceScaleMode.IndexedTo100), true);
        assert.equal(isRelativePriceScale(InternalPriceScaleMode.Normal), false);
    });
});
