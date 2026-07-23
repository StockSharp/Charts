const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    CHART_STATE_SCHEMA_VERSION,
    ChartStateMigrationRegistry,
    deserializeChartState,
    normalizeChartStateV1,
    serializeChartState,
} = require('../src/persistence/index.js');

function state() {
    return {
        schemaVersion: 1,
        chartOptions: {
            layout: { backgroundColor: '#111', textColor: '#ddd' },
            timeScale: { mode: 'ordinal', timeZone: 'UTC' },
        },
        panes: [
            {
                id: 'main', order: 0, height: 500, minHeight: 80, state: 'normal',
                priceScales: [{
                    id: 'right', mode: 0, autoScale: true,
                    scaleMargins: { top: 0.1, bottom: 0.2 },
                }],
            },
            {
                id: 'rsi', order: 1, height: 160, minHeight: 60, state: 'normal',
                priceScales: [{ id: 'right' }],
            },
        ],
        series: [{
            id: 'price', type: 'Candlestick', paneId: 'main', priceScaleId: 'right',
            options: { upColor: '#26a69a', downColor: '#ef5350' },
        }],
        indicators: [{
            id: 'indicator-1', type: 'RelativeStrengthIndex', paneId: 'rsi',
            params: { length: 14 },
            styles: { value: { color: '#7e57c2', lineWidth: 2, visible: true } },
            source: { kind: 'candle-field', field: 'hlc3' },
            visible: false,
            priceScaleId: 'rsi-scale',
        }],
        drawings: [{
            id: 'future-tool', type: 'plugin-unknown-to-this-host', paneId: 'main',
            points: [{ time: 10, price: 100 }],
            options: { plugin: { mode: 'x' } },
            visible: true,
            locked: false,
            zOrder: 0,
        }],
    };
}

function deeplyFrozen(value) {
    if (value === null || typeof value !== 'object') return true;
    return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen);
}

describe('ChartStateV1 serializer', () => {
    it('round-trips canonical JSON without raw bars or runtime objects', () => {
        const source = state();
        const serialized = serializeChartState(source, { pretty: true });
        const restored = deserializeChartState(serialized);

        assert.equal(CHART_STATE_SCHEMA_VERSION, 1);
        assert.deepEqual(restored, source);
        assert.equal(deeplyFrozen(restored), true);
        assert.match(serialized, /\n  "schemaVersion"/);
        assert.equal(restored.drawings[0].type, 'plugin-unknown-to-this-host');
    });

    it('rejects callbacks, raw series data, duplicate ids and missing panes', () => {
        assert.throws(() => normalizeChartStateV1({
            ...state(),
            chartOptions: { formatter() {} },
        }), /JSON-safe/);
        assert.throws(() => normalizeChartStateV1({
            ...state(),
            series: [{ ...state().series[0], data: [{ time: 1, value: 2 }] }],
        }), /not part of schema v1/);
        assert.throws(() => normalizeChartStateV1({
            ...state(),
            panes: [...state().panes, { ...state().panes[0] }],
        }), /duplicate persisted pane/);
        assert.throws(() => normalizeChartStateV1({
            ...state(),
            drawings: [{ ...state().drawings[0], paneId: 'missing' }],
        }), /missing pane 'missing'/);
        assert.throws(() => normalizeChartStateV1({
            ...state(),
            indicators: [{
                ...state().indicators[0],
                styles: { value: '#not-an-options-object' },
            }],
        }), /styles\.value must be an object/);
        assert.throws(() => normalizeChartStateV1({
            ...state(),
            indicators: [{
                ...state().indicators[0],
                source: { kind: 'candle-field', field: 'adjusted-close' },
            }],
        }), /source field is invalid/);
        assert.throws(() => normalizeChartStateV1({
            ...state(),
            indicators: [{ ...state().indicators[0], visible: 'sometimes' }],
        }), /visible must be boolean/);
        assert.throws(() => normalizeChartStateV1({
            ...state(),
            indicators: [{ ...state().indicators[0], priceScaleId: '  ' }],
        }), /priceScaleId must be a non-empty string/);
    });

    it('rejects malformed and newer JSON with actionable errors', () => {
        assert.throws(() => deserializeChartState('{bad'), /invalid chart state JSON/);
        assert.throws(() => deserializeChartState({ ...state(), schemaVersion: 2 }), /newer than supported/);
        const reserved = JSON.stringify({
            ...state(),
            chartOptions: JSON.parse('{"__proto__":{"polluted":true}}'),
        });
        assert.throws(() => deserializeChartState(reserved), /key is reserved/);
        assert.equal({}.polluted, undefined);
    });

    it('migrates the explicit v0 options/studies shape to v1', () => {
        const current = state();
        const legacy = {
            schemaVersion: 0,
            options: current.chartOptions,
            panes: current.panes,
            series: current.series,
            studies: current.indicators,
            drawings: current.drawings,
        };
        const migrated = deserializeChartState(legacy);
        assert.deepEqual(migrated, current);
        assert.equal(migrated.schemaVersion, 1);
    });

    it('runs custom migrations strictly one version at a time', () => {
        const migrations = new ChartStateMigrationRegistry();
        migrations.register(0, value => ({ ...value, schemaVersion: 1, first: true }));
        migrations.register(1, value => ({ ...value, schemaVersion: 2, second: true }));
        assert.deepEqual(migrations.migrate({ schemaVersion: 0 }, 2), {
            schemaVersion: 2,
            first: true,
            second: true,
        });
        assert.throws(() => migrations.register(1, value => value), /already exists/);
        assert.throws(
            () => new ChartStateMigrationRegistry().migrate({ schemaVersion: 0 }, 1),
            /no chart state migration/,
        );
        const broken = new ChartStateMigrationRegistry();
        broken.register(0, value => ({ ...value, schemaVersion: 2 }));
        assert.throws(() => broken.migrate({ schemaVersion: 0 }, 1), /must produce schemaVersion 1/);
    });
});
