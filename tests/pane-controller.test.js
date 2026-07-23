const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { CommandStack } = require('../src/core/interaction/command-stack.js');
const { PaneController } = require('../src/workspace/index.js');

function pane(initial) {
    let options = { state: 'normal', ...initial };
    const seriesIdentity = { pane: initial.id };
    const series = [seriesIdentity];
    return {
        seriesIdentity,
        _series: series,
        id: () => initial.id,
        options: () => ({ ...options }),
        applyOptions(patch) { options = { ...options, ...patch }; },
        series: () => [...series],
    };
}

function setup() {
    const commands = new CommandStack();
    const items = [
        pane({ id: 'main', height: 300, minHeight: 100, order: 0 }),
        pane({ id: 'volume', height: 120, minHeight: 40, order: 1 }),
        pane({ id: 'rsi', height: 150, minHeight: 60, order: 2 }),
    ];
    const chart = {
        panes: () => [...items].sort((left, right) => (
            left.options().order - right.options().order
        )),
        commandStack: () => commands,
        moveSeries(series, target) {
            for (const item of items) {
                const index = item._series.indexOf(series);
                if (index >= 0) item._series.splice(index, 1);
            }
            target._series.push(series);
        },
    };
    return { chart, commands, controller: new PaneController({ chart }), items };
}

describe('PaneController', () => {
    it('resizes an adjacent pair within minimums and records one undo command', () => {
        const { controller, commands, items } = setup();
        const identities = items.map(item => item.series()[0]);
        assert.equal(controller.resizePair('main', 'volume', 1_000), true);
        assert.equal(items[0].options().height, 380);
        assert.equal(items[1].options().height, 40);
        assert.equal(commands.snapshot().undoLabel, 'Resize panes');

        assert.equal(commands.undo(), true);
        assert.equal(items[0].options().height, 300);
        assert.equal(items[1].options().height, 120);
        assert.equal(commands.redo(), true);
        assert.equal(items[0].options().height, 380);
        assert.deepEqual(items.map(item => item.series()[0]), identities);
    });

    it('reorders panes without replacing panes or their series', () => {
        const { chart, controller, commands, items } = setup();
        const identities = new Map(items.map(item => [item.id(), item.series()[0]]));
        assert.equal(controller.reorder('rsi', 0), true);
        assert.deepEqual(chart.panes().map(item => item.id()), ['rsi', 'main', 'volume']);
        for (const item of items) assert.equal(item.series()[0], identities.get(item.id()));
        assert.equal(commands.snapshot().undoLabel, 'Reorder pane');

        commands.undo();
        assert.deepEqual(chart.panes().map(item => item.id()), ['main', 'volume', 'rsi']);
        commands.redo();
        assert.deepEqual(chart.panes().map(item => item.id()), ['rsi', 'main', 'volume']);
    });

    it('minimizes, maximizes and restores state through shared command history', () => {
        const { controller, commands } = setup();
        const notifications = [];
        controller.subscribe(panes => notifications.push(panes.map(item => item.state)));

        assert.equal(controller.toggleMinimized('volume'), true);
        assert.equal(controller.panes().find(item => item.id === 'volume').state, 'minimized');
        commands.undo();
        assert.equal(controller.panes().find(item => item.id === 'volume').state, 'normal');

        assert.equal(controller.toggleMaximized('rsi'), true);
        assert.deepEqual(controller.panes().map(item => item.state), ['normal', 'normal', 'maximized']);
        assert.equal(controller.toggleMaximized('rsi'), true);
        assert.deepEqual(controller.panes().map(item => item.state), ['normal', 'normal', 'normal']);
        assert.equal(notifications.length, 4);
    });

    it('moves one series instance between panes and restores ownership on undo', () => {
        const { controller, commands, items } = setup();
        const series = items[0].seriesIdentity;
        assert.equal(controller.moveSeries(series, 'rsi'), true);
        assert.equal(items[0].series().includes(series), false);
        assert.equal(items[2].series()[1], series);
        assert.equal(commands.snapshot().undoLabel, 'Move series');

        commands.undo();
        assert.equal(items[0].series()[0], series);
        assert.equal(items[2].series().includes(series), false);
        commands.redo();
        assert.equal(items[2].series()[1], series);
    });

    it('rejects non-adjacent resize and invalid reorder targets before mutation', () => {
        const { controller, commands } = setup();
        assert.throws(() => controller.resizePair('main', 'rsi', 10), /adjacent panes/);
        assert.throws(() => controller.reorder('rsi', 4), /outside the pane list/);
        assert.equal(commands.snapshot().undoCount, 0);
    });
});
