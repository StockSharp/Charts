import {
    AverageDirectionalIndexIndicator,
    AverageDirectionalIndexProcessor,
    CommodityChannelIndexIndicator,
    CommodityChannelIndexProcessor,
    DirectionalIndexIndicator,
    DirectionalIndexProcessor,
    FractalDimensionIndicator,
    FractalDimensionProcessor,
    HurstExponentIndicator,
    HurstExponentProcessor,
    MarketMeannessIndexIndicator,
    MarketMeannessIndexProcessor,
    RecursiveStatisticalIndicators,
    type IndicatorCandle,
    type IndicatorDefinition,
    type RecursiveLengthParameters,
} from '../../src/index.js';

const definitions: readonly IndicatorDefinition<IndicatorCandle, any>[]
    = RecursiveStatisticalIndicators;
const directional: IndicatorDefinition<IndicatorCandle, RecursiveLengthParameters>
    = DirectionalIndexIndicator;

void definitions;
void directional;
void AverageDirectionalIndexIndicator;
void CommodityChannelIndexIndicator;
void FractalDimensionIndicator;
void HurstExponentIndicator;
void MarketMeannessIndexIndicator;
void new AverageDirectionalIndexProcessor(14);
void new DirectionalIndexProcessor(14);
void new CommodityChannelIndexProcessor(20);
void new FractalDimensionProcessor(30);
void new HurstExponentProcessor(100);
void new MarketMeannessIndexProcessor(200);
