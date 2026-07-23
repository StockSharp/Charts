const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    applyAutoscalePixelMargins,
    normalizeAutoscaleInfo,
} = require('../src/core/primitives/primitive-autoscale.js');

describe('primitive autoscale', () => {
    it('normalizes reversed ranges and non-negative pixel margins', () => {
        assert.deepEqual(normalizeAutoscaleInfo({
            priceRange: { min: 20, max: 10 },
            margins: { above: 24, below: -5 },
        }), { min: 10, max: 20, above: 24, below: 0 });
        assert.equal(normalizeAutoscaleInfo({
            priceRange: { min: Number.NaN, max: 10 },
        }), null);
        assert.equal(normalizeAutoscaleInfo({}), null);
        assert.equal(normalizeAutoscaleInfo(null), null);
    });

    it('converts media-pixel margins into asymmetric scale expansion', () => {
        assert.deepEqual(
            applyAutoscalePixelMargins(0, 100, 20, 10, 200),
            { min: -1000 / 170, max: 100 + 2000 / 170 },
        );
        assert.deepEqual(
            applyAutoscalePixelMargins(5, 5, 20, 20, 200),
            { min: 5, max: 5 },
        );
    });

    it('bounds pathological margins so a scale cannot invert', () => {
        const range = applyAutoscalePixelMargins(0, 100, 10_000, 10_000, 200);
        assert.ok(range.min < 0);
        assert.ok(range.max > 100);
        assert.ok(range.max > range.min);
    });
});
