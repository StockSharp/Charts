import {
    AccelerationIndicator,
    AccelerationProcessor,
    AwesomeOscillatorIndicator,
    AwesomeOscillatorProcessor,
    BollingerBandsIndicator,
    BollingerPercentBIndicator,
    BollingerPercentBProcessor,
    CompoundIndicators,
    ConstanceBrownCompositeIndexIndicator,
    ConstanceBrownCompositeIndexProcessor,
    CompositeMomentumIndicator,
    CompositeMomentumProcessor,
    DoubleExponentialMovingAverageIndicator,
    DoubleExponentialMovingAverageProcessor,
    DonchianChannelsIndicator,
    DonchianChannelsProcessor,
    DetrendedSyntheticPriceIndicator,
    DetrendedSyntheticPriceProcessor,
    ElderImpulseIndicator,
    ElderImpulseProcessor,
    ElliotWaveOscillatorIndicator,
    ElliotWaveOscillatorProcessor,
    GuppyMultipleMovingAverageIndicator,
    GuppyMultipleMovingAverageProcessor,
    EnvelopeIndicator,
    EnvelopeProcessor,
    FastStochasticIndicator,
    FastStochasticProcessor,
    IndicatorRuntime,
    KeltnerChannelsIndicator,
    KeltnerChannelsProcessor,
    KasePeakOscillatorIndicator,
    KasePeakOscillatorProcessor,
    KnowSureThingIndicator,
    KnowSureThingProcessor,
    KlingerVolumeOscillatorIndicator,
    KlingerVolumeOscillatorProcessor,
    HullMovingAverageIndicator,
    HullMovingAverageProcessor,
    MacdIndicator,
    MacdSignalIndicator,
    MacdSignalProcessor,
    McClellanOscillatorIndicator,
    McClellanOscillatorProcessor,
    MovingAverageCrossoverIndicator,
    MovingAverageCrossoverProcessor,
    MovingAverageRibbonIndicator,
    MovingAverageRibbonProcessor,
    PercentagePriceOscillatorIndicator,
    PercentagePriceOscillatorProcessor,
    PivotPointsIndicator,
    PivotPointsProcessor,
    PriceChannelsIndicator,
    PriceChannelsProcessor,
    RelativeVigorIndexIndicator,
    RelativeVigorIndexProcessor,
    RainbowChartsIndicator,
    RainbowChartsProcessor,
    SchaffTrendCycleIndicator,
    SchaffTrendCycleProcessor,
    StochasticIndicator,
    T3MovingAverageIndicator,
    T3MovingAverageProcessor,
    TrueStrengthIndexIndicator,
    TrueStrengthIndexProcessor,
    TripleExponentialMovingAverageIndicator,
    TripleExponentialMovingAverageProcessor,
    TrixIndicator,
    TrixProcessor,
    WaveTrendOscillatorIndicator,
    WaveTrendOscillatorProcessor,
    WoodiesCciIndicator,
    WoodiesCciProcessor,
    type BollingerBandsParameters,
    type BollingerPercentBParameters,
    type AwesomeOscillatorParameters,
    type AccelerationParameters,
    type CompoundLengthParameters,
    type ConstanceBrownCompositeIndexParameters,
    type CompositeMomentumParameters,
    type EnvelopeParameters,
    type ElderImpulseParameters,
    type ElliotWaveOscillatorParameters,
    type FastStochasticParameters,
    type IndicatorCandle,
    type IndicatorDefinition,
    type KeltnerChannelsParameters,
    type KasePeakOscillatorParameters,
    type KnowSureThingParameters,
    type KlingerVolumeOscillatorParameters,
    type HullMovingAverageParameters,
    type MacdParameters,
    type MacdSignalParameters,
    type McClellanOscillatorParameters,
    type MovingAverageCrossoverParameters,
    type MovingAverageRibbonParameters,
    type PercentagePriceOscillatorParameters,
    type RelativeVigorIndexParameters,
    type RainbowChartsParameters,
    type SchaffTrendCycleParameters,
    type StochasticParameters,
    type T3MovingAverageParameters,
    type TrueStrengthIndexParameters,
    type WaveTrendOscillatorParameters,
    type WoodiesCciParameters,
} from '../../src/index.js';

