const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    ApprovalFlowIndexIndicator,
    BalanceVolumeIndicator,
    ChaikinMoneyFlowIndicator,
    ChaikinOscillatorIndicator,
    ChandeMomentumOscillatorIndicator,
    ConnorsRsiIndicator,
    DeMarkerIndicator,
    DeMarkerProcessor,
    DemandIndexIndicator,
    DemandIndexProcessor,
    DisparityIndexIndicator,
    DisparityIndexProcessor,
    DynamicZonesRsiIndicator,
    DynamicZonesRsiProcessor,
    EaseOfMovementIndicator,
    ForceIndexIndicator,
    ForecastOscillatorIndicator,
    FiniteVolumeElementIndicator,
    HighLowIndexIndicator,
    IntradayIntensityIndexIndicator,
    IntradayMomentumIndexIndicator,
    IndicatorCategory,
    IndicatorRuntime,
    MarketFacilitationIndexIndicator,
    MoneyFlowIndexIndicator,
    MomentumIndicator,
    MomentumOfMovingAverageIndicator,
    MomentumPinballIndicator,
    MomentumVolumeIndicators,
    NegativeVolumeIndexIndicator,
    OnBalanceVolumeIndicator,
    OnBalanceVolumeMeanIndicator,
    OscillatorOfMovingAverageIndicator,
    PercentageVolumeOscillatorIndicator,
    PositiveVolumeIndexIndicator,
    PriceVolumeTrendIndicator,
    PriceVolumeTrendProcessor,
    PrettyGoodOscillatorIndicator,
    PsychologicalLineIndicator,
    QStickIndicator,
    RelativeMomentumIndexIndicator,
    RangeActionVerificationIndexIndicator,
    RankCorrelationIndexIndicator,
    RateOfChangeIndicator,
    RelativeStrengthIndexIndicator,
    StochasticKIndicator,
    TwiggsMoneyFlowIndicator,
    TwiggsMoneyFlowProcessor,
    UltimateOscillatorIndicator,
    VolumeIndicator,
    VolumeIndicatorProcessor,
    VolumeWeightedMovingAverageIndicator,
    WilliamsRIndicator,
    getIndicatorDefinition,
} = require('../src/indicators/index.js');
const { calcRSI } = require('../src/chart/indicators/calc/rsi.js');
const { calcDeMarker } = require('../src/chart/indicators/calc/demarker.js');
const { calcDemandIndex } = require('../src/chart/indicators/calc/demandindex.js');
const { calcDisparityIndex } = require('../src/chart/indicators/calc/disparityindex.js');
const { calcDZRSI } = require('../src/chart/indicators/calc/dzrsi.js');
const { calcApprovalFlowIndex } = require('../src/chart/indicators/calc/approvalflowindex.js');
const { calcMomentum } = require('../src/chart/indicators/calc/momentum.js');
const { calcRateOfChange } = require('../src/chart/indicators/calc/rateofchange.js');
const { calcMoneyFlowIndex } = require('../src/chart/indicators/calc/mfi.js');
const { calcCMF } = require('../src/chart/indicators/calc/cmf.js');
const { calcChaikinOscillator } = require('../src/chart/indicators/calc/chaikinoscillator.js');
const { calcCMO } = require('../src/chart/indicators/calc/cmo.js');
const { calcEOM } = require('../src/chart/indicators/calc/eom.js');
const { calcForceIndex } = require('../src/chart/indicators/calc/forceindex.js');
const {
    calcForecastOscillator,
} = require('../src/chart/indicators/calc/forecastoscillator.js');
const { calcFVE } = require('../src/chart/indicators/calc/fve.js');
const { calcHighLowIndex } = require('../src/chart/indicators/calc/highlowindex.js');
const {
    calcIntradayIntensityIndex,
} = require('../src/chart/indicators/calc/iii.js');
const {
    calcIntradayMomentumIndex,
} = require('../src/chart/indicators/calc/imi.js');
const { calcOnBalanceVolume } = require('../src/chart/indicators/calc/onbalancevolume.js');
const {
    calcOnBalanceVolumeMean,
} = require('../src/chart/indicators/calc/obvmean.js');
const { calcOBV } = require('../src/chart/indicators/calc/obv.js');
const { calcVWMA } = require('../src/chart/indicators/calc/vwma.js');
const { calcPVO } = require('../src/chart/indicators/calc/pvo.js');
const {
    calcTwiggsMoneyFlow,
} = require('../src/chart/indicators/calc/twiggsmoneyflow.js');
const {
    calcUltimateOscillator,
} = require('../src/chart/indicators/calc/ultimateoscillator.js');
const { calcVolume } = require('../src/chart/indicators/calc/volume.js');
const { calcWilliamsR } = require('../src/chart/indicators/calc/williamsr.js');
const { calcStochasticK } = require('../src/chart/indicators/calc/stochastick.js');
const {
    calcMarketFacilitationIndex,
} = require('../src/chart/indicators/calc/mfi_market.js');
const {
    calcMomentumOfMovingAverage,
} = require('../src/chart/indicators/calc/momma.js');
const { calcMomentumPinball } = require('../src/chart/indicators/calc/momentumpinball.js');
const { calcNVI } = require('../src/chart/indicators/calc/nvi.js');
const {
    calcPositiveVolumeIndex,
} = require('../src/chart/indicators/calc/positivevolumeindex.js');
const {
    calcPsychologicalLine,
} = require('../src/chart/indicators/calc/psychologicalline.js');
const {
    calcPriceVolumeTrend,
} = require('../src/chart/indicators/calc/pricevolumetrend.js');
const { calcQStick } = require('../src/chart/indicators/calc/qstick.js');
const {
    calcOscillatorOfMovingAverage,
} = require('../src/chart/indicators/calc/osma.js');
const {
    calcPrettyGoodOscillator,
} = require('../src/chart/indicators/calc/pgo.js');
const {
    calcRelativeMomentumIndex,
} = require('../src/chart/indicators/calc/relativemomentumindex.js');
const {
    calcRangeActionVerificationIndex,
} = require('../src/chart/indicators/calc/rangeactionverificationindex.js');
const {
    calcRankCorrelationIndex,
} = require('../src/chart/indicators/calc/rankcorrelationindex.js');

