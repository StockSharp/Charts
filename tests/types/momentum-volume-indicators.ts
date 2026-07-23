import {
    ApprovalFlowIndexIndicator,
    ApprovalFlowIndexProcessor,
    BalanceVolumeIndicator,
    ChaikinMoneyFlowIndicator,
    ChaikinMoneyFlowProcessor,
    ChaikinOscillatorIndicator,
    ChaikinOscillatorProcessor,
    ChandeMomentumOscillatorIndicator,
    ChandeMomentumOscillatorProcessor,
    ConnorsRsiIndicator,
    ConnorsRsiProcessor,
    DeMarkerIndicator,
    DeMarkerProcessor,
    DemandIndexIndicator,
    DemandIndexProcessor,
    DisparityIndexIndicator,
    DisparityIndexProcessor,
    DynamicZonesRsiIndicator,
    DynamicZonesRsiProcessor,
    EaseOfMovementIndicator,
    EaseOfMovementProcessor,
    ForceIndexIndicator,
    ForceIndexProcessor,
    ForecastOscillatorIndicator,
    ForecastOscillatorProcessor,
    FiniteVolumeElementIndicator,
    FiniteVolumeElementProcessor,
    HighLowIndexIndicator,
    HighLowIndexProcessor,
    IntradayIntensityIndexIndicator,
    IntradayIntensityIndexProcessor,
    IntradayMomentumIndexIndicator,
    IntradayMomentumIndexProcessor,
    IndicatorRuntime,
    MarketFacilitationIndexIndicator,
    MarketFacilitationIndexProcessor,
    MoneyFlowIndexIndicator,
    MomentumIndicator,
    MomentumOfMovingAverageIndicator,
    MomentumOfMovingAverageProcessor,
    MomentumPinballIndicator,
    MomentumPinballProcessor,
    MomentumVolumeIndicators,
    NegativeVolumeIndexIndicator,
    NegativeVolumeIndexProcessor,
    OnBalanceVolumeIndicator,
    OnBalanceVolumeMeanIndicator,
    OnBalanceVolumeMeanProcessor,
    OscillatorOfMovingAverageIndicator,
    OscillatorOfMovingAverageProcessor,
    PercentageVolumeOscillatorIndicator,
    PercentageVolumeOscillatorProcessor,
    PositiveVolumeIndexIndicator,
    PositiveVolumeIndexProcessor,
    PriceVolumeTrendIndicator,
    PriceVolumeTrendProcessor,
    PrettyGoodOscillatorIndicator,
    PrettyGoodOscillatorProcessor,
    PsychologicalLineIndicator,
    PsychologicalLineProcessor,
    QStickIndicator,
    QStickProcessor,
    RelativeMomentumIndexIndicator,
    RelativeMomentumIndexProcessor,
    RangeActionVerificationIndexIndicator,
    RangeActionVerificationIndexProcessor,
    RankCorrelationIndexIndicator,
    RankCorrelationIndexProcessor,
    RateOfChangeIndicator,
    RelativeStrengthIndexIndicator,
    StochasticKIndicator,
    StochasticKProcessor,
    TwiggsMoneyFlowIndicator,
    TwiggsMoneyFlowProcessor,
    UltimateOscillatorIndicator,
    UltimateOscillatorProcessor,
    VolumeIndicator,
    VolumeIndicatorProcessor,
    VolumeWeightedMovingAverageIndicator,
    VolumeWeightedMovingAverageProcessor,
    WilliamsRIndicator,
    WilliamsRProcessor,
    type IndicatorCandle,
    type IndicatorDefinition,
    type MomentumLengthParameters,
    type PercentageVolumeOscillatorParameters,
} from '../../src/index.js';

const lengthDefinition: IndicatorDefinition<IndicatorCandle, MomentumLengthParameters>
    = RelativeStrengthIndexIndicator;
