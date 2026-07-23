const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    ChartBracketRole,
    ChartOrderStatus,
    ChartOrderTimeInForce,
    ChartOrderType,
    ChartPositionSide,
    TradingIntentKind,
    TradingLayer,
    TradingLayerChangeKind,
    TradingIntentOutcomeStatus,
    TradingSide,
} = require('../src/trading/index.js');

function layer() {
    return new TradingLayer({
        tickSize: 0.01,
        quantityStep: 0.1,
        clock: () => 1700000000,
        intentIdFactory: sequence => `intent-${sequence}`,
    });
}

function order(id, overrides = {}) {
    return {
        id,
        revision: 1,
        side: TradingSide.Buy,
        type: ChartOrderType.Limit,
        status: ChartOrderStatus.Working,
        timeInForce: ChartOrderTimeInForce.GoodTillCancelled,
        quantity: 10,
        filledQuantity: 0,
        price: 100,
        permissions: { canModify: true, canCancel: true },
        ...overrides,
    };
}

function position(id, overrides = {}) {
    return {
        id,
        revision: 2,
        side: ChartPositionSide.Long,
        quantity: 5,
        averagePrice: 100,
        permissions: { canClose: true, canReverse: true, canProtect: true },
        ...overrides,
    };
}

describe('TradingLayer canonical state', () => {
    it('diffs collections by stable id and preserves unchanged entity identity', () => {
        const trading = layer();
        const changes = [];
        trading.subscribeChanges(change => changes.push(change));

        trading.setOrders([order('a'), order('b')]);
        const first = trading.state();
        assert.equal(first.version, 1);
        assert.equal(Object.isFrozen(first), true);
        assert.equal(Object.isFrozen(first.orders), true);
        assert.deepEqual(changes[0].added.map(item => item.id), ['a', 'b']);

        trading.setOrders([order('a'), order('b')]);
        assert.equal(trading.state(), first);
        assert.equal(changes.length, 1);

        trading.setOrders([
            order('b', { revision: 2, price: 101 }),
            order('a'),
        ]);
        const second = trading.state();
        const change = changes[1];
        assert.equal(second.version, 2);
        assert.equal(second.orders[1], first.orders[0]);
        assert.notEqual(second.orders[0], first.orders[1]);
        assert.equal(change.kind, TradingLayerChangeKind.Orders);
        assert.equal(change.orderChanged, true);
        assert.deepEqual(change.updated.map(item => item.current.id), ['b']);
        assert.equal(change.updated[0].previous, first.orders[1]);

        trading.setOrders([order('b', { revision: 2, price: 101 })]);
        assert.deepEqual(changes[2].removed.map(item => item.id), ['a']);
        assert.equal(changes[2].removed[0], first.orders[0]);
    });

    it('validates complete replacements before changing canonical state', () => {
        const trading = layer();
        trading.setOrders([order('a')]);
        const before = trading.state();

        assert.throws(
            () => trading.setOrders([order('a'), order('a')]),
            /duplicate chart order id/,
        );
        assert.equal(trading.state(), before);
        assert.equal(trading.state().version, 1);

        assert.throws(
            () => trading.setOrders([order('a', { price: 100.005 })]),
            /align to tickSize/,
        );
        assert.equal(trading.state(), before);
    });

    it('publishes independent position, execution and quote changes only when values differ', () => {
        const trading = layer();
        const kinds = [];
        trading.subscribeChanges(change => kinds.push(change.kind));
        trading.setPositions([position('p')]);
        trading.setExecutions([{
            id: 'fill-1',
            orderId: 'a',
            positionId: 'p',
            time: 10,
            side: TradingSide.Buy,
            price: 100,
            quantity: 1,
        }]);
        trading.setQuote({ time: 11, bidPrice: 99.99, askPrice: 100.01 });
        const snapshot = trading.state();
        trading.setQuote({ time: 11, bidPrice: 99.99, askPrice: 100.01 });

        assert.deepEqual(kinds, [
            TradingLayerChangeKind.Positions,
            TradingLayerChangeKind.Executions,
            TradingLayerChangeKind.Quote,
        ]);
        assert.equal(trading.state(), snapshot);
        assert.equal(snapshot.version, 3);
        assert.equal(snapshot.quote.askPrice, 100.01);

        trading.setQuote(null);
        assert.equal(trading.state().quote, null);
        assert.equal(trading.state().version, 4);
    });

    it('validates normalization options even for an empty initial replacement', () => {
        assert.throws(
            () => new TradingLayer({ tickSize: 0 }),
            /tickSize must be positive/,
        );
        const trading = layer();
        trading.setOrders([]);
        assert.deepEqual(trading.state().orders, []);
    });
});

