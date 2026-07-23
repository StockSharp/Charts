import {
    CHART_STATE_SCHEMA_VERSION,
    ChartStatePersistence,
    IndicatorEngineStateAdapter,
    NativeChartLayoutAdapter,
    ChartStateMigrationRegistry,
    type ChartStateV1,
    deserializeChartState,
    serializeChartState,
} from '../../src/index.js';

const state: ChartStateV1 = {
    schemaVersion: CHART_STATE_SCHEMA_VERSION,
    chartOptions: {},
    panes: [{
        id: 'main',
        order: 0,
        height: 500,
        minHeight: 80,
        state: 'normal',
        priceScales: [{ id: 'right', autoScale: true }],
    }],
    series: [],
    indicators: [],
    drawings: [],
};

const json: string = serializeChartState(state);
const restored: ChartStateV1 = deserializeChartState(json);
const migrations = new ChartStateMigrationRegistry();
migrations.register(0, value => ({ ...value, schemaVersion: 1 }));
void restored;

declare const drawings: import('../../src/index.js').DrawingController;
const storage = {
    load(_key: string): string | null { return null; },
    save(_key: string, _value: string): void {},
    remove(_key: string): void {},
};
const persistence = new ChartStatePersistence<{ layoutId: string; symbol: string }>({
    layout: {
        capture: () => ({ chartOptions: {}, panes: state.panes, series: [] }),
        restore: async value => { void value; },
    },
    indicators: {
        capture: () => [],
        clear: () => {},
        restore: value => { void value; },
    },
    drawings,
    storage,
    key: context => `${context.layoutId}:${context.symbol}`,
});
void persistence.save({ layoutId: 'desk', symbol: 'AAPL' });
declare const chart: import('../../src/index.js').IChartApi;
const nativeLayout = new NativeChartLayoutAdapter({ chart, mainPaneId: 'main' });
const nativeSnapshot = nativeLayout.capture();
void nativeSnapshot;
declare const indicatorEngine: import('../../src/index.js').IndicatorEnginePersistenceApi;
const indicatorState = new IndicatorEngineStateAdapter({ engine: indicatorEngine });
void indicatorState.capture();
