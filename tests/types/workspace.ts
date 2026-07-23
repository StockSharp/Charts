import {
    IndicatorCatalogController,
    CompareAlignment,
    CompareController,
    CompareMode,
    ChartNavigator,
    MultiChartWorkspace,
    NavigatorDateAlignment,
    NavigatorRangePreset,
    IndicatorController,
    IndicatorTemplateController,
    deserializeIndicatorTemplates,
    serializeIndicatorTemplates,
    PaneController,
    type IndicatorControllerEngine,
    type IndicatorControllerSnapshot,
    type CandlestickData,
    type ChartDataController,
    type IChartDataSource,
    type IChartApi,
    type PaneControllerSnapshot,
} from '../../src/index.js';

const catalog = new IndicatorCatalogController({
    entries: [{
        id: 'rsi',
        name: 'RSI',
        fullName: 'Relative Strength Index',
        category: 'momentum',
        categoryLabel: 'Momentum',
        aliases: ['rsi'],
    }],
    storage: {
        load: () => ['rsi'],
        save: ids => { void ids; },
    },
});
void catalog.search({ text: 'relative strength', category: 'Momentum' });
void catalog.loadFavorites();
void catalog.toggleFavorite('rsi');
catalog.subscribe(snapshot => { void snapshot.loaded; });

declare const chart: IChartApi;
declare const series: import('../../src/index.js').ISeriesApi;
declare const compareSource: IChartDataSource<CandlestickData>;
declare const workspaceContainer: HTMLElement;
declare const workspaceData: ChartDataController<CandlestickData>;
const comparison = new CompareController({
    chart,
    dataSource: compareSource,
    mode: CompareMode.Percentage,
    alignment: CompareAlignment.PrimarySession,
});
void comparison.add({ symbol: 'AAPL', resolution: '1m', primary: true });
comparison.setMode(CompareMode.IndexedTo100);
comparison.setAlignment(CompareAlignment.Chart);
comparison.subscribe(snapshot => { void snapshot.legend; });
const workspace = new MultiChartWorkspace({
    container: workspaceContainer,
    count: 4,
    columns: 2,
    links: { symbol: true, resolution: false },
    sync: { range: true, crosshair: true },
    createChart: ({ id, index, host }) => {
        void id;
        void index;
        void host;
        return { chart, data: workspaceData };
    },
});
workspace.setLayout({ count: 2, columns: null });
workspace.setLinks({ symbol: true, resolution: true });
workspace.setSync({ range: true, crosshair: false });
void workspace.setSelection(workspace.cells()[0].id, { symbol: 'AAPL', resolution: '5m' });
workspace.subscribe(snapshot => { void snapshot.activeId; });
const chartNavigator = new ChartNavigator({
    chart,
    data: workspaceData,
    maxPoints: 500,
    maxHistoryPages: 20,
    valueAccessor: bar => ({ value: bar.close, high: bar.high, low: bar.low }),
});
void chartNavigator.selectPreset(NavigatorRangePreset.OneMonth);
void chartNavigator.setRange({ from: 1_700_000_000, to: 1_710_000_000 });
void chartNavigator.goToDate(1_705_000_000, {
    alignment: NavigatorDateAlignment.Center,
    spanSeconds: 86_400,
});
chartNavigator.subscribe(snapshot => { void snapshot.samples; });
const panes = new PaneController({ chart });
const state: readonly PaneControllerSnapshot[] = panes.panes();
panes.resizePair('main', 'study', 20);
panes.reorder('study', 0);
panes.moveSeries(series, 'study');
panes.toggleMinimized('study');
panes.toggleMaximized('study');
panes.setState('study', 'normal');
panes.subscribe(next => { void next; });
void state;

declare const indicatorEngine: IndicatorControllerEngine;
const indicators = new IndicatorController({
    engine: indicatorEngine,
    commandStack: chart.commandStack(),
});
const indicatorState: readonly IndicatorControllerSnapshot[] = indicators.indicators();
const templates = new IndicatorTemplateController({
    indicators,
    storage: {
        load: () => null,
        save: serialized => { void serialized; },
    },
});
void templates.load();
void templates.create('RSI defaults', 'indicator-1');
const templateJson = serializeIndicatorTemplates(templates.document());
void deserializeIndicatorTemplates(templateJson);
indicators.update('indicator-1', {
    parameters: { length: 20 },
    source: { kind: 'candle-field', field: 'close' },
    paneId: null,
    priceScaleId: 'right',
    visible: true,
    outputs: { value: { color: '#fff', lineWidth: 2, lineStyle: 0, precision: 4 } },
});
indicators.setOutputStyle('indicator-1', 'value', { visible: false });
indicators.setOutputStyle('indicator-1', 'value', { precision: null });
indicators.subscribe(next => { void next; });
void indicatorState;
