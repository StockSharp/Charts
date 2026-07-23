const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { normalizeBars, normalizeBarsPage } = require('../src/data/bar-normalization.js');

describe('bar normalization', () => {
    it('keeps the last duplicate and snapshots source objects', () => {
        const original = { time: 2, value: 20 };
        const result = normalizeBars([
            { time: 1, value: 10 },
            { time: 1, value: 11 },
            original,
        ]);
        original.value = 99;
        assert.deepEqual(result, [{ time: 1, value: 11 }, { time: 2, value: 20 }]);
        assert.equal(Object.isFrozen(result), true);
        assert.equal(Object.isFrozen(result[0]), true);
    });

    it('rejects unordered or invalid timestamps instead of sorting silently', () => {
        assert.throws(() => normalizeBars([{ time: 2 }, { time: 1 }]), /ascending/);
        assert.throws(() => normalizeBars([{ time: Number.NaN }]), /invalid time/);
        assert.throws(() => normalizeBarsPage({ bars: [], hasMoreBefore: 'yes' }), /invalid bars page/);
    });
});
