const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { CommandStack } = require('../src/core/interaction/command-stack.js');
const {
    BuiltInDrawingType,
    DrawingController,
} = require('../src/drawings/index.js');
const {
    ChartStatePersistence,
    serializeChartState,
} = require('../src/persistence/index.js');

function setup() {
    const commands = new CommandStack();
    const pane = { id: () => 'main', series: () => [] };
    const chart = {
        panes: () => [pane],
        commandStack: () => commands,
        attachPrimitive() {},
        detachPrimitive() {},
    };
    const drawings = new DrawingController({ chart });
    let layoutSnapshot = {
        chartOptions: { layout: { textColor: '#ddd' } },
        panes: [{
            id: 'main', order: 0, height: 500, minHeight: 80, state: 'normal',
            priceScales: [{ id: 'right' }],
        }],
        series: [],
    };
    let indicators = [{
        id: 'rsi-1', type: 'RelativeStrengthIndex', paneId: null,
        params: { length: 14 },
        styles: { value: { color: '#7e57c2', lineWidth: 2 } },
    }];
    const restoreOrder = [];
    const layout = {
        capture: () => layoutSnapshot,
        restore(value) { restoreOrder.push('layout'); layoutSnapshot = value; },
    };
    const indicatorAdapter = {
        capture: () => indicators,
        clear() { restoreOrder.push('clear'); indicators = []; },
        restore(value) { restoreOrder.push('indicators'); indicators = [...value]; },
    };
    const values = new Map();
    const storage = {
        load: key => values.get(key) ?? null,
        save: (key, value) => { values.set(key, value); },
        remove: key => { values.delete(key); },
    };
    const persistence = new ChartStatePersistence({
        layout,
        indicators: indicatorAdapter,
        drawings,
        storage,
        key: context => `${context.layoutId}:${context.symbol}`,
    });
    return {
        commands,
        drawings,
        getIndicators: () => indicators,
        persistence,
        restoreOrder,
        values,
    };
}

describe('ChartStatePersistence', () => {
    it('uses a host key policy and storage while restoring components in dependency order', async () => {
        const value = setup();
        value.drawings.create(BuiltInDrawingType.HorizontalLine, [
            { time: 10, price: 100 },
        ], { id: 'support' });
        const context = { layoutId: 'desk', symbol: 'AAPL' };
        const saved = await value.persistence.save(context);
        assert.equal(value.values.has('desk:AAPL'), true);
        assert.equal(saved.drawings[0].id, 'support');

        value.drawings.clear();
        const loaded = await value.persistence.load(context);
        assert.deepEqual(value.restoreOrder, ['clear', 'layout', 'indicators']);
        assert.equal(loaded.state.indicators[0].params.length, 14);
        assert.deepEqual(value.getIndicators()[0].styles.value, {
            color: '#7e57c2', lineWidth: 2,
        });
        assert.deepEqual(value.drawings.drawings().map(item => item.id), ['support']);
        assert.equal(value.commands.snapshot().undoCount, 0);

        assert.equal(await value.persistence.load({ layoutId: 'desk', symbol: 'MSFT' }), null);
        await value.persistence.remove(context);
        assert.equal(value.values.has('desk:AAPL'), false);
    });

    it('skips an unavailable drawing plugin without dropping known drawings', async () => {
        const value = setup();
        const snapshot = value.persistence.snapshot();
        const restored = await value.persistence.restore({
            ...snapshot,
            drawings: [
                {
                    id: 'unknown', type: 'plugin-tool', paneId: 'main',
                    points: [{ time: 1, price: 2 }], options: {},
                    visible: true, locked: false, zOrder: 0,
                },
                {
                    id: 'line', type: BuiltInDrawingType.HorizontalLine, paneId: 'main',
                    points: [{ time: 10, price: 100 }],
                    options: { color: '#2962ff', lineWidth: 2, lineStyle: 0 },
                    visible: true, locked: false, zOrder: 1,
                },
            ],
        });

        assert.deepEqual(restored.drawings.skipped, [{
            id: 'unknown', type: 'plugin-tool', reason: 'unknown-type',
        }]);
        assert.deepEqual(value.drawings.drawings().map(item => item.id), ['line']);
    });

    it('validates adapter output and loaded storage values before mutation', async () => {
        const value = setup();
        value.values.set('desk:bad', 42);
        await assert.rejects(
            value.persistence.load({ layoutId: 'desk', symbol: 'bad' }),
            /must return a string or null/,
        );
        const invalid = {
            ...value.persistence.snapshot(),
            series: [{
                id: 'price', type: 'Candlestick', paneId: 'missing',
                priceScaleId: 'right', options: {},
            }],
        };
        assert.throws(() => serializeChartState(invalid), /missing pane/);
    });
});