describe('TradingLayer intents', () => {
    it('emits immutable intents without changing broker-owned state', () => {
        const trading = layer();
        trading.setOrders([order('a', { revision: 7 })]);
        trading.setPositions([position('p', { revision: 4 })]);
        const before = trading.state();
        const intents = [];
        const unsubscribe = trading.subscribeIntents(intent => intents.push(intent));

        const modify = trading.requestModifyOrder('a', { price: 101 });
        const close = trading.requestClosePosition('p', 2);
        const place = trading.requestPlaceOrder({
            side: TradingSide.Sell,
            type: ChartOrderType.Market,
            timeInForce: ChartOrderTimeInForce.ImmediateOrCancel,
            quantity: 1,
        });

        assert.equal(modify.intentId, 'intent-1');
        assert.equal(modify.expectedRevision, 7);
        assert.equal(close.intentId, 'intent-2');
        assert.equal(close.expectedRevision, 4);
        assert.equal(place.intentId, 'intent-3');
        assert.equal(place.kind, TradingIntentKind.PlaceOrder);
        assert.equal(Object.isFrozen(modify), true);
        assert.equal(Object.isFrozen(modify.changes), true);
        assert.equal(trading.state(), before);
        assert.equal(intents.length, 3);

        unsubscribe();
        unsubscribe();
        trading.requestCancelOrder('a');
        assert.equal(intents.length, 3);
    });

    it('uses canonical permissions, ids and revisions as the interaction boundary', () => {
        const trading = layer();
        trading.setOrders([
            order('read-only', { permissions: undefined }),
            order('stop', {
                side: TradingSide.Sell,
                type: ChartOrderType.Stop,
                price: undefined,
                stopPrice: 95,
                bracket: {
                    groupId: 'bracket-1',
                    role: ChartBracketRole.StopLoss,
                    positionId: 'p',
                },
            }),
        ]);
        trading.setPositions([position('p')]);

        assert.throws(() => trading.requestModifyOrder('read-only', { price: 101 }), /cannot modify/);
        assert.throws(() => trading.requestCancelOrder('missing'), /unknown chart order/);
        assert.throws(() => trading.requestClosePosition('p', 6), /cannot exceed/);
        assert.throws(
            () => trading.requestEditTakeProfit('stop', 110),
            /not a take-profit/,
        );

        const edit = trading.requestEditStopLoss('stop', 96, 4);
        const remove = trading.requestRemoveStopLoss('stop');
        assert.equal(edit.kind, TradingIntentKind.EditStopLoss);
        assert.equal(edit.expectedRevision, 1);
        assert.equal(remove.kind, TradingIntentKind.RemoveStopLoss);
    });

    it('clears subscriptions and rejects all use after idempotent disposal', () => {
        const trading = layer();
        let calls = 0;
        trading.subscribeChanges(() => calls++);
        trading.subscribeIntents(() => calls++);
        trading.dispose();
        trading.dispose();

        assert.throws(() => trading.state(), /disposed/);
        assert.throws(() => trading.setOrders([]), /disposed/);
        assert.throws(() => trading.requestPlaceOrder({}), /disposed/);
        assert.equal(calls, 0);
    });

    it('tracks pending intents until the host explicitly accepts or rejects them', () => {
        const trading = layer();
        trading.setOrders([order('a')]);
        const outcomes = [];
        trading.subscribeIntentOutcomes(outcome => outcomes.push(outcome));

        const intent = trading.requestModifyOrder('a', { price: 101 });
        assert.deepEqual(trading.pendingIntents(), [intent]);
        assert.equal(Object.isFrozen(trading.pendingIntents()), true);
        trading.resolveIntent({
            intentId: intent.intentId,
            status: TradingIntentOutcomeStatus.Rejected,
            reason: ' venue rejected ',
        });

        assert.deepEqual(trading.pendingIntents(), []);
        assert.equal(outcomes[0].intent, intent);
        assert.equal(outcomes[0].status, TradingIntentOutcomeStatus.Rejected);
        assert.equal(outcomes[0].reason, 'venue rejected');
        assert.equal(Object.isFrozen(outcomes[0]), true);
        assert.throws(
            () => trading.resolveIntent({
                intentId: intent.intentId,
                status: TradingIntentOutcomeStatus.Accepted,
            }),
            /unknown pending trading intent/,
        );
    });
});
