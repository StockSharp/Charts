import {
    ChaikinVolatilityIndicator,
    ChaikinVolatilityProcessor,
    GopalakrishnanRangeIndexIndicator,
    GopalakrishnanRangeIndexProcessor,
    HistoricalVolatilityRatioIndicator,
    HistoricalVolatilityRatioProcessor,
    MassIndexIndicator,
    MassIndexProcessor,
    VolatilityIndicators,
    type ChaikinVolatilityParameters,
    type IndicatorCandle,
    type IndicatorDefinition,
    type VolatilityLengthParameters,
    type HistoricalVolatilityRatioParameters,
} from '../../src/index.js';

const definition: IndicatorDefinition<IndicatorCandle, ChaikinVolatilityParameters>
    = ChaikinVolatilityIndicator;
const definitions: readonly IndicatorDefinition<IndicatorCandle, any>[]
    = VolatilityIndicators;

void definition;
void definitions;
void new ChaikinVolatilityProcessor(32, 5);
const rangeIndex: IndicatorDefinition<IndicatorCandle, VolatilityLengthParameters>
    = GopalakrishnanRangeIndexIndicator;
void rangeIndex;
void new GopalakrishnanRangeIndexProcessor(14);
const historicalRatio: IndicatorDefinition<IndicatorCandle, HistoricalVolatilityRatioParameters>
    = HistoricalVolatilityRatioIndicator;
void historicalRatio;
void new HistoricalVolatilityRatioProcessor(5, 20);
void MassIndexIndicator;
void new MassIndexProcessor(25, 9);
