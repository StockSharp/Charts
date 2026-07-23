const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    ChartOrderStatus,
    ChartOrderTimeInForce,
    ChartOrderType,
    ChartPositionSide,
    TradingLayer,
    TradingLayerPrimitive,
    TradingIntentOutcomeStatus,
    TradingPrimitiveEntityKind,
    TradingSide,
    isTradingPrimitiveHitData,
} = require('../src/trading/index.js');
const {
    PrimitiveHitTestLocation,
    PrimitiveZOrder,
} = require('../src/core/primitives/primitive-api.js');

function tradingLayer() {
    return new TradingLayer({ tickSize: 0.01, quantityStep: 0.1 });
}

function workingOrder(id = 'order-1', overrides = {}) {
    return {
        id,
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

function attach(primitive) {
    let updates = 0;
    const disposables = [];
    primitive.attached({
        chart: {},
        pane: {},
        series: null,
        priceScaleId: 'right',
        commandStack: {},
        requestUpdate: () => updates++,
        timeToCoordinate: time => time * 10,
        coordinateToTime: x => x / 10,
        priceToCoordinate: price => 300 - price * 2,
        coordinateToPrice: y => (300 - y) / 2,
        pixelRatio: () => 2,
        theme: () => ({
            backgroundColor: '#10151d',
            textColor: '#d9e1ea',
            fontFamily: 'Arial',
            fontSize: 12,
            verticalGridColor: '#222',
            horizontalGridColor: '#222',
        }),
        addDisposable: disposable => disposables.push(disposable),
    });
    return {
        updates: () => updates,
        disposeResources() {
            for (const disposable of disposables.splice(0)) {
                if (typeof disposable === 'function') disposable();
                else disposable.dispose();
            }
        },
    };
}

function canvas() {
    const calls = { texts: [], fills: [], strokes: 0, paths: [] };
    let path = [];
    const context = {
        font: '',
        textBaseline: '',
        textAlign: '',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        setLineDash() {},
        beginPath() { path = []; },
        moveTo(x, y) { path.push({ kind: 'move', x, y }); },
        lineTo(x, y) { path.push({ kind: 'line', x, y }); },
        closePath() {},
        stroke() { calls.strokes++; calls.paths.push([...path]); },
        fill() {},
        fillRect(x, y, width, height) { calls.fills.push({ x, y, width, height }); },
        fillText(text, x, y) { calls.texts.push({ text, x, y }); },
        measureText(text) { return { width: text.length * 6 }; },
    };
    return { context, calls };
}

function draw(primitive) {
    const target = canvas();
    const plot = { x: 0, y: 0, width: 400, height: 260 };
    primitive.paneViews()[0].renderer().draw({
        pane: { ...plot, plot, isLast: true },
        useMediaCoordinateSpace(consumer) {
            return consumer({ context: target.context, mediaSize: { width: 500, height: 300 } });
        },
    });
    return target;
}

function pointer(hit, y, startY = 100) {
    return {
        point: { x: 300, y },
        startPoint: { x: 300, y: startY },
        delta: { x: 0, y: y - startY },
        totalDelta: { x: 0, y: y - startY },
        hit: { id: hit.id, role: hit.role, data: hit.data },
        sourceEvent: {},
    };
}

describe('TradingLayerPrimitive', () => {
    it('renders orders, position P&L, executions and quotes from one canonical snapshot', () => {
        const trading = tradingLayer();
        trading.setOrders([workingOrder()]);
        trading.setPositions([{
            id: 'position-1',
            side: ChartPositionSide.Short,
            quantity: 3,
            averagePrice: 101,
            pnl: { realized: -2, unrealized: 7, currency: 'USD', markPrice: 99 },
        }]);
        trading.setExecutions([{
            id: 'execution-1',
            orderId: 'order-1',
            time: 10,
            side: TradingSide.Buy,
            price: 99,
            quantity: 2,
        }]);
        trading.setQuote({
            time: 11,
            bidPrice: 99,
            bidSize: 4,
            askPrice: 101,
            askSize: 5,
            lastPrice: 100,
            lastSize: 1,
        });
        const primitive = new TradingLayerPrimitive(trading, { id: 'trading' });
        attach(primitive);
        const result = draw(primitive);
        const labels = result.calls.texts.map(item => item.text);

        assert.ok(labels.some(text => text.includes('BUY 10 @ 100 working')));
        assert.ok(labels.some(text => text.includes('SHORT 3 @ 101 P&L +5 USD')));
        assert.ok(labels.some(text => text.includes('BUY 2 @ 99')));
        assert.ok(result.calls.strokes >= 5);
        assert.deepEqual(
            primitive.priceAxisViews().map(view => view.text()),
            ['BID 99 × 4', 'ASK 101 × 5', 'LAST 100 × 1'],
        );
        assert.equal(primitive.paneViews()[0].zOrder(), PrimitiveZOrder.Top);
    });

    it('publishes stable typed hover data for every rendered entity kind', () => {
        const trading = tradingLayer();
        trading.setOrders([workingOrder()]);
        trading.setPositions([{
            id: 'position-1',
            side: ChartPositionSide.Long,
            quantity: 3,
            averagePrice: 104,
        }]);
        trading.setExecutions([{
            id: 'execution-1',
            time: 10,
            side: TradingSide.Sell,
            price: 96,
            quantity: 1,
        }]);
        trading.setQuote({ time: 11, bidPrice: 90 });
        const primitive = new TradingLayerPrimitive(trading, { id: 'trading' });
        attach(primitive);
        draw(primitive);
        const hitContext = { location: PrimitiveHitTestLocation.Pane, priceScaleId: 'right' };

        const orderHit = primitive.hitTest({ x: 300, y: 100 }, hitContext);
        const positionHit = primitive.hitTest({ x: 10, y: 92 }, hitContext);
        const executionHit = primitive.hitTest({ x: 100, y: 108 }, hitContext);
        const quoteHit = primitive.hitTest({ x: 350, y: 120 }, hitContext);

        assert.equal(isTradingPrimitiveHitData(orderHit.data), true);
        assert.equal(orderHit.data.entityKind, TradingPrimitiveEntityKind.Order);
        assert.equal(orderHit.data.id, 'order-1');
        assert.equal(positionHit.data.entityKind, TradingPrimitiveEntityKind.Position);
        assert.equal(executionHit.data.entityKind, TradingPrimitiveEntityKind.Execution);
        assert.equal(quoteHit.data.entityKind, TradingPrimitiveEntityKind.Quote);
        assert.equal(quoteHit.data.id, 'bid');
    });

    it('invalidates from layer diffs, hides inactive orders by default and detaches cleanly', () => {
        const trading = tradingLayer();
        const primitive = new TradingLayerPrimitive(trading);
        const attachment = attach(primitive);
        trading.setOrders([workingOrder('filled', {
            status: ChartOrderStatus.Filled,
            filledQuantity: 10,
            averageFillPrice: 100,
        })]);
        assert.equal(attachment.updates(), 1);
        assert.equal(draw(primitive).calls.texts.length, 0);

        primitive.applyOptions({ showInactiveOrders: true });
        assert.equal(attachment.updates(), 2);
        assert.ok(draw(primitive).calls.texts.some(item => item.text.includes('filled')));

        primitive.detached();
        attachment.disposeResources();
        trading.setOrders([]);
        assert.equal(attachment.updates(), 2);
    });

    it('applies visual options atomically and keeps autoscale opt-in', () => {
        const trading = tradingLayer();
        trading.setOrders([workingOrder()]);
        trading.setPositions([{
            id: 'position-1',
            side: ChartPositionSide.Long,
            quantity: 1,
            averagePrice: 105,
        }]);
        trading.setQuote({ time: 1, bidPrice: 99, askPrice: 106 });
        const primitive = new TradingLayerPrimitive(trading);
        attach(primitive);
        assert.equal(primitive.autoscaleInfo({ from: 0, to: 10 }), null);
        primitive.applyOptions({ autoscale: true, orderBuyColor: '#123456' });
        assert.deepEqual(primitive.autoscaleInfo({ from: 0, to: 10 }), {
            priceRange: { min: 99, max: 106 },
            margins: { above: 8, below: 8 },
        });

        const before = primitive.options();
        assert.throws(
            () => primitive.applyOptions({ orderBuyColor: '#abcdef', lineWidth: 0 }),
            /lineWidth/,
        );
        assert.equal(primitive.options().orderBuyColor, before.orderBuyColor);
        assert.equal(primitive.options().lineWidth, before.lineWidth);
    });

    it('keeps same-price order labels separate and stable across host reordering', () => {
        const trading = tradingLayer();
        const values = [
            workingOrder('a', { label: 'A' }),
            workingOrder('b', { label: 'B' }),
            workingOrder('c', { label: 'C' }),
        ];
        trading.setOrders(values);
        const primitive = new TradingLayerPrimitive(trading, {
            id: 'stacked',
            showPositions: false,
            showExecutions: false,
            showQuote: false,
        });
        attach(primitive);
        const first = draw(primitive);
        const firstLabels = new Map(first.calls.texts.map(item => [item.text[0], item.y]));
        const coordinates = [...firstLabels.values()].sort((left, right) => left - right);
        assert.equal(coordinates.length, 3);
        assert.ok(coordinates[1] - coordinates[0] >= 18);
        assert.ok(coordinates[2] - coordinates[1] >= 18);

        const hitContext = { location: PrimitiveHitTestLocation.Pane, priceScaleId: 'right' };
        const hitIds = new Set(first.calls.fills.map(rect => primitive.hitTest({
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
        }, hitContext).data.id));
        assert.deepEqual(hitIds, new Set(['a', 'b', 'c']));

        trading.setOrders([...values].reverse());
        const second = draw(primitive);
        const secondLabels = new Map(second.calls.texts.map(item => [item.text[0], item.y]));
        assert.deepEqual(secondLabels, firstLabels);
    });

    it('renders entry, stop-loss and take-profit as one explicit bracket group', () => {
        const trading = tradingLayer();
        trading.setOrders([
            workingOrder('entry', {
                label: 'BR',
                bracket: { groupId: 'bracket-1', role: 'entry' },
            }),
            workingOrder('stop', {
                label: 'BR',
                side: TradingSide.Sell,
                type: ChartOrderType.Stop,
                price: undefined,
                stopPrice: 95,
                bracket: {
                    groupId: 'bracket-1',
                    role: 'stop-loss',
                    parentOrderId: 'entry',
                },
            }),
            workingOrder('target', {
                label: 'BR',
                side: TradingSide.Sell,
                price: 105,
                bracket: {
                    groupId: 'bracket-1',
                    role: 'take-profit',
                    parentOrderId: 'entry',
                },
            }),
        ]);
        const primitive = new TradingLayerPrimitive(trading, {
            showPositions: false,
            showExecutions: false,
            showQuote: false,
        });
        attach(primitive);
        const result = draw(primitive);
        const text = result.calls.texts.map(item => item.text).join('\n');

        assert.match(text, /ENTRY BUY/);
        assert.match(text, /SL SELL/);
        assert.match(text, /TP SELL/);
        assert.ok(result.calls.paths.some(path => path.length >= 8));
    });

    it('updates position P&L in place without replacing the primitive or pane view', () => {
        const trading = tradingLayer();
        const firstPosition = {
            id: 'position-1',
            revision: 1,
            side: ChartPositionSide.Long,
            quantity: 2,
            averagePrice: 100,
            pnl: { realized: 1, unrealized: 2, currency: 'USD' },
        };
        trading.setPositions([firstPosition]);
        const primitive = new TradingLayerPrimitive(trading, {
            id: 'stable-trading',
            showOrders: false,
            showExecutions: false,
            showQuote: false,
        });
        const paneView = primitive.paneViews()[0];
        attach(primitive);
        assert.ok(draw(primitive).calls.texts.some(item => item.text.includes('P&L +3 USD')));

        trading.setPositions([{
            ...firstPosition,
            revision: 2,
            pnl: { realized: 4, unrealized: 6, currency: 'USD' },
        }]);
        assert.equal(primitive.id(), 'stable-trading');
        assert.equal(primitive.paneViews()[0], paneView);
        assert.ok(draw(primitive).calls.texts.some(item => item.text.includes('P&L +10 USD')));
    });

    it('keeps order drag as a tick-aligned preview until host acceptance', () => {
        const trading = tradingLayer();
        trading.setOrders([workingOrder('order-1', { revision: 3 })]);
        const intents = [];
        trading.subscribeIntents(intent => intents.push(intent));
        const primitive = new TradingLayerPrimitive(trading, {
            showPositions: false,
            showExecutions: false,
            showQuote: false,
        });
        attach(primitive);
        draw(primitive);
        const hit = primitive.hitTest({ x: 300, y: 100 }, {
            location: PrimitiveHitTestLocation.Pane,
            priceScaleId: 'right',
        });
        assert.equal(hit.interaction.draggable, true);

        primitive.onPointerDown(pointer(hit, 100));
        primitive.onPointerMove(pointer(hit, 79.993));
        assert.equal(trading.state().orders[0].price, 100);
        assert.ok(draw(primitive).calls.texts.some(item => item.text.includes('@ 110 DRAGGING')));
        primitive.onPointerUp(pointer(hit, 79.993));

        assert.equal(intents.length, 1);
        assert.deepEqual(intents[0].changes, { price: 110 });
        assert.equal(intents[0].expectedRevision, 3);
        assert.equal(trading.state().orders[0].price, 100);
        assert.ok(draw(primitive).calls.texts.some(item => item.text.includes('@ 110 PENDING')));
        assert.equal(trading.pendingIntents()[0], intents[0]);

        trading.resolveIntent({
            intentId: intents[0].intentId,
            status: TradingIntentOutcomeStatus.Accepted,
        });
        assert.ok(draw(primitive).calls.texts.some(item => item.text.includes('@ 110 ACCEPTED')));
        trading.setOrders([workingOrder('order-1', { revision: 4, price: 110 })]);
        assert.equal(trading.state().orders[0].price, 110);
        assert.ok(draw(primitive).calls.texts.some(item => item.text.includes('@ 110 working')));
    });

    it('rolls a rejected or cancelled order preview back to canonical state', () => {
        const trading = tradingLayer();
        trading.setOrders([workingOrder()]);
        const primitive = new TradingLayerPrimitive(trading, {
            showPositions: false,
            showExecutions: false,
            showQuote: false,
        });
        attach(primitive);
        draw(primitive);
        let hit = primitive.hitTest({ x: 300, y: 100 }, {
            location: PrimitiveHitTestLocation.Pane,
            priceScaleId: 'right',
        });
        primitive.onPointerDown(pointer(hit, 100));
        primitive.onPointerMove(pointer(hit, 80));
        primitive.onPointerCancel(pointer(hit, 80));
        assert.equal(trading.pendingIntents().length, 0);
        assert.ok(draw(primitive).calls.texts.some(item => item.text.includes('@ 100 working')));

        hit = primitive.hitTest({ x: 300, y: 100 }, {
            location: PrimitiveHitTestLocation.Pane,
            priceScaleId: 'right',
        });
        primitive.onPointerDown(pointer(hit, 100));
        primitive.onPointerMove(pointer(hit, 80));
        primitive.onPointerUp(pointer(hit, 80));
        const pending = trading.pendingIntents()[0];
        trading.resolveIntent({
            intentId: pending.intentId,
            status: TradingIntentOutcomeStatus.Rejected,
            reason: 'price band',
        });

        assert.equal(trading.state().orders[0].price, 100);
        assert.ok(draw(primitive).calls.texts.some(item => item.text.includes('@ 100 working')));
        const canonicalHit = primitive.hitTest({ x: 300, y: 100 }, {
            location: PrimitiveHitTestLocation.Pane,
            priceScaleId: 'right',
        });
        assert.equal(canonicalHit.interaction.draggable, true);
    });

    it('cancels an active drag when a newer canonical order revision arrives', () => {
        const trading = tradingLayer();
        trading.setOrders([workingOrder('order-1', { revision: 1 })]);
        const primitive = new TradingLayerPrimitive(trading, {
            showPositions: false,
            showExecutions: false,
            showQuote: false,
        });
        attach(primitive);
        draw(primitive);
        const hit = primitive.hitTest({ x: 300, y: 100 }, {
            location: PrimitiveHitTestLocation.Pane,
            priceScaleId: 'right',
        });
        primitive.onPointerDown(pointer(hit, 100));
        primitive.onPointerMove(pointer(hit, 80));
        trading.setOrders([workingOrder('order-1', { revision: 2, price: 101 })]);
        primitive.onPointerUp(pointer(hit, 80));

        assert.equal(trading.pendingIntents().length, 0);
        assert.equal(trading.state().orders[0].price, 101);
        assert.ok(draw(primitive).calls.texts.some(item => item.text.includes('@ 101 working')));
    });
});