function bars(count = 72) {
    return Array.from({ length: count }, (_, index) => {
        const close = 90 + Math.sin(index / 3.7) * 9 + Math.cos(index / 8.3) * 4 + index * 0.11;
        return {
            time: index + 1,
            open: close - Math.sin(index) * 0.7,
            high: close + 1.2 + (index % 4) * 0.17,
            low: close - 1.1 - (index % 5) * 0.13,
            close,
            volume: 800 + (index % 11) * 73 + index * 5,
        };
    });
}

function input(bar) {
    return { time: bar.time, value: bar };
}

function finiteOracle(calc, source, params) {
    return calc(source, params)
        .map((point, index) => ({
            index,
            time: point.time,
            value: point.value,
            metadata: typeof point.up === 'boolean' ? { up: point.up } : undefined,
        }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertPoints(runtime, outputId, expected) {
    const actual = runtime.points(outputId);
    assert.equal(actual.length, expected.length);
    actual.forEach((point, index) => {
        const oracle = expected[index];
        assert.equal(point.outputId, outputId);
        assert.equal(point.sourceIndex, oracle.index);
        assert.equal(point.targetIndex, oracle.index);
        assert.equal(point.time, oracle.time);
        assert.deepEqual(point.metadata, oracle.metadata);
        const tolerance = Math.max(1, Math.abs(oracle.value)) * 1e-10;
        assert.ok(
            Math.abs(point.value - oracle.value) <= tolerance,
            `${point.value} != ${oracle.value} at ${point.targetIndex}`,
        );
    });
}

function pvoSeries(outputId) {
    return (source, params) => calcPVO(source, params)[outputId];
}

const CASES = [
    {
        definition: ApprovalFlowIndexIndicator,
        calc: calcApprovalFlowIndex,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: ForceIndexIndicator,
        calc: calcForceIndex,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: ForecastOscillatorIndicator,
        calc: calcForecastOscillator,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: FiniteVolumeElementIndicator,
        calc: calcFVE,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: HighLowIndexIndicator,
        calc: calcHighLowIndex,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: IntradayIntensityIndexIndicator,
        calc: calcIntradayIntensityIndex,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: IntradayMomentumIndexIndicator,
        calc: calcIntradayMomentumIndex,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: RelativeStrengthIndexIndicator,
        calc: calcRSI,
        params: { length: 7 },
        outputId: 'oscillator',
    },
    {
        definition: DynamicZonesRsiIndicator,
        calc: calcDZRSI,
        params: { length: 7, oversoldLevel: 20, overboughtLevel: 80 },
        outputId: 'line',
    },
    {
        definition: DeMarkerIndicator,
        calc: calcDeMarker,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: DemandIndexIndicator,
        calc: calcDemandIndex,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: DisparityIndexIndicator,
        calc: calcDisparityIndex,
        params: { length: 7 },
        outputId: 'line',
    },
    { definition: MomentumIndicator, calc: calcMomentum, params: { length: 5 }, outputId: 'line' },
    { definition: QStickIndicator, calc: calcQStick, params: { length: 7 }, outputId: 'line' },
    {
        definition: MomentumOfMovingAverageIndicator,
        calc: calcMomentumOfMovingAverage,
        params: { length: 7, momentumPeriod: 4 },
        outputId: 'line',
    },
    {
        definition: MomentumPinballIndicator,
        calc: calcMomentumPinball,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: RateOfChangeIndicator,
        calc: calcRateOfChange,
        params: { length: 6 },
        outputId: 'line',
    },
    { definition: WilliamsRIndicator, calc: calcWilliamsR, params: { length: 7 }, outputId: 'line' },
    {
        definition: StochasticKIndicator,
        calc: calcStochasticK,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: MoneyFlowIndexIndicator,
        calc: calcMoneyFlowIndex,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: ChaikinMoneyFlowIndicator,
        calc: calcCMF,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: ChaikinOscillatorIndicator,
        calc: calcChaikinOscillator,
        params: { fast: 3, slow: 7 },
        outputId: 'line',
    },
    {
        definition: ChandeMomentumOscillatorIndicator,
        calc: calcCMO,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: EaseOfMovementIndicator,
        calc: calcEOM,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: OnBalanceVolumeIndicator,
        calc: calcOnBalanceVolume,
        params: {},
        outputId: 'line',
    },
    {
        definition: OnBalanceVolumeMeanIndicator,
        calc: calcOnBalanceVolumeMean,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: OscillatorOfMovingAverageIndicator,
        calc: calcOscillatorOfMovingAverage,
        params: { shortPeriod: 4, longPeriod: 9 },
        outputId: 'line',
    },
    {
        definition: PrettyGoodOscillatorIndicator,
        calc: calcPrettyGoodOscillator,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: RelativeMomentumIndexIndicator,
        calc: calcRelativeMomentumIndex,
        params: { length: 7, momentumPeriod: 3 },
        outputId: 'line',
    },
    {
        definition: RangeActionVerificationIndexIndicator,
        calc: calcRangeActionVerificationIndex,
        params: { shortLength: 4, longLength: 9 },
        outputId: 'line',
    },
    {
        definition: RankCorrelationIndexIndicator,
        calc: calcRankCorrelationIndex,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: VolumeWeightedMovingAverageIndicator,
        calc: calcVWMA,
        params: { length: 7 },
        outputId: 'line',
    },
    ...['shortEma', 'longEma', 'pvo'].map((outputId) => ({
        definition: PercentageVolumeOscillatorIndicator,
        calc: pvoSeries(outputId),
        params: { shortPeriod: 4, longPeriod: 9 },
        outputId,
        outputLabel: outputId,
    })),
    {
        definition: TwiggsMoneyFlowIndicator,
        calc: calcTwiggsMoneyFlow,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: UltimateOscillatorIndicator,
        calc: calcUltimateOscillator,
        params: {},
        outputId: 'line',
    },
    { definition: VolumeIndicator, calc: calcVolume, params: {}, outputId: 'value' },
    {
        definition: MarketFacilitationIndexIndicator,
        calc: calcMarketFacilitationIndex,
        params: {},
        outputId: 'line',
    },
    { definition: NegativeVolumeIndexIndicator, calc: calcNVI, params: {}, outputId: 'line' },
    {
        definition: PositiveVolumeIndexIndicator,
        calc: calcPositiveVolumeIndex,
        params: {},
        outputId: 'line',
    },
    {
        definition: PsychologicalLineIndicator,
        calc: calcPsychologicalLine,
        params: { length: 7 },
        outputId: 'line',
    },
    {
        definition: PriceVolumeTrendIndicator,
        calc: calcPriceVolumeTrend,
        params: {},
        outputId: 'line',
    },
    { definition: BalanceVolumeIndicator, calc: calcOBV, params: {}, outputId: 'line' },
];

describe('incremental momentum and volume indicators', () => {
    it('registers the group with executable typed metadata', () => {
        assert.deepEqual(MomentumVolumeIndicators.map((item) => item.id), [
            'RelativeStrengthIndex',
            'DynamicZonesRSI',
            'DeMarker',
            'DemandIndex',
            'DisparityIndex',
            'Momentum',
            'QStick',
            'MomentumOfMovingAverage',
            'OscillatorOfMovingAverage',
            'PrettyGoodOscillator',
            'RelativeMomentumIndex',
            'RangeActionVerificationIndex',
            'RankCorrelationIndex',
            'MomentumPinball',
            'RateOfChange',
            'WilliamsR',
            'StochasticK',
            'MoneyFlowIndex',
            'ChaikinMoneyFlow',
            'ChaikinOscillator',
            'ChandeMomentumOscillator',
            'ConnorsRSI',
            'EaseOfMovement',
            'ApprovalFlowIndex',
            'ForceIndex',
            'ForecastOscillator',
            'FiniteVolumeElement',
            'HighLowIndex',
            'IntradayIntensityIndex',
            'IntradayMomentumIndex',
            'VolumeWeightedMovingAverage',
            'PercentageVolumeOscillator',
            'TwiggsMoneyFlow',
            'UltimateOscillator',
            'VolumeIndicator',
            'MarketFacilitationIndex',
            'NegativeVolumeIndex',
            'PositiveVolumeIndex',
            'PsychologicalLine',
            'PriceVolumeTrend',
            'OnBalanceVolume',
            'OnBalanceVolumeMean',
            'BalanceVolume',
        ]);
        assert.equal(getIndicatorDefinition('rELATIVEsTRENGTHiNDEX'), RelativeStrengthIndexIndicator);
        assert.equal(RelativeStrengthIndexIndicator.category, IndicatorCategory.Momentum);
        assert.equal(DynamicZonesRsiIndicator.category, IndicatorCategory.Momentum);
        assert.equal(DeMarkerIndicator.category, IndicatorCategory.Momentum);
        assert.equal(DemandIndexIndicator.category, IndicatorCategory.Volume);
        assert.equal(DisparityIndexIndicator.category, IndicatorCategory.Momentum);
        assert.equal(MomentumOfMovingAverageIndicator.category, IndicatorCategory.Momentum);
        assert.equal(QStickIndicator.category, IndicatorCategory.Momentum);
        assert.equal(OscillatorOfMovingAverageIndicator.category, IndicatorCategory.Momentum);
        assert.equal(PrettyGoodOscillatorIndicator.category, IndicatorCategory.Momentum);
        assert.equal(RelativeMomentumIndexIndicator.category, IndicatorCategory.Momentum);
        assert.equal(
            RangeActionVerificationIndexIndicator.category,
            IndicatorCategory.MarketStrength,
        );
        assert.equal(RankCorrelationIndexIndicator.category, IndicatorCategory.Momentum);
        assert.equal(MomentumPinballIndicator.category, IndicatorCategory.Momentum);
        assert.equal(StochasticKIndicator.category, IndicatorCategory.Momentum);
        assert.deepEqual(StochasticKIndicator.outputs.map((output) => output.id), ['line']);
        assert.equal(ApprovalFlowIndexIndicator.category, IndicatorCategory.Volume);
        assert.equal(ForceIndexIndicator.category, IndicatorCategory.Volume);
        assert.equal(ForecastOscillatorIndicator.category, IndicatorCategory.Momentum);
        assert.equal(FiniteVolumeElementIndicator.category, IndicatorCategory.Volume);
        assert.equal(HighLowIndexIndicator.category, IndicatorCategory.MarketStrength);
        assert.equal(IntradayIntensityIndexIndicator.category, IndicatorCategory.Volume);
        assert.equal(IntradayMomentumIndexIndicator.category, IndicatorCategory.Momentum);
        assert.equal(PercentageVolumeOscillatorIndicator.category, IndicatorCategory.Volume);
        assert.equal(TwiggsMoneyFlowIndicator.category, IndicatorCategory.Volume);
        assert.equal(UltimateOscillatorIndicator.category, IndicatorCategory.Momentum);
        assert.deepEqual(
            PercentageVolumeOscillatorIndicator.outputs.map((output) => output.id),
            ['shortEma', 'longEma', 'pvo'],
        );
        assert.equal(MoneyFlowIndexIndicator.category, IndicatorCategory.Volume);
        assert.equal(ChaikinMoneyFlowIndicator.category, IndicatorCategory.Volume);
        assert.equal(ChaikinOscillatorIndicator.category, IndicatorCategory.Volume);
        assert.equal(ChandeMomentumOscillatorIndicator.category, IndicatorCategory.Momentum);
        assert.equal(ConnorsRsiIndicator.category, IndicatorCategory.Momentum);
        assert.equal(EaseOfMovementIndicator.category, IndicatorCategory.Volume);
        assert.equal(VolumeIndicator.category, IndicatorCategory.Volume);
        assert.equal(MarketFacilitationIndexIndicator.category, IndicatorCategory.Volume);
        assert.equal(NegativeVolumeIndexIndicator.category, IndicatorCategory.Volume);
        assert.equal(PositiveVolumeIndexIndicator.category, IndicatorCategory.Volume);
        assert.equal(PsychologicalLineIndicator.category, IndicatorCategory.Momentum);
        assert.equal(PriceVolumeTrendIndicator.category, IndicatorCategory.Volume);
        assert.equal(OnBalanceVolumeMeanIndicator.category, IndicatorCategory.Volume);
        assert.ok(MomentumVolumeIndicators.every((item) => Object.isFrozen(item)));
        assert.throws(
            () => RelativeStrengthIndexIndicator.processorFactory({ length: 1 }),
            /integer from 2 to 500/,
        );
    });

    it('DeMarker keeps the first valid candle as a seed and previews flat fallback safely', () => {
        const processor = new DeMarkerProcessor(2);
        const flat = { time: 1, open: 5, high: 6, low: 4, close: 5, volume: 100 };
        const process = (index, isFinal) => processor.process({
            index,
            time: index + 1,
            value: { ...flat, time: index + 1 },
            isFinal,
        });

        assert.equal(process(0, false).values[0].value, null);
        assert.equal(processor.position, 0);
        assert.equal(process(0, true).values[0].value, null);
        assert.equal(process(1, true).values[0].value, null);
        assert.equal(process(2, false).values[0].value, 0.5);
        assert.equal(processor.position, 2);
        assert.equal(process(2, true).values[0].value, 0.5);
    });

    it('Dynamic Zones RSI handles a flat formed RSI range without mutating previews', () => {
        const processor = new DynamicZonesRsiProcessor(2, 20, 80);
        const candle = index => ({
            time: index + 1,
            open: index + 1,
            high: index + 1,
            low: index + 1,
            close: index + 1,
        });
        for (let index = 0; index < 3; index += 1) {
            processor.process({
                index, time: index + 1, value: candle(index), isFinal: true,
            });
        }
        const preview = processor.process({
            index: 3, time: 4, value: candle(3), isFinal: false,
        });
        assert.equal(preview.values[0].value, 0);
        assert.equal(processor.position, 3);
        assert.equal(processor.process({
            index: 3, time: 4, value: candle(3), isFinal: true,
        }).values[0].value, 0);
    });

    it('Demand Index repeats its last value without advancing a zero-delta anchor', () => {
        const processor = new DemandIndexProcessor(1);
        const source = [
            { time: 1, open: 10, high: 10, low: 10, close: 10, volume: 100 },
            { time: 2, open: 12, high: 12, low: 12, close: 12, volume: 120 },
            { time: 3, open: 12, high: 12, low: 12, close: 12, volume: 140 },
            { time: 4, open: 15, high: 15, low: 15, close: 15, volume: 150 },
        ];
        const actual = source.map((bar, index) => processor.process({
            index,
            time: bar.time,
            value: bar,
            isFinal: true,
        }).values[0].value);
        const expected = calcDemandIndex(source, { length: 1 }).map(point => point.value);
        actual.forEach((value, index) => {
            if (expected[index] === null) assert.equal(value, null);
            else assert.ok(Math.abs(value - expected[index]) <= Number.EPSILON * 2);
        });
        assert.equal(actual[2], actual[1]);
    });

    it('Disparity Index emits a gap instead of a non-finite zero-average ratio', () => {
        const processor = new DisparityIndexProcessor(2);
        const closes = [-1, 1];
        const results = closes.map((close, index) => processor.process({
            index,
            time: index + 1,
            value: { time: index + 1, open: close, high: close, low: close, close },
            isFinal: true,
        }));
        assert.equal(results[1].values[0].value, null);
    });

    it('Stochastic K returns zero for a formed flat range without mutating previews', () => {
        const flat = Array.from({ length: 4 }, (_, index) => ({
            time: index + 1,
            open: 5,
            high: 5,
            low: 5,
            close: 5,
            volume: 100,
        }));
        const runtime = new IndicatorRuntime({
            definition: StochasticKIndicator,
            parameters: { length: 3 },
        });
        runtime.reset(flat.slice(0, 3).map(input));
        assert.deepEqual(runtime.points('line').map((point) => point.value), [0]);

        for (let iteration = 0; iteration < 3; iteration += 1) {
            runtime.update(input(flat[3]), false);
            assert.deepEqual(runtime.points('line').map((point) => point.value), [0, 0]);
            assert.equal(runtime.committedCount, 3);
        }
        runtime.update(input(flat[3]), true);
        assert.deepEqual(runtime.points('line').map((point) => point.value), [0, 0]);
    });

    it('Percentage Volume Oscillator emits zero for a formed zero-volume denominator', () => {
        const source = Array.from({ length: 6 }, (_, index) => ({
            time: index + 1,
            open: 1,
            high: 1,
            low: 1,
            close: 1,
            volume: 0,
        }));
        const runtime = new IndicatorRuntime({
            definition: PercentageVolumeOscillatorIndicator,
            parameters: { shortPeriod: 2, longPeriod: 3 },
        });
        runtime.reset(source.map(input));
        assert.equal(runtime.points('shortEma')[0].sourceIndex, 1);
        assert.equal(runtime.points('longEma')[0].sourceIndex, 2);
        assert.equal(runtime.points('pvo')[0].sourceIndex, 2);
        assert.ok(runtime.points('pvo').every((point) => point.value === 0));
    });

    it('Price Volume Trend preserves StockSharp zero-close seed semantics', () => {
        const processor = new PriceVolumeTrendProcessor();
        const source = [
            { time: 1, open: 10, high: 10, low: 10, close: 10, volume: 100 },
            { time: 2, open: 0, high: 0, low: 0, close: 0, volume: 50 },
            { time: 3, open: 5, high: 5, low: 5, close: 5, volume: 200 },
            { time: 4, open: 6, high: 6, low: 6, close: 6, volume: 30 },
        ];
        const results = source.map((bar, index) => processor.process({
            index,
            time: bar.time,
            value: bar,
            isFinal: true,
        }));
        assert.deepEqual(
            results.map((result) => result.values[0].value),
            [null, -50, null, -44],
        );
    });

    it('Twiggs Money Flow reuses only committed AD on a flat-candle preview', () => {
        const processor = new TwiggsMoneyFlowProcessor(1);
        const first = { time: 1, open: 5, high: 10, low: 0, close: 10, volume: 90 };
        const falling = { time: 2, open: 5, high: 10, low: 0, close: 0, volume: 90 };
        const flat = { time: 2, open: 5, high: 5, low: 5, close: 5, volume: 60 };
        processor.process({ index: 0, time: first.time, value: first, isFinal: true });
        processor.process({ index: 1, time: falling.time, value: falling, isFinal: false });
        const preview = processor.process({
            index: 1,
            time: flat.time,
            value: flat,
            isFinal: false,
        });
        assert.ok(Math.abs(preview.values[0].value - 0.5) <= Number.EPSILON);
        assert.equal(processor.position, 1);
    });

    it('Ultimate Oscillator preserves a formed zero on continuous down moves', () => {
        const source = [];
        let previous = 200;
        for (let index = 0; index < 35; index += 1) {
            const close = previous - 2;
            source.push({
                time: index + 1,
                open: previous,
                high: previous,
                low: close,
                close,
                volume: 100,
            });
            previous = close;
        }
        const runtime = new IndicatorRuntime({
            definition: UltimateOscillatorIndicator,
            parameters: {},
        });
        runtime.reset(source.map(input));
        assert.equal(runtime.points('line')[0].sourceIndex, 28);
        assert.ok(runtime.points('line').every((point) => point.value === 0));
    });

    it('uses neutral upward coloring when candle direction is unavailable', () => {
        const processor = new VolumeIndicatorProcessor();
        const preview = processor.process({
            index: 0,
            time: 1,
            value: { time: 1, open: Number.NaN, high: 2, low: 0, close: 1, volume: 50 },
            isFinal: false,
        });
        assert.equal(processor.position, 0);
        assert.deepEqual(preview.values[0], {
            outputId: 'value',
            value: 50,
            targetIndex: 0,
            metadata: { up: true },
        });
    });

    for (const testCase of CASES) {
        const caseName = testCase.outputLabel
            ? `${testCase.definition.name} ${testCase.outputLabel}`
            : testCase.definition.name;
        it(`${caseName} matches batch on initial history and every append`, () => {
            const source = bars();
            const runtime = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
                checkpointInterval: 11,
            });

            for (let index = 0; index < source.length; index += 1) {
                runtime.update(input(source[index]), true);
                assertPoints(
                    runtime,
                    testCase.outputId,
                    finiteOracle(testCase.calc, source.slice(0, index + 1), testCase.params),
                );
            }

            const reset = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
            });
            reset.reset(source.map(input));
            assertPoints(
                reset,
                testCase.outputId,
                finiteOracle(testCase.calc, source, testCase.params),
            );
        });

        it(`${caseName} matches preview, final, gaps, reset and correction replay`, () => {
            const source = bars(55);
            const committed = source.slice(0, 40);
            const runtime = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
                checkpointInterval: 8,
            });
            runtime.reset(committed.map(input));

            for (const delta of [3, -5, 8, -2]) {
                const probe = {
                    ...source[40],
                    close: source[40].close + delta,
                    high: source[40].high + Math.max(delta, 0),
                    low: source[40].low + Math.min(delta, 0),
                    volume: source[40].volume + delta * 9,
                };
                runtime.update(input(probe), false);
                assertPoints(
                    runtime,
                    testCase.outputId,
                    finiteOracle(testCase.calc, [...committed, probe], testCase.params),
                );
                assert.equal(runtime.committedCount, committed.length);
            }

            runtime.update(input(source[40]), true);
            const finalized = [...committed, source[40]];
            assertPoints(
                runtime,
                testCase.outputId,
                finiteOracle(testCase.calc, finalized, testCase.params),
            );

            const corrected = {
                ...source[18],
                close: source[18].close + 6,
                high: source[18].high + 6,
                volume: source[18].volume + 250,
            };
            runtime.correct(18, input(corrected));
            finalized[18] = corrected;
            assertPoints(
                runtime,
                testCase.outputId,
                finiteOracle(testCase.calc, finalized, testCase.params),
            );

            const withGaps = bars(35);
            withGaps[8] = { ...withGaps[8], close: Number.NaN };
            withGaps[15] = { ...withGaps[15], volume: Number.NaN };
            runtime.reset(withGaps.map(input));
            assertPoints(
                runtime,
                testCase.outputId,
                finiteOracle(testCase.calc, withGaps, testCase.params),
            );

            const streaming = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
            });
            const streamed = streaming
                .resetStreaming(committed.map(input), input(source[40]))
                .filter((point) => point.outputId === testCase.outputId);
            const oracle = finiteOracle(testCase.calc, [...committed, source[40]], testCase.params);
            assert.equal(streamed.length, oracle.length);
            streamed.forEach((point, index) => {
                assert.equal(point.outputId, testCase.outputId);
                assert.equal(point.targetIndex, oracle[index].index);
                const tolerance = Math.max(1, Math.abs(oracle[index].value)) * 1e-10;
                assert.ok(Math.abs(point.value - oracle[index].value) <= tolerance);
                assert.deepEqual(point.metadata, oracle[index].metadata);
            });
            assert.equal(streaming.retainedFrom, committed.length);
            assert.equal(streaming.hasPreview, true);
        });
    }
});
