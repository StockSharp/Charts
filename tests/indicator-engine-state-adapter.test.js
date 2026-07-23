const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

global.SSChart = {
    LineSeries: { type: 'Line' },
    HistogramSeries: { type: 'Histogram' },
    AreaSeries: { type: 'Area' },
    BandSeries: { type: 'Band' },
};

const { IndicatorEngineStateAdapter } = require('../src/persistence/index.js');
const { IndicatorEngine } = require('../src/chart/indicators/indicator-engine.js');
const { IndicatorRenderer } = require('../src/chart/indicators/indicator-renderer.js');

function styleSeries(initial) {
    let value = { ...initial };
    return {
        options: () => ({ ...value }),
        applyOptions(patch) { value = { ...value, ...patch }; },
    };
}

function fakeEngine() {
    const line = styleSeries({
        id: 'runtime-line', persist: false, priceScaleId: 'right',
        color: '#111111', lineWidth: 2,
    });
    const entries = [{
        id: 7,
        persistenceId: 'rsi-primary',
        type: 'RelativeStrengthIndex',
        paneId: 'study',
        priceScaleId: 'rsi-scale',
        params: { length: 14, optional: undefined },
        seriesRefs: [line],
        styleSources: { value: line },
        outputNames: ['value'],
        legendSources: { value: { series: line, field: 'value' } },
        colors: ['#111111'],
    }];
    const calls = [];
    return {
        entries,
        calls,
        getIndicators: () => [...entries],
        removeAll() { calls.push(['clear']); entries.splice(0); },
        add(type, params, targetPaneId, persistence) {
            calls.push(['add', type, targetPaneId, persistence.persistenceId]);
            if (type === 'UnavailableIndicator') return null;
            const restoredLine = styleSeries({ color: '#default', lineWidth: 1 });
            const entry = {
                id: 8,
                persistenceId: persistence.persistenceId,
                type,
                paneId: targetPaneId === '__main__' ? null : targetPaneId,
                priceScaleId: persistence.priceScaleId,
                params,
                seriesRefs: [restoredLine],
                styleSources: { value: restoredLine },
                outputNames: ['value'],
                legendSources: { value: { series: restoredLine, field: 'value' } },
                colors: ['#default'],
            };
            entries.push(entry);
            return entry;
        },
        setVisible(id, visible) {
            const entry = entries.find(candidate => candidate.id === id);
            if (!entry || entry.visible === visible) return false;
            entry.visible = visible;
            for (const series of new Set(Object.values(entry.styleSources || {})))
                series.applyOptions({ visible });
            calls.push(['visible', id, visible]);
            return true;
        },
    };
}

function rendererChart() {
    const series = [];
    return {
        series,
        addSeries(_definition, initial = {}) {
            let options = { ...initial };
            const item = {
                data: [],
                options: () => ({ ...options }),
                applyOptions(patch) { options = { ...options, ...patch }; },
                setData(data) { this.data = [...data]; },
                update(point) { this.data.push(point); },
                pop(count = 1) { return this.data.splice(-count, count); },
                createPriceLine() {},
            };
            series.push(item);
            return item;
        },
        removeSeries(item) {
            const index = series.indexOf(item);
            if (index >= 0) series.splice(index, 1);
        },
    };
}

