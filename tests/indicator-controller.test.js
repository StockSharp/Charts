const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

global.SSChart = {
    LineSeries: { type: 'Line' },
    HistogramSeries: { type: 'Histogram' },
    AreaSeries: { type: 'Area' },
    BandSeries: { type: 'Band' },
};

const { CommandStack } = require('../src/core/interaction/command-stack.js');
const { IndicatorEngine } = require('../src/chart/indicators/indicator-engine.js');
const { IndicatorRenderer } = require('../src/chart/indicators/indicator-renderer.js');
const { IndicatorController } = require('../src/workspace/index.js');

function chart(id, main = false) {
    const series = [];
    const pane = { id: () => 'main' };
    return {
        id,
        series,
        addSeries(_definition, initial = {}) {
            let options = { ...initial };
            const item = {
                owner: id,
                options: () => ({ ...options }),
                applyOptions(patch) { options = { ...options, ...patch }; },
                setData() {},
                update() {},
                pop() { return []; },
                createPriceLine() {},
            };
            series.push(item);
            return item;
        },
        adoptSeries(item) { item.owner = id; },
        moveSeries(item, target) { item.owner = target.id(); },
        panes: () => main ? [pane] : [],
        removeSeries(item) {
            const index = series.indexOf(item);
            if (index >= 0) series.splice(index, 1);
        },
        priceScale: () => ({ applyOptions() {} }),
    };
}

function setup() {
    const commands = new CommandStack();
    const main = chart('main', true);
    const panes = new Map([
        ['pane-a', chart('pane-a')],
        ['pane-b', chart('pane-b')],
    ]);
    const tombstones = new Map();
    let nextPane = 1;
    const paneManager = {
        setSpineFromCandles() {},
        appendSpineCandle() {},
        getChart: id => panes.get(id) ?? null,
        addPane() {
            const id = `new-${nextPane++}`;
            panes.set(id, chart(id));
            return id;
        },
        removePane(id) {
            const pane = panes.get(id);
            if (pane) tombstones.set(id, pane);
            panes.delete(id);
        },
        restorePane(id) {
            const pane = tombstones.get(id);
            if (!pane) return null;
            panes.set(id, pane);
            tombstones.delete(id);
            return id;
        },
    };
    const engine = new IndicatorEngine();
    engine.setRenderer(new IndicatorRenderer(main));
    engine.setPaneManager(paneManager);
    engine.setCandles([]);
    const cloud = engine.add('Ichimoku', {
        tenkan: 9, kijun: 26, senkouB: 52,
    }, '__main__', { persistenceId: 'cloud-primary' });
    const anchor = engine.add('RelativeStrengthIndex', {
        length: 14,
    }, 'pane-b', { persistenceId: 'pane-anchor' });
    const controller = new IndicatorController({ engine, commandStack: commands });
    return { anchor, cloud, commands, controller, engine, panes };
}

