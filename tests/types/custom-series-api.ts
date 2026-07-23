import {
    CandlestickSeries,
    type CustomSeriesDefinition,
    type IChartApi,
    type IIncrementalSeriesDataProcessor,
    type SeriesOptions,
} from '../../src/index.js';

interface RangeData {
    time: number;
    low: number;
    high: number;
}

interface RangeOptions extends SeriesOptions {
    color: string;
    thickness: number;
}

const rangeDefinition: CustomSeriesDefinition<RangeData, RangeOptions> = {
    type: 'RangeTypeCheck',
    defaultOptions: { color: '#ff00ff', thickness: 2 },
    renderer: {
        draw(context) {
            const point: RangeData | undefined = context.data[0];
            const color: string = context.options.color;
            void point;
            void color;
        },
        priceRange(data) {
            return data.length === 0
                ? null
                : { min: data[0].low, max: data[0].high };
        },
    },
};

const rangeProcessor: IIncrementalSeriesDataProcessor<RangeData, RangeOptions> = {
    reset(data) { return { data }; },
    update(point, _options, kind) {
        const appended: boolean = kind === 'append';
        void appended;
        return { fromIndex: 0, removed: 0, data: [point] };
    },
};

const incrementalRangeDefinition: CustomSeriesDefinition<RangeData, RangeOptions> = {
    ...rangeDefinition,
    type: 'IncrementalRangeTypeCheck',
    incrementalDataProcessorFactory: () => rangeProcessor,
};

declare const chart: IChartApi;
const range = chart.addSeries(rangeDefinition, { thickness: 3 });
chart.addSeries(incrementalRangeDefinition);
range.setData([{ time: 1, low: 10, high: 12 }]);
range.update({ time: 2, low: 11, high: 13 });
range.applyOptions({ color: '#00ffff' });
const rangePoint: RangeData | null = range.dataByIndex(0);
void rangePoint;

// @ts-expect-error custom data must satisfy RangeData
range.update({ time: 3, high: 14 });
// @ts-expect-error custom options remain strongly typed
range.applyOptions({ opacityThatDoesNotExist: 0.5 });
// @ts-expect-error addSeries options use the definition's options type
chart.addSeries(rangeDefinition, { thickness: 'wide' });

const candles = chart.addSeries(CandlestickSeries);
candles.update({ time: 1, open: 10, high: 12, low: 9, close: 11 });
// @ts-expect-error built-in definitions preserve their data type
candles.update({ time: 2, value: 11 });
