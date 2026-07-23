import {
    CenterOfGravityOscillatorIndicator,
    CenterOfGravityOscillatorProcessor,
    CycleIndicators,
    DetrendedPriceOscillatorIndicator,
    DetrendedPriceOscillatorProcessor,
    EhlersFisherTransformIndicator,
    EhlersFisherTransformProcessor,
    HarmonicOscillatorIndicator,
    HarmonicOscillatorProcessor,
    LunarPhaseIndicator,
    LunarPhaseProcessor,
    SineWaveIndicator,
    SineWaveProcessor,
    type CycleLengthParameters,
    type IndicatorCandle,
    type IndicatorDefinition,
} from '../../src/index.js';

const definition: IndicatorDefinition<IndicatorCandle, CycleLengthParameters>
    = CenterOfGravityOscillatorIndicator;
const definitions: readonly IndicatorDefinition<IndicatorCandle, any>[] = CycleIndicators;

void definition;
void definitions;
void new CenterOfGravityOscillatorProcessor(10);
void DetrendedPriceOscillatorIndicator;
void new DetrendedPriceOscillatorProcessor(3);
void EhlersFisherTransformIndicator;
void new EhlersFisherTransformProcessor(10);
void HarmonicOscillatorIndicator;
void new HarmonicOscillatorProcessor(14);
void LunarPhaseIndicator;
void new LunarPhaseProcessor();
void SineWaveIndicator;
void new SineWaveProcessor(14);