describe('IndicatorController', () => {
    it('applies a complete edit atomically through stable ids and one undo command', () => {
        const { cloud, commands, controller, engine } = setup();
        const initialRuntimeId = cloud.id;
        const initial = controller.get('cloud-primary');
        assert.equal(Object.isFrozen(initial), true);
        assert.equal(Object.isFrozen(initial.outputs), true);
        assert.equal(initial.outputs.length, 5);
        assert.equal(initial.outputs[0].name, 'Tenkan');
        assert.equal(initial.priceScaleId, null);
        assert.equal(initial.effectivePriceScaleId, 'right');

        const notifications = [];
        controller.subscribe(items => notifications.push(items));
        const updated = controller.update('cloud-primary', {
            parameters: { tenkan: 10 },
            source: { kind: 'candle-field', field: 'hlc3' },
            paneId: 'pane-b',
            priceScaleId: 'left',
            visible: false,
            outputs: {
                tenkan: {
                    color: '#abcdef', lineWidth: 3, lineStyle: 1,
                    visible: false, precision: 4,
                },
                senkouA: { color: '#00aa00', visible: false },
            },
        });

        assert.equal(updated.id, 'cloud-primary');
        assert.equal(updated.parameters.tenkan, 10);
        assert.deepEqual(updated.source, { kind: 'candle-field', field: 'hlc3' });
        assert.equal(updated.paneId, 'pane-b');
        assert.equal(updated.priceScaleId, 'left');
        assert.equal(updated.effectivePriceScaleId, 'left');
        assert.equal(updated.visible, false);
        assert.deepEqual(updated.outputs.find(output => output.id === 'tenkan').style, {
            color: '#abcdef', lineWidth: 3, lineStyle: 1, visible: false, precision: 4,
        });
        assert.equal(updated.outputs.find(output => output.id === 'kijun').style.visible, true);
        assert.equal(updated.outputs.find(output => output.id === 'senkouA').style.visible, false);
        assert.notEqual(engine.getIndicators().find(entry => (
            entry.persistenceId === 'cloud-primary'
        )).id, initialRuntimeId);
        assert.equal(commands.snapshot().undoCount, 1);
        assert.equal(commands.snapshot().undoLabel, 'Update Ichimoku');
        assert.equal(notifications.length, 1);

        assert.equal(commands.undo(), true);
        const undone = controller.get('cloud-primary');
        assert.equal(undone.parameters.tenkan, 9);
        assert.deepEqual(undone.source, { kind: 'candles' });
        assert.equal(undone.paneId, null);
        assert.equal(undone.priceScaleId, null);
        assert.equal(undone.visible, true);
        assert.equal(undone.outputs.find(output => output.id === 'tenkan').style.color, '#FF6347');
        assert.equal(undone.outputs.find(output => output.id === 'tenkan').style.precision, undefined);

        assert.equal(commands.redo(), true);
        const redone = controller.get('cloud-primary');
        assert.equal(redone.parameters.tenkan, 10);
        assert.equal(redone.outputs.find(output => output.id === 'tenkan').style.precision, 4);
        assert.equal(redone.visible, false);
        assert.equal(notifications.length, 3);

        controller.setOutputStyle('cloud-primary', 'tenkan', { precision: null });
        assert.equal(controller.get('cloud-primary').outputs.find(output => (
            output.id === 'tenkan'
        )).style.precision, undefined);
    });

    it('rolls back earlier parameter and source mutations when a later field fails', () => {
        const { commands, controller } = setup();
        const before = controller.get('cloud-primary');

        assert.throws(() => controller.update('cloud-primary', {
            parameters: { tenkan: 11 },
            source: { kind: 'candle-field', field: 'close' },
            paneId: 'missing-pane',
        }), /target pane 'missing-pane' is unavailable/);

        assert.deepEqual(controller.get('cloud-primary'), before);
        assert.equal(commands.snapshot().undoCount, 0);
    });

    it('validates no-ops before recording and observes external engine changes until dispose', () => {
        const { commands, controller, engine } = setup();
        const events = [];
        controller.subscribe(items => events.push(items));
        const current = controller.get('cloud-primary');

        assert.deepEqual(controller.update('cloud-primary', {
            parameters: { tenkan: 9 },
            visible: true,
        }), current);
        assert.equal(commands.snapshot().undoCount, 0);
        assert.throws(() => controller.setParameters('cloud-primary', { tenkan: 0 }), /minimum/);
        assert.throws(() => controller.setOutputStyle('cloud-primary', 'missing', {
            color: '#fff',
        }), /output 'missing' is unavailable/);
        assert.throws(() => controller.moveToPane('cloud-primary', '__new__'), /not stable/);

        const runtimeId = engine.getIndicators().find(entry => (
            entry.persistenceId === 'cloud-primary'
        )).id;
        engine.setVisible(runtimeId, false);
        assert.equal(events.length, 1);
        assert.equal(events[0][0].visible, false);
        controller.dispose();
        engine.setVisible(runtimeId, true);
        assert.equal(events.length, 1);
        assert.throws(() => controller.indicators(), /disposed/);
    });

    it('undo restores a pane removed after its last indicator moved out', () => {
        const { commands, controller, panes } = setup();

        controller.moveToPane('pane-anchor', null);
        assert.equal(panes.has('pane-b'), false);
        assert.equal(controller.get('pane-anchor').paneId, null);
        assert.equal(commands.undo(), true);
        assert.equal(panes.has('pane-b'), true);
        assert.equal(controller.get('pane-anchor').paneId, 'pane-b');
        assert.equal(commands.redo(), true);
        assert.equal(panes.has('pane-b'), false);
    });
});
