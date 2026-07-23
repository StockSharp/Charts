const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { IndicatorEngine } = require('../src/chart/indicators/indicator-engine.js');

function series(owner) {
    let scaleId = 'right';
    return {
        owner,
        applyOptions(options) {
            if (options.priceScaleId !== undefined) scaleId = options.priceScaleId;
        },
        scaleId: () => scaleId,
    };
}

function setup() {
    const removedPanes = [];
    const tombstones = new Map();
    const panes = new Map();
    const addPane = (id) => {
        const chart = {
            id,
            priceScale: () => ({ applyOptions() {} }),
        };
        panes.set(id, chart);
        return chart;
    };
    addPane('pane-a');
    addPane('pane-b');
    let nextPane = 1;
    const paneManager = {
        setSpineFromCandles() {},
        appendSpineCandle() {},
        getChart: id => panes.get(id) ?? null,
        addPane() {
            const id = `new-pane-${nextPane++}`;
            addPane(id);
            return id;
        },
        removePane(id) {
            const pane = panes.get(id);
            if (pane) tombstones.set(id, pane);
            removedPanes.push(id);
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
    const renderer = {
        _last: [],
        render(entry, _data, paneChart) {
            const item = series(paneChart?.id ?? 'main');
            this._last = [item];
            return [item];
        },
        getLastColors: () => ['#fff'],
        prepareRuntime() {},
        update() {},
        updateRuntime: () => true,
        removeSeries() {},
        moveSeries(entry, paneChart) {
            for (const item of entry.seriesRefs) item.owner = paneChart?.id ?? 'main';
        },
    };
    const engine = new IndicatorEngine();
    engine.setRenderer(renderer);
    engine.setPaneManager(paneManager);
    engine.setCandles([]);
    return { engine, panes, removedPanes };
}

describe('indicator pane movement', () => {
    it('moves painter series without replacing runtime or series identity', () => {
        const { engine, removedPanes } = setup();
        const first = engine.add('RelativeStrengthIndex', { length: 14 }, 'pane-a');
        const second = engine.add('StochasticOscillator', {
            kPeriod: 14, dPeriod: 3, smooth: 3,
        }, 'pane-a');
        const firstSeries = first.seriesRefs[0];
        const secondSeries = second.seriesRefs[0];
        const firstRuntime = first.runtime;
        const secondRuntime = second.runtime;
        assert.equal(first.paneScaleId, 'right');
        assert.equal(second.paneScaleId, `indicator:${second.persistenceId}`);
        assert.equal(engine.setScale(first.id, 'left'), true);
        assert.equal(firstSeries.scaleId(), 'left');
        assert.equal(secondSeries.scaleId(), 'right');
        assert.equal(engine.setScale(first.id, null), true);
        assert.equal(firstSeries.scaleId(), 'right');
        assert.equal(secondSeries.scaleId(), `indicator:${second.persistenceId}`);

        assert.equal(engine.move(first.id, 'pane-b'), true);
        assert.equal(first.seriesRefs[0], firstSeries);
        assert.equal(first.runtime, firstRuntime);
        assert.equal(first.paneId, 'pane-b');
        assert.equal(firstSeries.owner, 'pane-b');
        assert.equal(firstSeries.scaleId(), 'right');
        assert.equal(second.paneScaleId, 'right');
        assert.equal(secondSeries.scaleId(), 'right');
        assert.deepEqual(removedPanes, []);

        assert.equal(engine.move(second.id, '__main__'), true);
        assert.equal(second.seriesRefs[0], secondSeries);
        assert.equal(second.runtime, secondRuntime);
        assert.equal(second.paneId, null);
        assert.equal(secondSeries.owner, 'main');
        assert.deepEqual(removedPanes, ['pane-a']);
        assert.equal(engine.move(second.id, '__main__'), false);
    });

    it('creates a requested pane and removes the emptied source pane', () => {
        const { engine, panes, removedPanes } = setup();
        const entry = engine.add('RelativeStrengthIndex', { length: 14 }, 'pane-b');
        const runtime = entry.runtime;
        const outputSeries = entry.seriesRefs[0];
        assert.equal(engine.setScale(entry.id, 'left'), true);
        assert.equal(outputSeries.scaleId(), 'left');

        assert.equal(engine.move(entry.id, '__new__'), true);
        assert.match(entry.paneId, /^new-pane-/);
        assert.equal(panes.has(entry.paneId), true);
        assert.equal(entry.runtime, runtime);
        assert.equal(entry.seriesRefs[0], outputSeries);
        assert.equal(outputSeries.owner, entry.paneId);
        assert.equal(outputSeries.scaleId(), 'left');
        assert.deepEqual(removedPanes, ['pane-b']);
        assert.equal(engine.setScale(entry.id, null), true);
        assert.equal(outputSeries.scaleId(), 'right');
        assert.equal(engine.setScale(entry.id, null), false);
        assert.throws(() => engine.setScale(entry.id, '  '), /price scale id/);
    });

    it('restores an emptied pane by id for an undo move', () => {
        const { engine, panes, removedPanes } = setup();
        const entry = engine.add('RelativeStrengthIndex', { length: 14 }, 'pane-a');

        assert.equal(engine.move(entry.id, '__main__'), true);
        assert.equal(panes.has('pane-a'), false);
        assert.equal(engine.move(entry.id, 'pane-a'), true);
        assert.equal(panes.has('pane-a'), true);
        assert.equal(entry.paneId, 'pane-a');
        assert.equal(entry.seriesRefs[0].owner, 'pane-a');
        assert.deepEqual(removedPanes, ['pane-a']);
    });

    it('restores a sole pane and row order when parameters recreate the runtime', () => {
        const { engine, panes, removedPanes } = setup();
        const first = engine.add('RelativeStrengthIndex', {
            length: 14,
        }, 'pane-a', { persistenceId: 'rsi-first' });
        engine.add('SimpleMovingAverage', {
            length: 10,
        }, '__main__', { persistenceId: 'sma-second' });

        const replacement = engine.replaceParams(first.id, { length: 21 });
        assert.equal(replacement.persistenceId, 'rsi-first');
        assert.equal(replacement.params.length, 21);
        assert.equal(replacement.paneId, 'pane-a');
        assert.equal(replacement.seriesRefs[0].owner, 'pane-a');
        assert.equal(panes.has('pane-a'), true);
        assert.deepEqual(engine.getIndicators().map(entry => entry.persistenceId), [
            'rsi-first', 'sma-second',
        ]);
        assert.deepEqual(removedPanes, ['pane-a']);
    });
});
