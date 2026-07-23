import {
    AdaptiveIndicators,
    AdaptiveLaguerreFilterIndicator,
    AdaptiveLaguerreFilterProcessor,
    AdaptivePriceZoneIndicator,
    AdaptivePriceZoneProcessor,
    LaguerreRsiIndicator,
    LaguerreRsiProcessor,
    McGinleyDynamicIndicator,
    McGinleyDynamicProcessor,
    NickRypockTrailingReverseIndicator,
    NickRypockTrailingReverseProcessor,
    OptimalTrackingIndicator,
    OptimalTrackingProcessor,
    SuperTrendIndicator,
    SuperTrendProcessor,
    VidyaIndicator,
    VidyaProcessor,
    VariableMovingAverageIndicator,
    VariableMovingAverageProcessor,
    type AdaptiveLaguerreFilterParameters,
    type LaguerreRsiParameters,
    type IndicatorCandle,
    type IndicatorDefinition,
    type SuperTrendParameters,
} from '../../src/index.js';

const definition: IndicatorDefinition<IndicatorCandle, AdaptiveLaguerreFilterParameters>
    = AdaptiveLaguerreFilterIndicator;
const definitions: readonly IndicatorDefinition<IndicatorCandle, any>[] = AdaptiveIndicators;
const laguerreRsi: IndicatorDefinition<IndicatorCandle, LaguerreRsiParameters>
    = LaguerreRsiIndicator;
const superTrend: IndicatorDefinition<IndicatorCandle, SuperTrendParameters>
    = SuperTrendIndicator;

void definition;
void definitions;
void laguerreRsi;
void superTrend;
void McGinleyDynamicIndicator;
void NickRypockTrailingReverseIndicator;
void OptimalTrackingIndicator;
void new AdaptiveLaguerreFilterProcessor(0.8);
void new LaguerreRsiProcessor(0.7);
void new McGinleyDynamicProcessor(14);
void new NickRypockTrailingReverseProcessor(50, 100);
void new OptimalTrackingProcessor();
void new SuperTrendProcessor(10, 3);
void VidyaIndicator;
void new VidyaProcessor(15);
void VariableMovingAverageIndicator;
void new VariableMovingAverageProcessor(20, 0.2);
void AdaptivePriceZoneIndicator;
void new AdaptivePriceZoneProcessor(5, 2);
