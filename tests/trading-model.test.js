const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    ChartBracketRole,
    ChartExecutionLiquidity,
    ChartOrderStatus,
    ChartOrderTimeInForce,
    ChartOrderType,
    ChartPositionSide,
    TradingIntentKind,
    TradingSide,
    chartOrderRemainingQuantity,
    chartPnlTotal,
    normalizeChartExecution,
    normalizeChartExecutions,
    normalizeChartOrder,
    normalizeChartOrders,
    normalizeChartPosition,
    normalizeChartPositions,
    normalizeChartQuote,
    normalizeTradingIntent,
    quantizeTradingPrice,
} = require('../src/trading/model.js');

const grid = { tickSize: 0.01, quantityStep: 0.1 };

function workingLimit(overrides = {}) {
    return {
        id: 'order-1',
        revision: 3,
        side: TradingSide.Buy,
        type: ChartOrderType.Limit,
        status: ChartOrderStatus.Working,
        timeInForce: ChartOrderTimeInForce.GoodTillCancelled,
        quantity: 10,
        filledQuantity: 0,
        price: 100,
        createdAt: 1000,
        updatedAt: 1001,
        permissions: { canModify: true, canCancel: true },
        ...overrides,
    };
}

describe('broker-agnostic trading model', () => {
    it('snapshots immutable orders and keeps quantity direction out of the numeric value', () => {
        const source = workingLimit({
            quantity: 10.000000000000002,
            price: 100.00000000000001,
            bracket: { groupId: ' bracket-1 ', role: ChartBracketRole.Entry },
        });
        const order = normalizeChartOrder(source, grid);

        source.permissions.canModify = false;
        source.bracket.groupId = 'changed';
        assert.equal(order.quantity, 10);
        assert.equal(order.price, 100);
        assert.equal(order.bracket.groupId, 'bracket-1');
        assert.equal(order.permissions.canModify, true);
        assert.equal(chartOrderRemainingQuantity(order), 10);
        assert.equal(Object.isFrozen(order), true);
        assert.equal(Object.isFrozen(order.permissions), true);
        assert.equal(Object.isFrozen(order.bracket), true);
    });

    it('enforces order price shape, fill status, quantity grid and timestamps', () => {
        assert.throws(
            () => normalizeChartOrders([], { tickSize: 0 }),
            /tickSize must be positive/,
        );
        assert.throws(
            () => normalizeChartOrder(workingLimit({ price: undefined }), grid),
            /requires price/,
        );
        assert.throws(
            () => normalizeChartOrder(workingLimit({
                type: ChartOrderType.Market,
                price: 100,
            }), grid),
            /does not accept price/,
        );
        assert.throws(
            () => normalizeChartOrder(workingLimit({ quantity: 10.05 }), grid),
            /align to quantityStep/,
        );
        assert.throws(
            () => normalizeChartOrder(workingLimit({
                status: ChartOrderStatus.Filled,
                filledQuantity: 9,
            }), grid),
            /complete quantity/,
        );
        assert.throws(
            () => normalizeChartOrder(workingLimit({ updatedAt: 999 }), grid),
            /cannot precede/,
        );
    });

    it('models bracket entry and protection relationships without ambiguous parents', () => {
        const protection = normalizeChartOrder(workingLimit({
            id: 'stop-1',
            side: TradingSide.Sell,
            type: ChartOrderType.Stop,
            price: undefined,
            stopPrice: 95,
            bracket: {
                groupId: 'bracket-1',
                role: ChartBracketRole.StopLoss,
                positionId: 'position-1',
            },
        }), grid);
        assert.equal(protection.bracket.positionId, 'position-1');
        assert.throws(
            () => normalizeChartOrder(workingLimit({
                bracket: {
                    groupId: 'bracket-1',
                    role: ChartBracketRole.TakeProfit,
                    parentOrderId: 'entry-1',
                    positionId: 'position-1',
                },
            }), grid),
            /exactly one/,
        );
        assert.throws(
            () => normalizeChartOrders([workingLimit(), workingLimit()], grid),
            /duplicate chart order id/,
        );
    });

    it('normalizes positions and an exact signed P&L snapshot', () => {
        const position = normalizeChartPosition({
            id: ' position-1 ',
            revision: 7,
            side: ChartPositionSide.Short,
            quantity: 2,
            averagePrice: 101,
            openedAt: 900,
            pnl: {
                realized: -3.5,
                unrealized: 12.25,
                currency: ' USD ',
                markPrice: 95,
                time: 1100,
            },
            permissions: { canClose: true, canReverse: true, canProtect: true },
        }, grid);

        assert.equal(position.id, 'position-1');
        assert.equal(position.quantity, 2);
        assert.equal(chartPnlTotal(position.pnl), 8.75);
        assert.equal(position.pnl.currency, 'USD');
        assert.equal(Object.isFrozen(position.pnl), true);
        assert.throws(
            () => normalizeChartPositions([position, position], grid),
            /duplicate chart position id/,
        );
    });

    it('normalizes executions and permits signed fees for maker rebates', () => {
        const execution = normalizeChartExecution({
            id: 'execution-1',
            orderId: 'order-1',
            positionId: 'position-1',
            time: 1050,
            side: TradingSide.Buy,
            price: 100,
            quantity: 1.2,
            liquidity: ChartExecutionLiquidity.Maker,
            fee: -0.01,
            feeCurrency: 'USD',
        }, grid);
        assert.equal(execution.fee, -0.01);
        assert.equal(Object.isFrozen(execution), true);
        assert.throws(
            () => normalizeChartExecution({ ...execution, fee: undefined }, grid),
            /feeCurrency requires fee/,
        );
        assert.throws(
            () => normalizeChartExecutions([execution, execution], grid),
            /duplicate chart execution id/,
        );
    });

    it('accepts one-sided quotes but rejects crossed or structurally incomplete quotes', () => {
        const oneSided = normalizeChartQuote({
            time: 1100,
            bidPrice: 100,
            bidSize: 3,
        }, grid);
        assert.equal(oneSided.bidPrice, 100);
        assert.equal(Object.isFrozen(oneSided), true);
        assert.throws(
            () => normalizeChartQuote({ time: 1100, bidPrice: 101, askPrice: 100 }, grid),
            /cannot exceed/,
        );
        assert.throws(
            () => normalizeChartQuote({ time: 1100, bidSize: 3 }, grid),
            /requires bidPrice, askPrice or lastPrice/,
        );
        assert.throws(
            () => normalizeChartQuote({ time: 1100, lastPrice: 100, askSize: 2 }, grid),
            /askSize requires askPrice/,
        );
    });

    it('quantizes pointer previews without weakening canonical tick validation', () => {
        assert.equal(quantizeTradingPrice(100.006, grid), 100.01);
        assert.equal(quantizeTradingPrice(100.004, grid), 100);
        assert.equal(quantizeTradingPrice(10.26, { tickSize: 0.5, priceOrigin: 0.25 }), 10.25);
        assert.throws(
            () => normalizeChartOrder(workingLimit({ price: 100.006 }), grid),
            /align to tickSize/,
        );
    });
});

