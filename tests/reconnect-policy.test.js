const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { RealtimeReconnectBackoff } = require('../src/data/reconnect-policy.js');

describe('RealtimeReconnectBackoff', () => {
    it('produces bounded exponential attempts and resets after success', () => {
        const backoff = new RealtimeReconnectBackoff({
            initialDelayMs: 100,
            maxDelayMs: 1_000,
            multiplier: 2,
            maxAttempts: 3,
            jitterRatio: 0,
        }, () => 0.5);
        assert.deepEqual(backoff.next(), { attempt: 1, delayMs: 100 });
        assert.deepEqual(backoff.next(), { attempt: 2, delayMs: 200 });
        assert.deepEqual(backoff.next(), { attempt: 3, delayMs: 400 });
        assert.equal(backoff.next(), null);
        backoff.reset();
        assert.deepEqual(backoff.next(), { attempt: 1, delayMs: 100 });
    });

    it('applies deterministic jitter and honors disabled policy', () => {
        assert.equal(new RealtimeReconnectBackoff({ enabled: false }).next(), null);
        assert.equal(new RealtimeReconnectBackoff({
            initialDelayMs: 100,
            maxDelayMs: 200,
            jitterRatio: 0.25,
        }, () => 0).next().delayMs, 75);
        assert.equal(new RealtimeReconnectBackoff({
            initialDelayMs: 100,
            maxDelayMs: 200,
            jitterRatio: 0.25,
        }, () => 1).next().delayMs, 125);
    });

    it('rejects unsafe policies and random sources', () => {
        assert.throws(() => new RealtimeReconnectBackoff({ initialDelayMs: -1 }), /non-negative/);
        assert.throws(() => new RealtimeReconnectBackoff({
            initialDelayMs: 20, maxDelayMs: 10,
        }), /cannot be below/);
        assert.throws(() => new RealtimeReconnectBackoff({ multiplier: 0.5 }), /at least 1/);
        assert.throws(() => new RealtimeReconnectBackoff({ jitterRatio: 2 }), /\[0, 1\]/);
        const invalidRandom = new RealtimeReconnectBackoff({}, () => 2);
        assert.throws(() => invalidRandom.next(), /random source/);
    });
});