const bands: IndicatorDefinition<IndicatorCandle, BollingerBandsParameters>
    = BollingerBandsIndicator;
const percentB: IndicatorDefinition<IndicatorCandle, BollingerPercentBParameters>
    = BollingerPercentBIndicator;
const awesome: IndicatorDefinition<IndicatorCandle, AwesomeOscillatorParameters>
    = AwesomeOscillatorIndicator;
const acceleration: IndicatorDefinition<IndicatorCandle, AccelerationParameters>
    = AccelerationIndicator;
const macd: IndicatorDefinition<IndicatorCandle, MacdParameters> = MacdIndicator;
const macdSignal: IndicatorDefinition<IndicatorCandle, MacdSignalParameters>
    = MacdSignalIndicator;
const mcClellan: IndicatorDefinition<IndicatorCandle, McClellanOscillatorParameters>
    = McClellanOscillatorIndicator;
const movingAverageCrossover: IndicatorDefinition<
    IndicatorCandle,
    MovingAverageCrossoverParameters
> = MovingAverageCrossoverIndicator;
const movingAverageRibbon: IndicatorDefinition<IndicatorCandle, MovingAverageRibbonParameters>
    = MovingAverageRibbonIndicator;
const ppo: IndicatorDefinition<IndicatorCandle, PercentagePriceOscillatorParameters>
    = PercentagePriceOscillatorIndicator;
const relativeVigor: IndicatorDefinition<IndicatorCandle, RelativeVigorIndexParameters>
    = RelativeVigorIndexIndicator;
const rainbow: IndicatorDefinition<IndicatorCandle, RainbowChartsParameters>
    = RainbowChartsIndicator;
const schaffTrendCycle: IndicatorDefinition<IndicatorCandle, SchaffTrendCycleParameters>
    = SchaffTrendCycleIndicator;
const envelope: IndicatorDefinition<IndicatorCandle, EnvelopeParameters> = EnvelopeIndicator;
const keltner: IndicatorDefinition<IndicatorCandle, KeltnerChannelsParameters>
    = KeltnerChannelsIndicator;
const kasePeak: IndicatorDefinition<IndicatorCandle, KasePeakOscillatorParameters>
    = KasePeakOscillatorIndicator;
const knowSureThing: IndicatorDefinition<IndicatorCandle, KnowSureThingParameters>
    = KnowSureThingIndicator;
const klinger: IndicatorDefinition<IndicatorCandle, KlingerVolumeOscillatorParameters>
    = KlingerVolumeOscillatorIndicator;
const stochastic: IndicatorDefinition<IndicatorCandle, StochasticParameters>
    = StochasticIndicator;
const fastStochastic: IndicatorDefinition<IndicatorCandle, FastStochasticParameters>
    = FastStochasticIndicator;
const t3: IndicatorDefinition<IndicatorCandle, T3MovingAverageParameters>
    = T3MovingAverageIndicator;
const tsi: IndicatorDefinition<IndicatorCandle, TrueStrengthIndexParameters>
    = TrueStrengthIndexIndicator;
const waveTrend: IndicatorDefinition<IndicatorCandle, WaveTrendOscillatorParameters>
    = WaveTrendOscillatorIndicator;
const woodiesCci: IndicatorDefinition<IndicatorCandle, WoodiesCciParameters>
    = WoodiesCciIndicator;
const dema: IndicatorDefinition<IndicatorCandle, CompoundLengthParameters>
    = DoubleExponentialMovingAverageIndicator;
const tema: IndicatorDefinition<IndicatorCandle, CompoundLengthParameters>
    = TripleExponentialMovingAverageIndicator;
