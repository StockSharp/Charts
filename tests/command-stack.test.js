const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { CommandStack } = require('../src/core/interaction/command-stack.js');

function deltaCommand(model, delta, label = `delta ${delta}`) {
    return {
        label,
        execute() { model.value += delta; },
        undo() { model.value -= delta; },
        redo() { model.value += delta; },
    };
}

describe('CommandStack', () => {
    it('executes, undoes and redoes with immutable snapshots', () => {
        const model = { value: 0 };
        const stack = new CommandStack();
        const snapshots = [];
        stack.subscribe((snapshot) => snapshots.push(snapshot));

        stack.execute(deltaCommand(model, 3, 'Move'));
        assert.equal(model.value, 3);
        assert.deepEqual(stack.snapshot(), {
            canUndo: true, canRedo: false,
            undoLabel: 'Move', redoLabel: null,
            undoCount: 1, redoCount: 0,
            transactionActive: false,
        });
        assert.equal(Object.isFrozen(stack.snapshot()), true);

        assert.equal(stack.undo(), true);
        assert.equal(model.value, 0);
        assert.equal(stack.snapshot().redoLabel, 'Move');
        assert.equal(stack.redo(), true);
        assert.equal(model.value, 3);
        assert.equal(stack.redo(), false);
        assert.equal(snapshots.length, 3);
    });

    it('commits a multi-command drag transaction as one history entry', () => {
        const model = { value: 0 };
        const stack = new CommandStack();
        stack.beginTransaction('Drag line');
        stack.execute(deltaCommand(model, 1));
        stack.execute(deltaCommand(model, 2));
        stack.execute(deltaCommand(model, 3));
        assert.equal(model.value, 6);
        assert.equal(stack.snapshot().undoCount, 0);
        assert.equal(stack.snapshot().transactionActive, true);

        assert.equal(stack.commitTransaction(), true);
        assert.equal(stack.snapshot().undoCount, 1);
        assert.equal(stack.snapshot().undoLabel, 'Drag line');
        stack.undo();
        assert.equal(model.value, 0);
        stack.redo();
        assert.equal(model.value, 6);
    });

    it('rolls a failed transaction back in reverse order', () => {
        const calls = [];
        const stack = new CommandStack();
        const command = (name) => ({
            execute() { calls.push(`do-${name}`); },
            undo() { calls.push(`undo-${name}`); },
        });

        assert.throws(() => stack.transaction('failed', () => {
            stack.execute(command('a'));
            stack.execute(command('b'));
            throw new Error('action failed');
        }), /action failed/);

        assert.deepEqual(calls, ['do-a', 'do-b', 'undo-b', 'undo-a']);
        assert.equal(stack.snapshot().undoCount, 0);
        assert.equal(stack.snapshot().transactionActive, false);
    });

    it('bounds history and clears redo on a new branch', () => {
        const model = { value: 0 };
        const stack = new CommandStack(2);
        stack.execute(deltaCommand(model, 1, 'one'));
        stack.execute(deltaCommand(model, 2, 'two'));
        stack.execute(deltaCommand(model, 3, 'three'));
        assert.equal(stack.snapshot().undoCount, 2);

        stack.undo();
        stack.undo();
        assert.equal(stack.undo(), false);
        assert.equal(model.value, 1);
        stack.execute(deltaCommand(model, 10, 'branch'));
        assert.equal(stack.snapshot().canRedo, false);
        assert.equal(stack.snapshot().undoLabel, 'branch');
    });

    it('keeps history in place when undo or redo fails', () => {
        const stack = new CommandStack();
        let failUndo = true;
        let failRedo = true;
        stack.execute({
            label: 'fragile',
            execute() {},
            undo() { if (failUndo) throw new Error('undo failed'); },
            redo() { if (failRedo) throw new Error('redo failed'); },
        });
        assert.throws(() => stack.undo(), /undo failed/);
        assert.equal(stack.snapshot().undoCount, 1);
        failUndo = false;
        stack.undo();
        assert.throws(() => stack.redo(), /redo failed/);
        assert.equal(stack.snapshot().redoCount, 1);
        failRedo = false;
        stack.redo();
        assert.equal(stack.snapshot().undoCount, 1);
    });

    it('rejects nested/reentrant operations and releases retained history', () => {
        const stack = new CommandStack();
        assert.throws(() => new CommandStack(0), /positive integer/);
        stack.beginTransaction('outer');
        assert.throws(() => stack.beginTransaction('nested'), /nested/);
        assert.throws(() => stack.undo(), /during a command transaction/);
        assert.equal(stack.rollbackTransaction(), false);

        assert.throws(() => stack.execute({
            execute() { stack.execute({ execute() {}, undo() {} }); },
            undo() {},
        }), /cannot mutate/);
        assert.equal(stack.snapshot().undoCount, 0);

        stack.execute({ execute() {}, undo() {} });
        stack.dispose();
        assert.equal(stack.snapshot().undoCount, 0);
        assert.throws(() => stack.execute({ execute() {}, undo() {} }), /disposed/);
    });
});
