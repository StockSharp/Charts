const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    ChartOrderTimeInForce,
    ChartOrderType,
    TradingIntentOutcomeStatus,
    TradingLayer,
    TradingOrderPlacementAdapter,
    TradingSide,
} = require('../src/trading/index.js');

function chartHarness() {
    const listeners = new Set();
    const modes = [];
    return {
        chart: {
            setOrderPlacement(value) { modes.push(value); },
            subscribeOrderPlace(listener) { listeners.add(listener); },
            unsubscribeOrderPlace(listener) { listeners.delete(listener); },
        },
        modes,
        listenerCount: () => listeners.size,
        emit(overrides = {}) {
            const event = {
                price: 100.006,
                button: 0,
                ctrlKey: true,
                shiftKey: false,
                altKey: false,
                metaKey: false,
                ...overrides,
            };
            for (const listener of [...listeners]) listener(event);
        },
    };
}

function layer() {
    return new TradingLayer({
        tickSize: 0.01,
        quantityStep: 0.1,
        clock: () => 10,
        intentIdFactory: sequence => `placement-${sequence}`,
    });
}

describe('TradingOrderPlacementAdapter', () => {
    it('maps the existing placement signal to validated buy and sell intents', () => {
        const harness = chartHarness();
        const trading = layer();
        const intents = [];
        trading.subscribeIntents(intent => intents.push(intent));
        const adapter = new TradingOrderPlacementAdapter(harness.chart, trading, {
            quantity: 2.5,
        });

        assert.equal(harness.listenerCount(), 1);
        assert.deepEqual(harness.modes[0], {
            modifier: 'ctrl', color: '#ffb74d', title: 'ORDER',
        });
        harness.emit();
        harness.emit({ button: 2, price: 99.994 });

        assert.equal(intents[0].order.side, TradingSide.Buy);
        assert.equal(intents[0].order.price, 100.01);
        assert.equal(intents[0].order.quantity, 2.5);
        assert.equal(intents[1].order.side, TradingSide.Sell);
        assert.ok(Math.abs(intents[1].order.price - 99.99) < 1e-12);
        assert.equal(adapter.options().orderType, ChartOrderType.Limit);
    });

    it('switches to stop placement and applies options atomically', () => {
        const harness = chartHarness();
        const trading = layer();
        const intents = [];
        trading.subscribeIntents(intent => intents.push(intent));
        const adapter = new TradingOrderPlacementAdapter(harness.chart, trading, {
            quantity: 1,
            enabled: false,
        });
        assert.equal(harness.modes[0], null);

        adapter.applyOptions({
            enabled: true,
            orderType: ChartOrderType.Stop,
            timeInForce: ChartOrderTimeInForce.Day,
            modifier: 'shift',
            title: 'STOP',
        });
        harness.emit({ shiftKey: true, ctrlKey: false });
        assert.equal(intents[0].order.type, ChartOrderType.Stop);
        assert.equal(intents[0].order.stopPrice, 100.01);
        assert.equal('price' in intents[0].order, false);
        assert.equal(harness.modes.at(-1).modifier, 'shift');

        const before = adapter.options();
        const modeCount = harness.modes.length;
        assert.throws(() => adapter.applyOptions({ quantity: 1.05 }), /quantityStep/);
        assert.equal(adapter.options().quantity, before.quantity);
        assert.equal(adapter.options().title, before.title);
        assert.equal(harness.modes.length, modeCount);
    });

    it('supports host side filtering and releases only its compatibility subscription', () => {
        const harness = chartHarness();
        const trading = layer();
        const adapter = new TradingOrderPlacementAdapter(harness.chart, trading, {
            quantity: 1,
            sideResolver: event => event.altKey ? TradingSide.Sell : null,
        });
        harness.emit();
        assert.equal(trading.pendingIntents().length, 0);
        harness.emit({ altKey: true });
        const pending = trading.pendingIntents()[0];
        assert.equal(pending.order.side, TradingSide.Sell);
        trading.resolveIntent({
            intentId: pending.intentId,
            status: TradingIntentOutcomeStatus.Accepted,
        });

        adapter.setEnabled(false);
        harness.emit({ altKey: true });
        assert.equal(trading.pendingIntents().length, 0);
        adapter.dispose();
        adapter.dispose();
        assert.equal(harness.listenerCount(), 0);
        assert.throws(() => adapter.setEnabled(true), /disposed/);
    });
});