const hma: IndicatorDefinition<IndicatorCandle, HullMovingAverageParameters>
    = HullMovingAverageIndicator;
const trix: IndicatorDefinition<IndicatorCandle, CompoundLengthParameters> = TrixIndicator;
const compositeIndex: IndicatorDefinition<
    IndicatorCandle,
    ConstanceBrownCompositeIndexParameters
> = ConstanceBrownCompositeIndexIndicator;
const compositeMomentum: IndicatorDefinition<IndicatorCandle, CompositeMomentumParameters>
    = CompositeMomentumIndicator;
const elderImpulse: IndicatorDefinition<IndicatorCandle, ElderImpulseParameters>
    = ElderImpulseIndicator;
const elliotWave: IndicatorDefinition<IndicatorCandle, ElliotWaveOscillatorParameters>
    = ElliotWaveOscillatorIndicator;
const runtime = new IndicatorRuntime({
    definition: macd,
    parameters: { fastLength: 12, slowLength: 26, signalLength: 9 },
});

void bands;
void percentB;
void awesome;
void acceleration;
void envelope;
void keltner;
void kasePeak;
void knowSureThing;
void klinger;
void macdSignal;
void mcClellan;
void movingAverageCrossover;
void movingAverageRibbon;
void ppo;
void PivotPointsIndicator;
void PriceChannelsIndicator;
void relativeVigor;
void rainbow;
void schaffTrendCycle;
void stochastic;
void fastStochastic;
void t3;
void tsi;
void waveTrend;
void woodiesCci;
void runtime;
void dema;
void tema;
void hma;
void trix;
void compositeIndex;
void compositeMomentum;
void elderImpulse;
void elliotWave;
void GuppyMultipleMovingAverageIndicator;
void new DoubleExponentialMovingAverageProcessor(32);
void DonchianChannelsIndicator;
void new DonchianChannelsProcessor(20);
void DetrendedSyntheticPriceIndicator;
void new DetrendedSyntheticPriceProcessor(14);
void new TripleExponentialMovingAverageProcessor(32);
void new T3MovingAverageProcessor(5, 0.7);
void new TrueStrengthIndexProcessor(25, 13, 7);
void new WaveTrendOscillatorProcessor(10, 14, 3);
void new WoodiesCciProcessor(14, 6);
void new HullMovingAverageProcessor(10, 0);
void new EnvelopeProcessor(20, 2.5);
void new KeltnerChannelsProcessor(20, 2);
void new KasePeakOscillatorProcessor(10, 9, 18);
void new KnowSureThingProcessor(10, 15, 20, 30, 10, 10, 10, 15, 9);
void new KlingerVolumeOscillatorProcessor(34, 55);
void new MovingAverageCrossoverProcessor(25, 50);
void new MovingAverageRibbonProcessor(10, 100, 10);
void new PercentagePriceOscillatorProcessor(12, 26, 9);
void new PivotPointsProcessor();
void new PriceChannelsProcessor(20);
void new RelativeVigorIndexProcessor(4, 4);
void new RainbowChartsProcessor(10);
void new SchaffTrendCycleProcessor(10, 23, 50, 5, 3);
void new MacdSignalProcessor(26, 12, 9);
void new McClellanOscillatorProcessor(19, 39);
void new AwesomeOscillatorProcessor(5, 34);
void new TrixProcessor(14);
void new AccelerationProcessor(5, 34, 5);
void new FastStochasticProcessor(14, 3);
void new BollingerPercentBProcessor(20, 2);
void new ConstanceBrownCompositeIndexProcessor(14, 9, 3, 3, 13, 33);
void new CompositeMomentumProcessor(14, 28, 14, 12, 26, 9);
void new ElderImpulseProcessor(13, 12, 26);
void new ElliotWaveOscillatorProcessor(5, 34);
void new GuppyMultipleMovingAverageProcessor();
void CompoundIndicators;
