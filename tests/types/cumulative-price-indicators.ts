import {
    AccumulationDistributionLineIndicator,
    AccumulationDistributionLineProcessor,
    CumulativePriceIndicators,
    MedianPriceIndicator,
    MedianPriceProcessor,
    PassThroughIndicator,
    PassThroughIndicatorProcessor,
    ShiftIndicator,
    ShiftProcessor,
    TimeWeightedAveragePriceIndicator,
    TimeWeightedAveragePriceProcessor,
    TypicalPriceIndicator,
    TypicalPriceProcessor,
    VolumeWeightedAveragePriceIndicator,
    VolumeWeightedAveragePriceProcessor,
    WeightedClosePriceIndicator,
    WeightedClosePriceProcessor,
    WilliamsAccumulationDistributionIndicator,
    WilliamsAccumulationDistributionProcessor,
    WilliamsVariableAccumulationDistributionIndicator,
    WilliamsVariableAccumulationDistributionProcessor,
    type IndicatorCandle,
    type IndicatorDefinition,
    type IndicatorParameters,
    type ShiftParameters,
} from '../../src/index.js';

const twap: IndicatorDefinition<IndicatorCandle, IndicatorParameters>
    = TimeWeightedAveragePriceIndicator;
const medianPrice: IndicatorDefinition<IndicatorCandle, IndicatorParameters>
    = MedianPriceIndicator;
const typicalPrice: IndicatorDefinition<IndicatorCandle, IndicatorParameters>
    = TypicalPriceIndicator;
const vwap: IndicatorDefinition<IndicatorCandle, IndicatorParameters>
    = VolumeWeightedAveragePriceIndicator;
const adl: IndicatorDefinition<IndicatorCandle, IndicatorParameters>
    = AccumulationDistributionLineIndicator;
const shift: IndicatorDefinition<IndicatorCandle, ShiftParameters> = ShiftIndicator;
const definitions: readonly IndicatorDefinition<IndicatorCandle, any>[]
    = CumulativePriceIndicators;

void twap;
void medianPrice;
void typicalPrice;
void vwap;
void adl;
void shift;
void definitions;
void PassThroughIndicator;
void new PassThroughIndicatorProcessor();
void new ShiftProcessor(1);
void new MedianPriceProcessor();
void new TimeWeightedAveragePriceProcessor();
void new TypicalPriceProcessor();
void new VolumeWeightedAveragePriceProcessor();
void WeightedClosePriceIndicator;
void new WeightedClosePriceProcessor();
void new AccumulationDistributionLineProcessor();
void WilliamsAccumulationDistributionIndicator;
void new WilliamsAccumulationDistributionProcessor();
void WilliamsVariableAccumulationDistributionIndicator;
void new WilliamsVariableAccumulationDistributionProcessor();
