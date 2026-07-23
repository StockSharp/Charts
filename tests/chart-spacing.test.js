const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calculateBarStepPx } = require('../src/series-spacing.js');

describe('chart bar spacing', () => {
    it('uses dense candles instead of a sparse Fractals overlay', () => {
        const candles = Array.from({ length: 181 }, (_, i) => ({ time: i * 60 }));
        const fractals = [0, 30, 60, 90, 120, 180].map(i => ({ time: i * 60 }));
        const series = [
            { kind: 'Candlestick', points: candles },
            { kind: 'Line', points: fractals },
        ];

        const step = calculateBarStepPx(series, 180 * 60, 1_440);
        assert.equal(step, 8);
    });

    it('still derives spacing when only a sparse series exists', () => {
        const sparse = [0, 60, 120].map(time => ({ time }));
        assert.equal(calculateBarStepPx([{ kind: 'Line', points: sparse }], 120, 600), 300);
    });

    it('returns a stable fallback for unusable data', () => {
        assert.equal(calculateBarStepPx([], 0, 600), 6);
        assert.equal(calculateBarStepPx([{ kind: 'Line', points: [{ time: 1 }] }], 10, 600), 6);
    });
});
