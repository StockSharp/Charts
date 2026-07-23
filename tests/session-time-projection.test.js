const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { SessionTimeProjection } = require('../src/time/session-time-projection.js');

describe('SessionTimeProjection', () => {
    it('preserves open elapsed time and collapses closed gaps', () => {
        const sessions = Object.freeze([
            Object.freeze({ openTime: 100, closeTime: 200 }),
            Object.freeze({ openTime: 500, closeTime: 700 }),
        ]);
        const calendar = {
            sessionsInRange() { return sessions; },
        };
        const projection = new SessionTimeProjection(calendar, { from: 0, to: 1_000 });

        assert.equal(projection.totalTradingSeconds, 300);
        assert.equal(projection.timeToTradingTime(150), 50);
        assert.equal(projection.timeToTradingTime(350), 100);
        assert.equal(projection.timeToTradingTime(550), 150);
        assert.equal(projection.tradingTimeToTime(50), 150);
        assert.equal(projection.tradingTimeToTime(100), 500);
        assert.equal(projection.tradingTimeToTime(150), 550);
    });

    it('returns null for an empty projection and clamps outside its session extent', () => {
        const empty = new SessionTimeProjection({ sessionsInRange: () => [] }, { from: 0, to: 1 });
        assert.equal(empty.hasSessions, false);
        assert.equal(empty.timeToTradingTime(0), null);
        assert.equal(empty.tradingTimeToTime(0), null);

        const projection = new SessionTimeProjection({
            sessionsInRange: () => [{ openTime: 10, closeTime: 20 }],
        }, { from: 0, to: 30 });
        assert.equal(projection.timeToTradingTime(-1), 0);
        assert.equal(projection.timeToTradingTime(40), 10);
        assert.equal(projection.tradingTimeToTime(-1), 10);
        assert.equal(projection.tradingTimeToTime(40), 20);
    });
});