describe('trading intents', () => {
    const base = { intentId: 'intent-1', createdAt: 1200 };

    it('normalizes a place request independently from canonical order state', () => {
        const intent = normalizeTradingIntent({
            ...base,
            kind: TradingIntentKind.PlaceOrder,
            order: {
                clientOrderId: 'client-1',
                side: TradingSide.Sell,
                type: ChartOrderType.StopLimit,
                timeInForce: ChartOrderTimeInForce.Day,
                quantity: 2,
                price: 99,
                stopPrice: 99.5,
                bracketGroupId: 'bracket-1',
            },
        }, grid);
        assert.equal(intent.kind, TradingIntentKind.PlaceOrder);
        assert.equal(intent.order.stopPrice, 99.5);
        assert.equal('status' in intent.order, false);
        assert.equal(Object.isFrozen(intent.order), true);
    });

    it('requires a real modification and preserves optimistic concurrency revision', () => {
        const intent = normalizeTradingIntent({
            ...base,
            kind: TradingIntentKind.ModifyOrder,
            orderId: 'order-1',
            expectedRevision: 8,
            changes: { price: 101, quantity: 4 },
        }, grid);
        assert.equal(intent.expectedRevision, 8);
        assert.deepEqual(intent.changes, { quantity: 4, price: 101 });
        assert.throws(
            () => normalizeTradingIntent({
                ...base,
                kind: TradingIntentKind.ModifyOrder,
                orderId: 'order-1',
                changes: {},
            }, grid),
            /must contain a change/,
        );
    });

    it('keeps close/reverse and protection actions as explicit host intents', () => {
        const close = normalizeTradingIntent({
            ...base,
            kind: TradingIntentKind.ClosePosition,
            positionId: 'position-1',
        }, grid);
        const stop = normalizeTradingIntent({
            ...base,
            intentId: 'intent-2',
            kind: TradingIntentKind.CreateStopLoss,
            positionId: 'position-1',
            price: 95,
            quantity: 2,
        }, grid);
        const remove = normalizeTradingIntent({
            ...base,
            intentId: 'intent-3',
            kind: TradingIntentKind.RemoveTakeProfit,
            orderId: 'take-profit-1',
            expectedRevision: 2,
        }, grid);

        assert.equal(close.kind, 'close-position');
        assert.equal(stop.kind, 'create-stop-loss');
        assert.equal(remove.kind, 'remove-take-profit');
        assert.equal(remove.expectedRevision, 2);
    });
});
