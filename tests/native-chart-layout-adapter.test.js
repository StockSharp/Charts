const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { NativeChartLayoutAdapter } = require('../src/persistence/index.js');

function scale(initial = {}) {
    let value = {
        scaleMargins: { top: 0, bottom: 0 },
        mode: 0,
        autoScale: true,
        ...initial,
    };
    return {
        applyOptions(patch) {
            value = {
                ...value,
                ...patch,
                scaleMargins: { ...value.scaleMargins, ...(patch.scaleMargins ?? {}) },
            };
        },
        options: () => ({ ...value, scaleMargins: { ...value.scaleMargins } }),
    };
}

function fakeSeries(id, type, options = {}) {
    return {
        id: () => id,
        type: () => type,
        options: () => ({ ...options, id }),
        priceScaleId: () => options.priceScaleId ?? 'right',
    };
}

function pane(chart, options) {
    const series = [];
    const scales = new Map([['right', scale()]]);
    let state = { height: 160, minHeight: 48, order: 0, state: 'normal', ...options };
    return {
        id: () => state.id,
        options: () => ({ ...state }),
        applyOptions(patch) { state = { ...state, ...patch }; },
        series: () => [...series],
        priceScaleIds: () => [...scales.keys()],
        priceScale(id = 'right') {
            if (!scales.has(id)) scales.set(id, scale());
            return scales.get(id);
        },
        addSeries(definition, seriesOptions = {}) {
            const item = fakeSeries(
                seriesOptions.id ?? `${definition.type}-${series.length + 1}`,
                definition.type,
                seriesOptions,
            );
            series.push(item);
            return item;
        },
        _series: series,
    };
}

function setupChart() {
    let options = {
        autoSize: true,
        width: 900,
        layout: { background: { color: '#111' }, textColor: '#ddd' },
        timeScale: {
            mode: 'ordinal',
            timeZone: 'UTC',
            calendar: { schedule() {} },
            formatter() {},
        },
    };
    const chart = {
        _panes: [],
        panes() { return [...this._panes].sort((a, b) => a.options().order - b.options().order); },
        options: () => options,
        applyOptions(patch) { options = { ...options, ...patch }; },
        addPane(paneOptions = {}) {
            const created = pane(this, paneOptions);
            this._panes.push(created);
            return created;
        },
        removePane(target) { this._panes.splice(this._panes.indexOf(target), 1); },
        removeSeries(target) {
            for (const candidate of this._panes) {
                const index = candidate._series.indexOf(target);
                if (index >= 0) candidate._series.splice(index, 1);
            }
        },
    };
    const main = chart.addPane({ id: 'main', height: 500, minHeight: 80, order: 0, state: 'normal' });
    const study = chart.addPane({ id: 'study', height: 140, minHeight: 60, order: 1, state: 'normal' });
    main.priceScale('right').applyOptions({
        mode: 1,
        autoScale: false,
        scaleMargins: { top: 0.1, bottom: 0.2 },
    });
    main._series.push(fakeSeries('price', 'Candlestick', {
        priceScaleId: 'right', upColor: '#0f0', priceFormat: { precision: 2 },
    }));
    study._series.push(fakeSeries('rsi-output', 'Line', {
        priceScaleId: 'right', color: '#f0f', persist: false,
    }));
    return { chart, main, study };
}

describe('NativeChartLayoutAdapter', () => {
    it('captures pane/scales and stable series metadata without data or runtime callbacks', () => {
        const { chart } = setupChart();
        const adapter = new NativeChartLayoutAdapter({ chart });
        const snapshot = adapter.capture();

        assert.equal(snapshot.chartOptions.width, undefined);
        assert.equal(snapshot.chartOptions.timeScale.calendar, undefined);
        assert.equal(snapshot.chartOptions.timeScale.formatter, undefined);
        assert.equal(snapshot.chartOptions.timeScale.timeZone, 'UTC');
        assert.deepEqual(snapshot.panes[0].priceScales[0], {
            id: 'right', mode: 1, autoScale: false,
            scaleMargins: { top: 0.1, bottom: 0.2 },
        });
        assert.deepEqual(snapshot.series, [{
            id: 'price',
            type: 'Candlestick',
            paneId: 'main',
            priceScaleId: 'right',
            options: { upColor: '#0f0', priceFormat: { precision: 2 } },
        }]);
        assert.equal(JSON.stringify(snapshot).includes('data'), false);
    });

    it('reconciles native panes and recreates persisted registry series with stable ids', async () => {
        const { chart } = setupChart();
        const unknown = [];
        const adapter = new NativeChartLayoutAdapter({
            chart,
            onUnknownSeries: series => unknown.push(series.id),
        });
        const snapshot = adapter.capture();
        const withUnknown = {
            ...snapshot,
            series: [...snapshot.series, {
                id: 'plugin', type: 'UnavailableSeries', paneId: 'main',
                priceScaleId: 'right', options: {},
            }],
        };
        chart.addPane({ id: 'temporary', order: 9 });

        await adapter.restore(withUnknown);
        assert.deepEqual(chart.panes().map(item => item.id()), ['main', 'study']);
        assert.deepEqual(chart.panes()[0].series().map(item => item.id()), ['price']);
        assert.equal(chart.panes()[0].series()[0].type(), 'Candlestick');
        assert.deepEqual(unknown, ['plugin']);
        assert.deepEqual(chart.panes()[0].priceScale('right').options(), {
            mode: 1,
            autoScale: false,
            scaleMargins: { top: 0.1, bottom: 0.2 },
        });
    });

    it('lets the host recreate and wire series data sources', async () => {
        const { chart } = setupChart();
        const captured = new NativeChartLayoutAdapter({ chart }).capture();
        const calls = [];
        const adapter = new NativeChartLayoutAdapter({
            chart,
            async createSeries(series, targetPane) {
                calls.push([series.id, targetPane.id()]);
                targetPane.addSeries({ type: series.type }, {
                    ...series.options,
                    id: series.id,
                    priceScaleId: series.priceScaleId,
                });
            },
        });
        await adapter.restore(captured);
        assert.deepEqual(calls, [['price', 'main']]);
        assert.deepEqual(chart.panes()[0].series().map(item => item.id()), ['price']);
    });

    it('restores a layout whose root pane was reordered away from index zero', async () => {
        const { chart, main, study } = setupChart();
        main.applyOptions({ order: 1 });
        study.applyOptions({ order: 0 });
        const adapter = new NativeChartLayoutAdapter({ chart });
        const captured = adapter.capture();

        await adapter.restore(captured);

        assert.deepEqual(chart.panes().map(item => item.id()), ['study', 'main']);
        assert.equal(chart.panes().find(item => item.id() === 'main'), main);
    });
});
