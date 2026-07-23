import {
    AroonIndicator,
    AroonOscillatorIndicator,
    AroonOscillatorProcessor,
    AroonProcessor,
    BalanceOfPowerIndicator,
    BalanceOfPowerProcessor,
    BalanceOfMarketPowerIndicator,
    BalanceOfMarketPowerProcessor,
    BearPowerIndicator,
    BearPowerProcessor,
    BullPowerIndicator,
    BullPowerProcessor,
    ChoppinessIndexIndicator,
    ChoppinessIndexProcessor,
    ChandeKrollStopIndicator,
    ChandeKrollStopProcessor,
    ElderRayIndicator,
    ElderRayProcessor,
    FibonacciRetracementIndicator,
    FibonacciRetracementProcessor,
    RangeIndicators,
    VerticalHorizontalFilterIndicator,
    VerticalHorizontalFilterProcessor,
    VortexIndicator,
    VortexIndicatorProcessor,
    type IndicatorCandle,
    type IndicatorDefinition,
    type IndicatorParameters,
    type RangeLengthParameters,
} from '../../src/index.js';

const aroon: IndicatorDefinition<IndicatorCandle, RangeLengthParameters> = AroonIndicator;
const oscillator: IndicatorDefinition<IndicatorCandle, RangeLengthParameters>
    = AroonOscillatorIndicator;
const definitions: readonly IndicatorDefinition<IndicatorCandle, any>[] = RangeIndicators;
const bop: IndicatorDefinition<IndicatorCandle, IndicatorParameters> = BalanceOfPowerIndicator;
const bear: IndicatorDefinition<IndicatorCandle, RangeLengthParameters> = BearPowerIndicator;
const bull: IndicatorDefinition<IndicatorCandle, RangeLengthParameters> = BullPowerIndicator;

void aroon;
void oscillator;
void definitions;
void bop;
void bear;
void bull;
void new AroonProcessor(14);
void new AroonOscillatorProcessor(14);
void new BalanceOfPowerProcessor();
void BalanceOfMarketPowerIndicator;
void new BalanceOfMarketPowerProcessor(14);
void ChoppinessIndexIndicator;
void new ChoppinessIndexProcessor(14);
void ChandeKrollStopIndicator;
void new ChandeKrollStopProcessor(10, 1.5, 9);
void ElderRayIndicator;
void new ElderRayProcessor(13);
void FibonacciRetracementIndicator;
void new FibonacciRetracementProcessor(20);
void VerticalHorizontalFilterIndicator;
void new VerticalHorizontalFilterProcessor(15);
void VortexIndicator;
void new VortexIndicatorProcessor(14);
void new BearPowerProcessor(13);
void new BullPowerProcessor(13);
