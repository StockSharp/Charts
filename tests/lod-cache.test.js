const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { LodCache } = require('../src/data/lod-cache.js');

const key = (symbol, groupingLevel) => ({ symbol, resolution: '1m', groupingLevel });

describe('LodCache', () => {
    it('keys by symbol, resolution and grouping level with bounded LRU eviction', () => {
        const cache = new LodCache(2);
        let builds = 0;
        const first = cache.getOrCreate(key('AAPL', 1), 1, () => ({ id: ++builds }));
        const second = cache.getOrCreate(key('AAPL', 2), 1, () => ({ id: ++builds }));
        assert.equal(cache.get(key('AAPL', 1), 1), first);
        const third = cache.getOrCreate(key('MSFT', 1), 1, () => ({ id: ++builds }));

        assert.equal(cache.get(key('AAPL', 2), 1), undefined);
        assert.deepEqual(cache.snapshot().keys, [key('AAPL', 1), key('MSFT', 1)]);
        assert.equal(cache.snapshot().capacity, 2);
        assert.equal(cache.snapshot().size, 2);
        assert.equal(first.id, 1);
        assert.equal(second.id, 2);
        assert.equal(third.id, 3);
    });

    it('invalidates stale source versions and never caches a failed factory', () => {
        const cache = new LodCache();
        const viewKey = key('AAPL', 4);
        cache.set(viewKey, 5, { id: 1 });
        assert.equal(cache.get(viewKey, 6), undefined);
        assert.equal(cache.snapshot().size, 0);
        assert.throws(() => cache.getOrCreate(viewKey, 6, () => {
            throw new Error('build failed');
        }), /build failed/);
        assert.equal(cache.snapshot().size, 0);

        cache.set(key('AAPL', 1), 6, { id: 2 });
        cache.set(key('AAPL', 2), 7, { id: 3 });
        cache.invalidateExceptVersion(7);
        assert.deepEqual(cache.snapshot().keys, [key('AAPL', 2)]);
    });

    it('validates capacity, keys, versions and values', () => {
        assert.throws(() => new LodCache(0), /capacity/);
        const cache = new LodCache();
        assert.throws(() => cache.get(key('', 1), 0), /symbol/);
        assert.throws(() => cache.get(key('X', 0), 0), /groupingLevel/);
        assert.throws(() => cache.get(key('X', 1), -1), /sourceVersion/);
        assert.throws(() => cache.set(key('X', 1), 0, null), /cannot be null/);
    });
});
