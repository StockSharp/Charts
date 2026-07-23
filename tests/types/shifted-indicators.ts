import {
    AlligatorIndicator,
    AlligatorProcessor,
    GatorOscillatorIndicator,
    GatorOscillatorProcessor,
    IndicatorRuntime,
    type AlligatorParameters,
    type IndicatorCandle,
    type IndicatorDefinition,
} from '../../src/index.js';

const definition: IndicatorDefinition<IndicatorCandle, AlligatorParameters>
    = AlligatorIndicator;
const processor = new AlligatorProcessor(13, 8, 8, 5, 5, 3);
const runtime = new IndicatorRuntime({
    definition,
    parameters: {
        jawLength: 13,
        jawShift: 8,
        teethLength: 8,
        teethShift: 5,
        lipsLength: 5,
        lipsShift: 3,
    },
});
const gator = new IndicatorRuntime({
    definition: GatorOscillatorIndicator,
    parameters: {
        jawLength: 13,
        jawShift: 8,
        teethLength: 8,
        teethShift: 5,
        lipsLength: 5,
        lipsShift: 3,
    },
});

void processor;
void new GatorOscillatorProcessor(13, 8, 8, 5, 5, 3);
void runtime;
void gator;
