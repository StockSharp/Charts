const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { ChartModel } = require('../src/core/model/chart-model.js');
const { SeriesModel } = require('../src/core/model/series-model.js');
const { TimeScaleModel } = require('../src/core/scale/time-scale.js');

describe('ChartModel', () => {
    it('owns one main pane, stable pane ids and series membership', () => {
        const model = new ChartModel();
        const first = model.addPane();
        const custom = model.addPane({ id: 'oscillator', order: 1 });
        const second = model.addPane();
        const mainSeries = { name: 'price' };
        const paneSeries = { name: 'rsi' };

        model.addSeries(mainSeries);
        model.addSeries(paneSeries, custom);
        model.removePane(first);

        assert.equal(model.mainPane.id, 'main');
        assert.equal(first.id, 'pane-1');
        assert.equal(second.id, 'pane-2');
        assert.deepEqual(model.series, [mainSeries, paneSeries]);
        assert.equal(model.paneForSeries(paneSeries), custom);
        assert.throws(() => model.removePane(model.mainPane), /main pane cannot be removed/);
    });
});

describe('SeriesModel', () => {
    it('sorts snapshots and accepts only tail updates', () => {
        const series = new SeriesModel();
        series.replaceData([{ time: 3, value: 3 }, { time: 1, value: 1 }]);
        assert.deepEqual(series.data.map((item) => item.time), [1, 3]);

        assert.equal(series.updateTail({ time: 3, value: 30 }), true);
        assert.equal(series.updateTail({ time: 2, value: 20 }), false);
        assert.equal(series.updateTail({ time: 4, value: 40 }), true);
        assert.deepEqual(series.data.map((item) => item.value), [1, 30, 40]);
    });
});

describe('TimeScaleModel', () => {
    it('keeps one bounded visible range as data and panes change', () => {
        const scale = new TimeScaleModel();
        scale.updateDataRange(100, 200);
        assert.deepEqual(scale.visibleRange, { from: 100, to: 200 });

        scale.setVisibleRange({ from: 120, to: 160 });
        scale.updateDataRange(100, 220);
        assert.deepEqual(scale.visibleRange, { from: 120, to: 160 });

        scale.setVisibleRange({ from: -1000, to: 1000 });
        assert.ok(scale.visibleRange.from >= 40);
        assert.ok(scale.visibleRange.to <= 280);
    });
});
