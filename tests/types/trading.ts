import {
    ChartBracketRole,
    ChartExecutionLiquidity,
    ChartOrderStatus,
    ChartOrderTimeInForce,
    ChartOrderType,
    ChartPositionSide,
    TradingIntentKind,
    TradingLayer,
    TradingLayerPrimitive,
    TradingOrderPlacementAdapter,
    TradingLayerChangeKind,
    TradingIntentOutcomeStatus,
    TradingSide,
    chartOrderRemainingQuantity,
    chartPnlTotal,
    normalizeChartExecution,
    normalizeChartOrder,
    normalizeChartPosition,
    normalizeChartQuote,
    normalizeTradingIntent,
    type ChartOrder,
    type ChartPosition,
    type TradingIntent,
} from '../../src/index.js';

const normalization = { tickSize: 0.01, quantityStep: 0.1 };
const order: ChartOrder = normalizeChartOrder({
    id: 'order-1',
    revision: 1,
    side: TradingSide.Buy,
    type: ChartOrderType.Limit,
    status: ChartOrderStatus.Working,
    timeInForce: ChartOrderTimeInForce.GoodTillCancelled,
    quantity: 2,
    filledQuantity: 0,
    price: 100,
    bracket: { groupId: 'bracket-1', role: ChartBracketRole.Entry },
}, normalization);
const remaining: number = chartOrderRemainingQuantity(order);
void remaining;

const position: ChartPosition = normalizeChartPosition({
    id: 'position-1',
    side: ChartPositionSide.Long,
    quantity: 2,
    averagePrice: 100,
    pnl: { realized: 1, unrealized: 2, currency: 'USD' },
}, normalization);
if (position.pnl !== undefined) {
    const total: number = chartPnlTotal(position.pnl);
    void total;
}

void normalizeChartExecution({
    id: 'execution-1',
    orderId: order.id,
    time: 1,
    side: TradingSide.Buy,
    price: 100,
    quantity: 2,
    liquidity: ChartExecutionLiquidity.Taker,
}, normalization);
void normalizeChartQuote({ time: 1, bidPrice: 99.99, askPrice: 100.01 }, normalization);

const intent: TradingIntent = normalizeTradingIntent({
    intentId: 'intent-1',
    createdAt: 1,
    kind: TradingIntentKind.ModifyOrder,
    orderId: order.id,
    expectedRevision: order.revision,
    changes: { price: 100.01 },
}, normalization);
if (intent.kind === TradingIntentKind.ModifyOrder) {
    const price: number | undefined = intent.changes.price;
    void price;
}

// @ts-expect-error order direction is never encoded as a signed quantity
const badOrder: ChartOrder = { ...order, quantity: '-2' };
// @ts-expect-error intent kinds are a closed discriminated union
const badIntent: TradingIntent = { intentId: 'x', createdAt: 1, kind: 'send-to-broker' };
void badOrder;
void badIntent;

const tradingLayer = new TradingLayer({ tickSize: 0.01, quantityStep: 0.1 });
tradingLayer.setOrders([order]);
tradingLayer.setPositions([position]);
declare const chart: import('../../src/index.js').IChartApi;
declare const series: import('../../src/index.js').ISeriesApi;
const tradingPrimitive = new TradingLayerPrimitive(tradingLayer, {
    showPnl: true,
    priceFormatter: value => value.toFixed(2),
});
chart.attachPrimitive(tradingPrimitive, { series });
const placementAdapter = new TradingOrderPlacementAdapter(chart, tradingLayer, {
    quantity: 1,
    orderType: ChartOrderType.Limit,
    timeInForce: ChartOrderTimeInForce.GoodTillCancelled,
    sideResolver: event => event.button === 2 ? TradingSide.Sell : TradingSide.Buy,
});
const unsubscribeChanges = tradingLayer.subscribeChanges(change => {
    if (change.kind === TradingLayerChangeKind.Orders) {
        const added: readonly ChartOrder[] = change.added;
        void added;
    }
});
const unsubscribeIntents = tradingLayer.subscribeIntents(next => {
    const kind: TradingIntentKind = next.kind;
    void kind;
});
const cancelIntent = tradingLayer.requestCancelOrder(order.id);
const expected: number | undefined = cancelIntent.expectedRevision;
void expected;
tradingLayer.resolveIntent({
    intentId: cancelIntent.intentId,
    status: TradingIntentOutcomeStatus.Accepted,
});
unsubscribeChanges();
unsubscribeIntents();
chart.detachPrimitive(tradingPrimitive);
placementAdapter.dispose();
tradingLayer.dispose();