const runtime = new IndicatorRuntime({
    definition: MomentumIndicator,
    parameters: { length: 5 },
});
const pvo: IndicatorDefinition<IndicatorCandle, PercentageVolumeOscillatorParameters>
    = PercentageVolumeOscillatorIndicator;
const definitions: readonly IndicatorDefinition<IndicatorCandle, any>[]
    = MomentumVolumeIndicators;

void lengthDefinition;
void ApprovalFlowIndexIndicator;
void runtime;
void definitions;
void pvo;
void PositiveVolumeIndexIndicator;
void PriceVolumeTrendIndicator;
void PsychologicalLineIndicator;
void QStickIndicator;
void RateOfChangeIndicator;
void MoneyFlowIndexIndicator;
void MomentumOfMovingAverageIndicator;
void MomentumPinballIndicator;
void NegativeVolumeIndexIndicator;
void OnBalanceVolumeIndicator;
void OnBalanceVolumeMeanIndicator;
void OscillatorOfMovingAverageIndicator;
void PrettyGoodOscillatorIndicator;
void RelativeMomentumIndexIndicator;
void RangeActionVerificationIndexIndicator;
void RankCorrelationIndexIndicator;
void StochasticKIndicator;
void TwiggsMoneyFlowIndicator;
void UltimateOscillatorIndicator;
void BalanceVolumeIndicator;
void ChaikinMoneyFlowIndicator;
void ChaikinOscillatorIndicator;
void ChandeMomentumOscillatorIndicator;
void ConnorsRsiIndicator;
void DeMarkerIndicator;
void DemandIndexIndicator;
void DisparityIndexIndicator;
void DynamicZonesRsiIndicator;
void EaseOfMovementIndicator;
void ForceIndexIndicator;
void ForecastOscillatorIndicator;
void FiniteVolumeElementIndicator;
void HighLowIndexIndicator;
void IntradayIntensityIndexIndicator;
void IntradayMomentumIndexIndicator;
void MarketFacilitationIndexIndicator;
void VolumeIndicator;
void VolumeWeightedMovingAverageIndicator;
void new VolumeIndicatorProcessor();
void new MarketFacilitationIndexProcessor();
void new MomentumOfMovingAverageProcessor(14, 10);
void new MomentumPinballProcessor(14);
void new NegativeVolumeIndexProcessor();
void new OnBalanceVolumeMeanProcessor(14);
void new OscillatorOfMovingAverageProcessor(10, 30);
void new PercentageVolumeOscillatorProcessor(12, 26);
void new PositiveVolumeIndexProcessor();
void new PriceVolumeTrendProcessor();
void new PsychologicalLineProcessor(20);
void new QStickProcessor(15);
void new PrettyGoodOscillatorProcessor(14);
void new RelativeMomentumIndexProcessor(14, 3);
void new RangeActionVerificationIndexProcessor(7, 65);
void new RankCorrelationIndexProcessor(14);
void new StochasticKProcessor(14);
void new TwiggsMoneyFlowProcessor(21);
void new UltimateOscillatorProcessor();
void new VolumeWeightedMovingAverageProcessor(32);
void WilliamsRIndicator;
void new WilliamsRProcessor(14);
void new ChaikinMoneyFlowProcessor(20);
void new ChaikinOscillatorProcessor(3, 10);
void new ChandeMomentumOscillatorProcessor(15);
void new ConnorsRsiProcessor(3, 2, 100);
void new DeMarkerProcessor(14);
void new DemandIndexProcessor(14);
void new DisparityIndexProcessor(14);
void new DynamicZonesRsiProcessor(14, 20, 80);
void new EaseOfMovementProcessor(14);
void new ApprovalFlowIndexProcessor(14);
void new ForceIndexProcessor(13);
void new ForecastOscillatorProcessor(14);
void new FiniteVolumeElementProcessor(22);
void new HighLowIndexProcessor(14);
void new IntradayIntensityIndexProcessor(14);
void new IntradayMomentumIndexProcessor(14);
