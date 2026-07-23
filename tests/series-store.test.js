const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    MismatchDirection,
    SeriesStore,
} = require('../src/core/model/series-store.js');

describe('SeriesStore', () => {
    it('emits precise change sets for snapshots and tail updates', () => {
        const store = new SeriesStore();
        const replaced = store.replace([{ time: 3 }, { time: 1 }, { time: 2 }]);
        assert.deepEqual(store.values.map((point) => point.time), [1, 2, 3]);
        assert.deepEqual(replaced, {
            kind: 'replace', version: 1, fromIndex: 0, toIndex: 2, added: 3, removed: 0,
        });

        assert.equal(store.update({ time: 3, value: 30 }).kind, 'update');
        assert.equal(store.update({ time: 4, value: 40 }).kind, 'append');
        assert.equal(store.update({ time: 2, value: 20 }), null);
        assert.equal(store.version, 3);
    });

    it('prepends history without replacing the existing tail anchor', () => {
        const store = new SeriesStore();
        store.replace([{ time: 3, value: 'old' }, { time: 4 }]);
        const change = store.prepend([
            { time: 1 },
            { time: 2 },
            { time: 3, value: 'corrected' },
        ]);

        assert.deepEqual(store.values.map((point) => point.time), [1, 2, 3, 4]);
        assert.equal(store.values[2].value, 'corrected');
        assert.deepEqual(change, {
            kind: 'prepend', version: 2, fromIndex: 0, toIndex: 2, added: 3, removed: 1,
        });
        assert.throws(() => store.prepend([{ time: 5 }]), /must not be newer/);
    });

    it('uses binary bounds for visible slices and exact time lookup', () => {
        const store = new SeriesStore();
        store.replace(Array.from({ length: 10 }, (_, index) => ({ time: index * 10 })));

        const visible = store.visibleRange(25, 65, 1);
        assert.equal(visible.from, 2);
        assert.equal(visible.to, 7);
        assert.deepEqual(visible.points.map((point) => point.time), [20, 30, 40, 50, 60, 70]);
        assert.equal(store.pointAtTime(40).time, 40);
        assert.equal(store.pointAtTime(41), null);
        assert.equal(store.nearest(46).time, 50);
    });

    it('finds a narrow window without scanning the full history', () => {
        let timeReads = 0;
        const points = Array.from({ length: 100_000 }, (_, index) => {
            const point = { value: index };
            Object.defineProperty(point, 'time', {
                enumerable: true,
                get() { timeReads++; return index; },
            });
            return point;
        });
        const store = new SeriesStore();
        store.replace(points);
        timeReads = 0;

        const visible = store.visibleRange(50_000, 50_010, 1);
        assert.equal(visible.points.length, 13);
        assert.ok(timeReads < 100, `expected logarithmic lookup, read time ${timeReads} times`);
    });

    it('supports pop, indexed mismatch and logical range metadata', () => {
        const store = new SeriesStore();
        store.replace(Array.from({ length: 5 }, (_, index) => ({ time: 100 + index })));

        assert.equal(store.dataByIndex(-1), null);
        assert.equal(store.dataByIndex(-1, MismatchDirection.NearestRight).time, 100);
        assert.equal(store.dataByIndex(99, MismatchDirection.NearestLeft).time, 104);
        assert.deepEqual(store.barsInLogicalRange({ from: 1.2, to: 3.8 }), {
            barsBefore: 2, barsAfter: 1, from: 102, to: 103,
        });

        const popped = store.pop(2);
        assert.deepEqual(popped.points.map((point) => point.time), [103, 104]);
        assert.equal(popped.change.kind, 'pop');
        assert.deepEqual(store.snapshot().map((point) => point.time), [100, 101, 102]);
    });
});
