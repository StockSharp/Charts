import {
    CandlestickIndicatorInput,
    IndicatorCategory,
    IndicatorMeasure,
    IndicatorPane,
    IndicatorParameterType,
    IndicatorRegistry,
    IndicatorSeriesStyle,
    resolveIndicatorOutputs,
    type IIndicatorProcessor,
    type IndicatorCandle,
    type IndicatorDefinition,
    type IndicatorOutputDefinition,
    type IndicatorParameters,
} from '../../src/index.js';

interface AverageParameters extends IndicatorParameters {
    readonly length: number;
}

declare const processor: IIndicatorProcessor<IndicatorCandle>;
const position: number = processor.position;
void position;

const average: IndicatorDefinition<IndicatorCandle, AverageParameters> = {
    id: 'Average',
    name: 'Average',
    description: 'Typed compile-time fixture.',
    category: IndicatorCategory.Trend,
    input: CandlestickIndicatorInput,
    parameters: [{
        id: 'length',
        name: 'Length',
        type: IndicatorParameterType.Integer,
        defaultValue: 20,
        min: 2,
    }],
    outputs: [{
        id: 'line',
        name: 'Line',
        defaultStyle: { series: IndicatorSeriesStyle.Line },
    }],
    naturalPane: IndicatorPane.Overlay,
    measure: IndicatorMeasure.Price,
    processorFactory(parameters) {
        const length: number = parameters.length;
        void length;
        return processor;
    },
};

const registry = new IndicatorRegistry();
const registered = registry.register(average);
const created: IIndicatorProcessor<IndicatorCandle> = registered.processorFactory({ length: 10 });
const resolvedOutputs: readonly IndicatorOutputDefinition[] = resolveIndicatorOutputs(
    registered,
    { length: 10 },
);
void created;
void resolvedOutputs;

// @ts-expect-error a processor factory is mandatory; batch-only definitions do not enter this registry
const batchOnly: IndicatorDefinition = {
    id: 'BatchOnly',
    name: 'Batch only',
    description: 'Invalid fixture.',
    category: IndicatorCategory.Statistical,
    input: CandlestickIndicatorInput,
    parameters: [],
    outputs: [{ id: 'value', name: 'Value', defaultStyle: { series: IndicatorSeriesStyle.Line } }],
    naturalPane: IndicatorPane.Separate,
    measure: IndicatorMeasure.Absolute,
};
void batchOnly;
