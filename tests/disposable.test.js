const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    DisposableStore,
    MutableDisposable,
    toDisposable,
} = require('../src/core/disposable.js');

describe('DisposableStore', () => {
    it('releases resources once in reverse ownership order', () => {
        const calls = [];
        const store = new DisposableStore();
        store.defer(() => calls.push('first'));
        store.defer(() => calls.push('second'));

        store.dispose();
        store.dispose();

        assert.deepEqual(calls, ['second', 'first']);
        assert.equal(store.isDisposed, true);
    });

    it('immediately releases resources added after disposal', () => {
        let calls = 0;
        const store = new DisposableStore();
        store.dispose();
        store.add(toDisposable(() => calls++));
        assert.equal(calls, 1);
    });

    it('removes named EventTarget listeners', () => {
        const target = new EventTarget();
        const store = new DisposableStore();
        let calls = 0;
        store.listen(target, 'tick', () => calls++);

        target.dispatchEvent(new Event('tick'));
        store.dispose();
        target.dispatchEvent(new Event('tick'));

        assert.equal(calls, 1);
    });
});

describe('MutableDisposable', () => {
    it('releases the previous value when replaced or cleared', () => {
        const calls = [];
        const slot = new MutableDisposable();
        slot.value = toDisposable(() => calls.push('a'));
        slot.value = toDisposable(() => calls.push('b'));
        slot.clear();
        slot.dispose();
        assert.deepEqual(calls, ['a', 'b']);
    });
});
