const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { TradingSessionKind } = require('../src/time/trading-calendar.js');

describe('trading calendar contract', () => {
    it('exposes one immutable closed set of session kinds', () => {
        assert.deepEqual(TradingSessionKind, {
            PreMarket: 'pre-market',
            Regular: 'regular',
            PostMarket: 'post-market',
        });
        assert.equal(Object.isFrozen(TradingSessionKind), true);
        assert.throws(() => {
            TradingSessionKind.Regular = 'other';
        }, TypeError);
    });
});
