const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { DataRequestCoordinator } = require('../src/data/data-request-coordinator.js');

describe('DataRequestCoordinator', () => {
    it('aborts the previous generation and rejects stale tickets', () => {
        const coordinator = new DataRequestCoordinator();
        const first = coordinator.begin();
        assert.equal(coordinator.isCurrent(first), true);
        const second = coordinator.begin();
        assert.equal(first.signal.aborted, true);
        assert.equal(coordinator.isCurrent(first), false);
        assert.equal(coordinator.isCurrent(second), true);
        assert.equal(second.generation, first.generation + 1);

        coordinator.cancel();
        assert.equal(second.signal.aborted, true);
        assert.equal(coordinator.isCurrent(second), false);
    });

    it('aborts active work and becomes terminal on dispose', () => {
        const coordinator = new DataRequestCoordinator();
        const ticket = coordinator.begin();
        coordinator.dispose();
        coordinator.dispose();
        assert.equal(ticket.signal.aborted, true);
        assert.equal(coordinator.isCurrent(ticket), false);
        assert.throws(() => coordinator.begin(), /disposed/);
    });
});
