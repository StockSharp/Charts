const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { ChartDataStore } = require('../src/data/chart-data-store.js');

function point(time, value = time) { return { time, value }; }

describe('ChartDataStore', () => {
    it('owns raw history separately from a context-keyed render view', () => {
        let builds = 0;
        const store = new ChartDataStore({
            viewBuilder: (bars, context) => {
                builds++;
                return context.groupingLevel === 1
                    ? bars
                    : bars.filter((_, index) => index % context.groupingLevel === 0);
            },
        });
        store.replace([point(1), point(1, 11), point(2), point(3), point(4)]);
        const context = { symbol: 'AAPL', resolution: '1m', groupingLevel: 2 };
        const first = store.view(context);
        const second = store.view(context);

        assert.deepEqual(store.raw(), [point(1, 11), point(2), point(3), point(4)]);
        assert.deepEqual(first, [point(1, 11), point(3)]);
        assert.equal(first, second);
        assert.equal(builds, 1);
        assert.notEqual(store.view({ ...context, symbol: 'MSFT' }), first);
        assert.equal(builds, 2);
        assert.equal(store.view(context), first);
        assert.equal(builds, 2);
        assert.equal(store.lodCacheSnapshot().size, 2);
        assert.equal(store.lodCacheSnapshot().hits, 2);
    });

    it('invalidates views for prepend and tail updates without exposing mutable arrays', () => {
        const store = new ChartDataStore({
            viewBuilder: (bars) => bars.map((bar) => ({ ...bar, value: bar.value * 2 })),
        });
        store.replace([point(3), point(4)]);
        const context = { symbol: 'X', resolution: '1m', groupingLevel: 1 };
        const before = store.view(context);
        store.prepend([point(1), point(2), point(3, 30)]);
        assert.equal(store.lodCacheSnapshot().size, 0);
        assert.deepEqual(store.raw(), [point(1), point(2), point(3, 30), point(4)]);
        assert.deepEqual(store.view(context), [point(1, 2), point(2, 4), point(3, 60), point(4, 8)]);
        assert.notEqual(store.view(context), before);

        assert.equal(store.update(point(4, 40)).kind, 'update');
        assert.equal(store.update(point(5, 50)).kind, 'append');
        assert.equal(store.update(point(2, 20)), null);
        assert.deepEqual(store.raw().map((bar) => bar.value), [1, 2, 30, 40, 50]);
        assert.equal(Object.isFrozen(store.raw()), true);
        assert.equal(Object.isFrozen(store.view(context)), true);
    });
});