describe('IndicatorEngineStateAdapter', () => {
    it('captures stable config and semantic styles without runtime metadata', () => {
        const engine = fakeEngine();
        const adapter = new IndicatorEngineStateAdapter({ engine });
        const snapshot = adapter.capture();

        assert.deepEqual(snapshot, [{
            id: 'rsi-primary',
            type: 'RelativeStrengthIndex',
            paneId: 'study',
            priceScaleId: 'rsi-scale',
            params: { length: 14 },
            styles: { value: { color: '#111111', lineWidth: 2 } },
        }]);
        assert.equal(JSON.stringify(snapshot).includes('seriesRefs'), false);
    });

    it('restores after an explicit clear, maps panes and skips unavailable plugins', async () => {
        const engine = fakeEngine();
        const unknownIndicators = [];
        const unknownStyles = [];
        const adapter = new IndicatorEngineStateAdapter({
            engine,
            resolveTargetPaneId: indicator => indicator.paneId === null ? '__main__' : `mapped-${indicator.paneId}`,
            onUnknownIndicator: indicator => unknownIndicators.push(indicator.id),
            onUnknownStyle: (indicator, styleId) => unknownStyles.push(`${indicator.id}:${styleId}`),
        });
        const known = {
            id: 'rsi-primary', type: 'RelativeStrengthIndex', paneId: 'study',
            params: { length: 21 },
            styles: {
                value: { color: '#7e57c2', lineWidth: 3 },
                removedOutput: { color: '#fff' },
            },
        };
        const unavailable = {
            id: 'plugin-study', type: 'UnavailableIndicator', paneId: null,
            params: {}, styles: {},
        };

        await adapter.clear();
        await adapter.restore([known, unavailable]);

        assert.deepEqual(engine.calls, [
            ['clear'],
            ['add', 'RelativeStrengthIndex', 'mapped-study', 'rsi-primary'],
            ['add', 'UnavailableIndicator', '__main__', 'plugin-study'],
        ]);
        assert.equal(engine.entries[0].persistenceId, 'rsi-primary');
        assert.deepEqual(engine.entries[0].styleSources.value.options(), {
            color: '#7e57c2', lineWidth: 3,
        });
        assert.deepEqual(engine.entries[0].colors, ['#7e57c2']);
        assert.deepEqual(unknownIndicators, ['plugin-study']);
        assert.deepEqual(unknownStyles, ['rsi-primary:removedOutput']);
    });

    it('validates the complete restore plan before adding an indicator', async () => {
        const engine = fakeEngine();
        engine.calls.splice(0);
        const adapter = new IndicatorEngineStateAdapter({ engine });
        await assert.rejects(adapter.restore([
            {
                id: 'valid', type: 'RelativeStrengthIndex', paneId: null,
                params: { length: 14 }, styles: { value: { color: '#fff' } },
            },
            {
                id: 'invalid', type: 'RelativeStrengthIndex', paneId: null,
                params: { length: 14 }, styles: { value: '#fff' },
            },
        ]), /style 'value' must be an object/);
        assert.deepEqual(engine.calls, []);
    });

    it('round-trips built-in multi-series styles and keeps the id on parameter edit', async () => {
        const chart = rendererChart();
        const engine = new IndicatorEngine();
        engine.setRenderer(new IndicatorRenderer(chart));
        engine.setCandles([]);
        const entry = engine.add('Ichimoku', {
            tenkan: 9, kijun: 26, senkouB: 52,
        }, '__main__', { persistenceId: 'cloud-primary' });
        assert.throws(() => engine.add('Ichimoku', {
            tenkan: 9, kijun: 26, senkouB: 52,
        }, '__main__', { persistenceId: 'cloud-primary' }), /duplicate indicator persistence id/);
        const runtime = entry.runtime;
        const seriesRefs = [...entry.seriesRefs];
        assert.equal(engine.setOutputStyle(entry.id, 'tenkan', {
            color: '#abcdef', lineWidth: 3, lineStyle: 1, precision: 4, visible: false,
        }), true);
        assert.equal(engine.setScale(entry.id, 'ichimoku-scale'), true);
        assert.equal(engine.setScale(entry.id, 'ichimoku-scale'), false);
        assert.equal(engine.setOutputStyle(entry.id, 'senkouA', {
            color: '#00aa00', lineWidth: 4, lineStyle: 2, visible: false,
        }), true);
        assert.equal(engine.setOutputStyle(entry.id, 'removedOutput', { color: '#fff' }), false);
        assert.throws(() => engine.setOutputStyle(entry.id, 'tenkan', { precision: 13 }), /precision/);
        assert.equal(entry.runtime, runtime);
        assert.deepEqual(entry.seriesRefs, seriesRefs);
        assert.deepEqual(entry.styleSources.tenkan.options().priceFormat, { precision: 4 });
        assert.equal(entry.styleSources.cloud.options().upperColor, '#00aa00');
        assert.equal(entry.styleSources.cloud.options().upperLineWidth, 4);
        assert.equal(entry.styleSources.cloud.options().upperLineStyle, 2);
        assert.equal(entry.styleSources.cloud.options().upperLineVisible, false);
        const styles = engine.getStyles(entry.id);
        assert.equal(styles.tenkan.color, '#abcdef');
        assert.equal(Object.isFrozen(styles), true);
        assert.equal(Object.isFrozen(styles.tenkan), true);
        assert.deepEqual(Object.keys(engine.getValuesAt()[0].values), [
            'kijun', 'senkouB', 'chikou',
        ]);

        entry.styleSources.cloud.applyOptions({
            lowerColor: '#aa0000',
            positiveFillColor: 'rgba(0,170,0,.2)',
        });
        assert.equal(engine.setVisible(entry.id, false), true);
        assert.equal(entry.runtime, runtime);
        assert.deepEqual(entry.seriesRefs, seriesRefs);
        assert.ok(entry.seriesRefs.every(series => series.options().visible === false));
        assert.equal(engine.setVisible(entry.id, false), false);
        assert.equal(engine.setOutputStyle(entry.id, 'chikou', { visible: false }), true);
        assert.equal(entry.styleSources.chikou.options().visible, false);
        assert.deepEqual(engine.getValuesAt(), []);

        const adapter = new IndicatorEngineStateAdapter({ engine });
        const snapshot = adapter.capture();
        assert.equal(snapshot[0].visible, false);
        assert.equal(snapshot[0].priceScaleId, 'ichimoku-scale');
        assert.equal(snapshot[0].styles.tenkan.color, '#abcdef');
        assert.equal(snapshot[0].styles.tenkan.visible, false);
        assert.equal(snapshot[0].styles.kijun.visible, undefined);
        assert.equal(snapshot[0].styles.cloud.upperColor, '#00aa00');
        assert.equal(snapshot[0].styles.cloud.lowerColor, '#aa0000');
        assert.equal(snapshot[0].styles.cloud.upperLineVisible, false);
        assert.equal(snapshot[0].styles.cloud.visible, undefined);
        assert.equal(snapshot[0].styles.chikou.visible, false);

        await adapter.clear();
        await adapter.restore(snapshot);
        const restored = engine.getIndicators()[0];
        assert.equal(restored.persistenceId, 'cloud-primary');
        assert.equal(restored.priceScaleId, 'ichimoku-scale');
        assert.ok(restored.seriesRefs.every(series => (
            series.options().priceScaleId === 'ichimoku-scale'
        )));
        assert.equal(restored.styleSources.tenkan.options().color, '#abcdef');
        assert.equal(restored.styleSources.cloud.options().upperColor, '#00aa00');
        assert.equal(restored.styleSources.cloud.options().upperLineWidth, 4);
        assert.equal(restored.styleSources.cloud.options().upperLineVisible, false);
        assert.equal(restored.visible, false);
        assert.ok(restored.seriesRefs.every(series => series.options().visible === false));
        assert.deepEqual(engine.getValuesAt(), []);
        assert.deepEqual(restored.colors, [
            '#abcdef', '#1E90FF', '#00aa00', '#aa0000', '#EE82EE',
        ]);

        assert.equal(engine.setVisible(restored.id, true), true);
        assert.equal(restored.styleSources.tenkan.options().visible, false);
        assert.equal(restored.styleSources.kijun.options().visible, true);
        assert.equal(restored.styleSources.cloud.options().visible, true);
        assert.equal(restored.styleSources.cloud.options().upperLineVisible, false);
        assert.equal(restored.styleSources.chikou.options().visible, false);
        assert.equal(engine.setVisible(restored.id, false), true);
        const edited = await engine.replaceParams(restored.id, { tenkan: 10 });
        assert.equal(edited.persistenceId, 'cloud-primary');
        assert.equal(edited.priceScaleId, 'ichimoku-scale');
        assert.equal(edited.visible, false);
        assert.ok(edited.seriesRefs.every(series => series.options().visible === false));
        assert.equal(edited.styleSources.tenkan.options().color, '#abcdef');
        assert.deepEqual(edited.styleSources.tenkan.options().priceFormat, { precision: 4 });
        assert.equal(edited.styleSources.cloud.options().lowerColor, '#aa0000');
        assert.equal(edited.styleSources.cloud.options().upperLineVisible, false);
        const editedSnapshot = adapter.capture()[0];
        assert.equal(editedSnapshot.visible, false);
        assert.equal(editedSnapshot.styles.tenkan.visible, false);
        assert.equal(editedSnapshot.styles.kijun.visible, undefined);
        assert.equal(engine.setVisible(edited.id, true), true);
        assert.equal(edited.styleSources.tenkan.options().visible, false);
        assert.equal(edited.styleSources.kijun.options().visible, true);
        assert.equal(edited.styleSources.chikou.options().visible, false);
        assert.equal(engine.setScale(edited.id, null), true);
        assert.equal(edited.priceScaleId, undefined);
        assert.equal(adapter.capture()[0].priceScaleId, undefined);
    });

    it('keeps stable indicator order when parameter replacement recreates a runtime', async () => {
        const chart = rendererChart();
        const engine = new IndicatorEngine();
        engine.setRenderer(new IndicatorRenderer(chart));
        engine.setCandles([]);
        const first = engine.add('BollingerBands', {
            length: 20, stdDev: 2,
        }, '__main__', { persistenceId: 'bands-first' });
        engine.add('RelativeStrengthIndex', {
            length: 14,
        }, '__main__', { persistenceId: 'rsi-second' });

        const replacement = await engine.replaceParams(first.id, { length: 21 });
        assert.deepEqual(engine.getIndicators().map(entry => entry.persistenceId), [
            'bands-first', 'rsi-second',
        ]);
        assert.equal(replacement.params.length, 21);
    });
});
