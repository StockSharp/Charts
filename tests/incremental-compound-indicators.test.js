const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    AccelerationIndicator,
    AwesomeOscillatorIndicator,
    BollingerBandsIndicator,
    BollingerPercentBIndicator,
    CompoundIndicators,
    ConstanceBrownCompositeIndexIndicator,
    CompositeMomentumIndicator,
    DoubleExponentialMovingAverageIndicator,
    DonchianChannelsIndicator,
    DetrendedSyntheticPriceIndicator,
    ElderImpulseIndicator,
    ElliotWaveOscillatorIndicator,
    GuppyMultipleMovingAverageIndicator,
    EnvelopeIndicator,
    FastStochasticIndicator,
    IndicatorCategory,
    IndicatorRuntime,
    KeltnerChannelsIndicator,
    KasePeakOscillatorIndicator,
    KnowSureThingIndicator,
    KlingerVolumeOscillatorIndicator,
    HullMovingAverageIndicator,
    MacdIndicator,
    MacdSignalIndicator,
    McClellanOscillatorIndicator,
    MovingAverageCrossoverIndicator,
    MovingAverageRibbonIndicator,
    PercentagePriceOscillatorIndicator,
    PivotPointsIndicator,
    PriceChannelsIndicator,
    RelativeVigorIndexIndicator,
    RainbowChartsIndicator,
    SchaffTrendCycleIndicator,
    StochasticIndicator,
    T3MovingAverageIndicator,
    TrueStrengthIndexIndicator,
    TrixIndicator,
    TripleExponentialMovingAverageIndicator,
    WaveTrendOscillatorIndicator,
    WoodiesCciIndicator,
    getIndicatorDefinition,
} = require('../src/indicators/index.js');
const { calcBollingerBands } = require('../src/chart/indicators/calc/bb.js');
const { calcDonchian } = require('../src/chart/indicators/calc/donchian.js');
const { calcDSP } = require('../src/chart/indicators/calc/dsp.js');
const { calcMACD } = require('../src/chart/indicators/calc/macd.js');
const { calcStochastic } = require('../src/chart/indicators/calc/stochastic.js');
const { calcFastStochastic } = require('../src/chart/indicators/calc/faststochastic.js');
const { calcDEMA } = require('../src/chart/indicators/calc/dema.js');
const { calcTEMA } = require('../src/chart/indicators/calc/tema.js');
const { calcT3 } = require('../src/chart/indicators/calc/t3.js');
const { calcHMA } = require('../src/chart/indicators/calc/hma.js');
const { calcEnvelope } = require('../src/chart/indicators/calc/envelope.js');
const { calcAwesomeOscillator } = require('../src/chart/indicators/calc/awesomeoscillator.js');
const { calcTrix } = require('../src/chart/indicators/calc/trix.js');
const { calcAcceleration } = require('../src/chart/indicators/calc/acceleration.js');
const { calcBollingerPercentB } = require('../src/chart/indicators/calc/bbpercentb.js');
const { calcConstanceBrownCompositeIndex } = require('../src/chart/indicators/calc/cbci.js');
const { calcCompositeMomentum } = require('../src/chart/indicators/calc/compositemomentum.js');
const { calcElderImpulse } = require('../src/chart/indicators/calc/elderimpulse.js');
const { calcElliotWaveOscillator } = require('../src/chart/indicators/calc/ewo.js');
const { calcGMMA } = require('../src/chart/indicators/calc/gmma.js');
const { calcKeltnerChannels } = require('../src/chart/indicators/calc/keltner.js');
const { calcKasePeakOscillator } = require('../src/chart/indicators/calc/kpo.js');
const { calcKST } = require('../src/chart/indicators/calc/kst.js');
const { calcKVO } = require('../src/chart/indicators/calc/kvo.js');
const { calcMovingAverageCrossover } = require('../src/chart/indicators/calc/macross.js');
const {
    calcMovingAverageConvergenceDivergenceSignal,
} = require('../src/chart/indicators/calc/macdsignal.js');
const { calcMovingAverageRibbon } = require('../src/chart/indicators/calc/maribbon.js');
const { calcMcClellanOscillator } = require('../src/chart/indicators/calc/mcclellanosc.js');
const { calcPivotPoints } = require('../src/chart/indicators/calc/pivotpoints.js');
const { calcPPO } = require('../src/chart/indicators/calc/ppo.js');
const { calcPriceChannels } = require('../src/chart/indicators/calc/pricechannels.js');
const {
    calcRelativeVigorIndex,
} = require('../src/chart/indicators/calc/relativevigorindex.js');
const { calcRainbowCharts } = require('../src/chart/indicators/calc/rainbowcharts.js');
const {
    calcSchaffTrendCycle,
} = require('../src/chart/indicators/calc/schafftrendcycle.js');
const {
    calcTrueStrengthIndex,
} = require('../src/chart/indicators/calc/truestrengthindex.js');
const { calcWaveTrend } = require('../src/chart/indicators/calc/wto.js');
const { calcWoodiesCCI } = require('../src/chart/indicators/calc/woodiescci.js');

const GMMA_OUTPUTS = [
    'short3', 'short5', 'short8', 'short10', 'short12', 'short15',
    'long30', 'long35', 'long40', 'long45', 'long50', 'long60',
];

function gmmaSeries(source, params) {
    const calculated = calcGMMA(source, params);
    return Object.fromEntries([
        ...calculated.short.map((series, index) => [GMMA_OUTPUTS[index], series]),
        ...calculated.long.map((series, index) => [GMMA_OUTPUTS[index + 6], series]),
    ]);
}

function movingAverageRibbonSeries(source, params) {
    const calculated = calcMovingAverageRibbon(source, params);
    return Object.fromEntries(calculated.averages.map((series, index) => (
        [`ribbon${index}`, series]
    )));
}

function bars(count = 85) {
    return Array.from({ length: count }, (_, index) => {
        const close = 120 + Math.sin(index / 4.1) * 11 + Math.cos(index / 9.7) * 3 + index * 0.08;
        return {
            time: index + 1,
            open: close - Math.cos(index / 3) * 0.8,
            high: close + 1.4 + (index % 5) * 0.19,
            low: close - 1.3 - (index % 4) * 0.16,
            close,
            volume: 1_100 + index * 9,
        };
    });
}

function input(bar) {
    return { time: bar.time, value: bar };
}

function oracle(calc, source, params, outputId) {
    return (calc(source, params)[outputId] || [])
        .map((point, index) => ({
            index,
            time: point.time,
            value: point.value,
            metadata: typeof point.state === 'string'
                ? { state: point.state }
                : (typeof point.up === 'boolean' ? { up: point.up } : undefined),
        }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertOutput(runtime, outputId, expected, epsilon = 1e-9) {
    const actual = runtime.points(outputId);
    assert.equal(actual.length, expected.length, `${outputId} point count`);
    actual.forEach((point, index) => {
        const value = expected[index];
        assert.equal(point.outputId, outputId);
        assert.equal(point.sourceIndex, value.index);
        assert.equal(point.targetIndex, value.index);
        assert.equal(point.time, value.time);
        assert.deepEqual(point.metadata, value.metadata);
        const tolerance = Math.max(1, Math.abs(value.value)) * epsilon;
        assert.ok(
            Math.abs(point.value - value.value) <= tolerance,
            `${outputId}: ${point.value} != ${value.value} at ${point.targetIndex}`,
        );
    });
}

function assertCase(runtime, testCase, source) {
    for (const outputId of testCase.outputs) {
        assertOutput(
            runtime,
            outputId,
            oracle(testCase.calc, source, testCase.params, outputId),
            testCase.epsilon,
        );
    }
}

const CASES = [
    {
        definition: PivotPointsIndicator,
        calc: calcPivotPoints,
        params: {},
        outputs: ['pp', 'r1', 'r2', 's1', 's2'],
        epsilon: 1e-9,
    },
    {
        definition: RelativeVigorIndexIndicator,
        calc: calcRelativeVigorIndex,
        params: { length: 4, signalLength: 4 },
        outputs: ['rvi', 'signal'],
        epsilon: 1e-9,
    },
    {
        definition: RainbowChartsIndicator,
        calc: calcRainbowCharts,
        params: { lines: 4 },
        outputs: ['sma1', 'sma2', 'sma3'],
        epsilon: 1e-9,
    },
    {
        definition: ElderImpulseIndicator,
        calc: (source, params) => ({ impulse: calcElderImpulse(source, params) }),
        params: { emaLength: 5, fastLength: 4, slowLength: 8 },
        outputs: ['impulse'],
        epsilon: 0,
    },
    {
        definition: CompositeMomentumIndicator,
        calc: calcCompositeMomentum,
        params: {
            shortRocLength: 3,
            longRocLength: 7,
            rsiLength: 5,
            fastLength: 4,
            slowLength: 7,
            smaLength: 4,
        },
        outputs: ['composite', 'sma'],
        epsilon: 1e-8,
    },
    {
        definition: ConstanceBrownCompositeIndexIndicator,
        calc: calcConstanceBrownCompositeIndex,
        params: {
            rsiLength: 5,
            rocLength: 3,
            shortRsiLength: 3,
            momentumLength: 3,
            fastSmaLength: 4,
            slowSmaLength: 7,
        },
        outputs: ['composite', 'fastSma', 'slowSma'],
        epsilon: 1e-8,
    },
    {
        definition: BollingerPercentBIndicator,
        calc: (source, params) => ({ line: calcBollingerPercentB(source, params) }),
        params: { length: 9, stdDevMultiplier: 2.3 },
        outputs: ['line'],
        epsilon: 1e-8,
    },
    {
        definition: BollingerBandsIndicator,
        calc: calcBollingerBands,
        params: { length: 9, stdDev: 2.3 },
        outputs: ['upper', 'middle', 'lower'],
        epsilon: 1e-8,
    },
    {
        definition: PriceChannelsIndicator,
        calc: calcPriceChannels,
        params: { length: 9 },
        outputs: ['upper', 'lower'],
        epsilon: 0,
    },
    {
        definition: DonchianChannelsIndicator,
        calc: calcDonchian,
        params: { length: 9 },
        outputs: ['upper', 'middle', 'lower'],
        epsilon: 0,
    },
    {
        definition: DetrendedSyntheticPriceIndicator,
        calc: (source, params) => ({ line: calcDSP(source, params) }),
        params: { length: 9 },
        outputs: ['line'],
        epsilon: 0,
    },
    {
        definition: TrueStrengthIndexIndicator,
        calc: calcTrueStrengthIndex,
        params: { firstLength: 5, secondLength: 4, signalLength: 3 },
        outputs: ['tsi', 'signal'],
        epsilon: 1e-9,
    },
    {
        definition: KeltnerChannelsIndicator,
        calc: calcKeltnerChannels,
        params: { length: 9, multiplier: 2.3 },
        outputs: ['upper', 'middle', 'lower'],
        epsilon: 1e-9,
    },
    {
        definition: KasePeakOscillatorIndicator,
        calc: calcKasePeakOscillator,
        params: { atrLength: 7, shortPeriod: 4, longPeriod: 8 },
        outputs: ['shortTerm', 'longTerm'],
        epsilon: 1e-9,
    },
    {
        definition: KnowSureThingIndicator,
        calc: calcKST,
        params: {
            roc1Length: 3, roc2Length: 4, roc3Length: 5, roc4Length: 7,
            sma1Length: 3, sma2Length: 3, sma3Length: 3, sma4Length: 4,
            signalLength: 4,
        },
        outputs: ['kst', 'signal'],
        epsilon: 1e-9,
    },
    {
        definition: KlingerVolumeOscillatorIndicator,
        calc: calcKVO,
        params: { shortPeriod: 4, longPeriod: 9 },
        outputs: ['shortEma', 'longEma', 'oscillator'],
        epsilon: 1e-9,
    },
    {
        definition: MovingAverageCrossoverIndicator,
        calc: (source, params) => ({
            signal: calcMovingAverageCrossover(source, params).signal,
        }),
        params: { shortPeriod: 4, longPeriod: 9 },
        outputs: ['signal'],
        epsilon: 0,
    },
    {
        definition: MovingAverageRibbonIndicator,
        calc: movingAverageRibbonSeries,
        params: { shortPeriod: 3, longPeriod: 9, ribbonCount: 4 },
        outputs: ['ribbon0', 'ribbon1', 'ribbon2', 'ribbon3'],
        epsilon: 1e-9,
    },
    {
        definition: McClellanOscillatorIndicator,
        calc: (source, params) => ({ line: calcMcClellanOscillator(source, params) }),
        params: { shortLength: 4, longLength: 9 },
        outputs: ['line'],
        epsilon: 1e-9,
    },
    {
        definition: EnvelopeIndicator,
        calc: calcEnvelope,
        params: { length: 9, percent: 2.5 },
        outputs: ['upper', 'middle', 'lower'],
        epsilon: 1e-9,
    },
    {
        definition: AwesomeOscillatorIndicator,
        calc: (source, params) => ({ value: calcAwesomeOscillator(source, params) }),
        params: { shortLength: 4, longLength: 11 },
        outputs: ['value'],
        epsilon: 1e-9,
    },
    {
        definition: ElliotWaveOscillatorIndicator,
        calc: (source, params) => ({ line: calcElliotWaveOscillator(source, params) }),
        params: { shortPeriod: 4, longPeriod: 11 },
        outputs: ['line'],
        epsilon: 1e-9,
    },
    {
        definition: GuppyMultipleMovingAverageIndicator,
        calc: gmmaSeries,
        params: {},
        outputs: GMMA_OUTPUTS,
        epsilon: 1e-9,
    },
    {
        definition: AccelerationIndicator,
        calc: (source, params) => ({ line: calcAcceleration(source, params) }),
        params: { shortLength: 4, longLength: 11, smaLength: 4 },
        outputs: ['line'],
        epsilon: 1e-9,
    },
    {
        definition: TrixIndicator,
        calc: (source, params) => ({ line: calcTrix(source, params) }),
        params: { length: 4 },
        outputs: ['line'],
        epsilon: 1e-8,
    },
    {
        definition: DoubleExponentialMovingAverageIndicator,
        calc: (source, params) => ({ line: calcDEMA(source, params) }),
        params: { length: 5 },
        outputs: ['line'],
        epsilon: 1e-9,
    },
    {
        definition: TripleExponentialMovingAverageIndicator,
        calc: (source, params) => ({ line: calcTEMA(source, params) }),
        params: { length: 5 },
        outputs: ['line'],
        epsilon: 1e-9,
    },
    {
        definition: T3MovingAverageIndicator,
        calc: (source, params) => ({ line: calcT3(source, params) }),
        params: { length: 5, volumeFactor: 0.7 },
        outputs: ['line'],
        epsilon: 1e-9,
    },
    {
        definition: HullMovingAverageIndicator,
        calc: (source, params) => ({ line: calcHMA(source, params) }),
        params: { length: 9, sqrtPeriod: 5 },
        outputs: ['line'],
        epsilon: 1e-9,
    },
    {
        definition: MacdIndicator,
        calc: calcMACD,
        params: { fastLength: 5, slowLength: 11, signalLength: 4 },
        outputs: ['macd', 'signal', 'histogram'],
        epsilon: 1e-9,
    },
    {
        definition: MacdSignalIndicator,
        calc: calcMovingAverageConvergenceDivergenceSignal,
        params: { longLength: 11, shortLength: 5, signalLength: 4 },
        outputs: ['macd', 'signal'],
        epsilon: 1e-9,
    },
    {
        definition: PercentagePriceOscillatorIndicator,
        calc: calcPPO,
        params: { shortLength: 5, longLength: 11, signalLength: 4 },
        outputs: ['ppo', 'signal', 'histogram'],
        epsilon: 1e-9,
    },
    {
        definition: SchaffTrendCycleIndicator,
        calc: (source, params) => ({ line: calcSchaffTrendCycle(source, params) }),
        params: {
            length: 3,
            shortLength: 5,
            longLength: 11,
            cycleLength: 3,
            signalLength: 2,
        },
        outputs: ['line'],
        epsilon: 1e-9,
    },
    {
        definition: StochasticIndicator,
        calc: calcStochastic,
        params: { kPeriod: 8, dPeriod: 3, smooth: 2 },
        outputs: ['k', 'd'],
        epsilon: 1e-9,
    },
    {
        definition: FastStochasticIndicator,
        calc: calcFastStochastic,
        params: { kPeriod: 8, dPeriod: 3 },
        outputs: ['k', 'd'],
        epsilon: 1e-9,
    },
    {
        definition: WaveTrendOscillatorIndicator,
        calc: calcWaveTrend,
        params: { esaPeriod: 5, dPeriod: 7, averagePeriod: 3 },
        outputs: ['wt1', 'wt2'],
        epsilon: 1e-9,
    },
    {
        definition: WoodiesCciIndicator,
        calc: calcWoodiesCCI,
        params: { length: 7, smaLength: 4 },
        outputs: ['cci', 'signal'],
        epsilon: 1e-9,
    },
];

describe('incremental compound indicators', () => {
    it('registers typed multi-output definitions in stable output order', () => {
        assert.deepEqual(CompoundIndicators.map((item) => item.id), [
            'PivotPoints',
            'RelativeVigorIndex',
            'BollingerBands',
            'PriceChannels',
            'TrueStrengthIndex',
            'KeltnerChannels',
            'KasePeakOscillator',
            'KnowSureThing',
            'KlingerVolumeOscillator',
            'MovingAverageCrossover',
            'MovingAverageRibbon',
            'RainbowCharts',
            'McClellanOscillator',
            'Envelope',
            'AwesomeOscillator',
            'ElliotWaveOscillator',
            'GuppyMultipleMovingAverage',
            'Acceleration',
            'Trix',
            'DoubleExponentialMovingAverage',
            'TripleExponentialMovingAverage',
            'T3MovingAverage',
            'HullMovingAverage',
            'MovingAverageConvergenceDivergence',
            'MovingAverageConvergenceDivergenceSignal',
            'PercentagePriceOscillator',
            'SchaffTrendCycle',
            'StochasticOscillator',
            'FastStochastic',
            'BollingerPercentB',
            'ConstanceBrownCompositeIndex',
            'CompositeMomentum',
            'ElderImpulseSystem',
            'WaveTrendOscillator',
            'WoodiesCCI',
            'DonchianChannels',
            'DetrendedSyntheticPrice',
        ]);
        assert.deepEqual(BollingerBandsIndicator.outputs.map((item) => item.id), [
            'upper', 'middle', 'lower',
        ]);
        assert.deepEqual(PriceChannelsIndicator.outputs.map((item) => item.id), [
            'upper', 'lower',
        ]);
        assert.equal(PriceChannelsIndicator.category, IndicatorCategory.SupportResistance);
        assert.deepEqual(DonchianChannelsIndicator.outputs.map((item) => item.id), [
            'upper', 'middle', 'lower',
        ]);
        assert.equal(DonchianChannelsIndicator.category, IndicatorCategory.SupportResistance);
        assert.deepEqual(
            DetrendedSyntheticPriceIndicator.outputs.map((item) => item.id),
            ['line'],
        );
        assert.equal(DetrendedSyntheticPriceIndicator.category, IndicatorCategory.Price);
        assert.deepEqual(TrueStrengthIndexIndicator.outputs.map((item) => item.id), [
            'tsi', 'signal',
        ]);
        assert.equal(TrueStrengthIndexIndicator.category, IndicatorCategory.Momentum);
        assert.deepEqual(WaveTrendOscillatorIndicator.outputs.map((item) => item.id), [
            'wt1', 'wt2',
        ]);
        assert.equal(WaveTrendOscillatorIndicator.category, IndicatorCategory.Momentum);
        assert.deepEqual(WoodiesCciIndicator.outputs.map((item) => item.id), [
            'cci', 'signal',
        ]);
        assert.equal(WoodiesCciIndicator.category, IndicatorCategory.Momentum);
        assert.deepEqual(PivotPointsIndicator.outputs.map((item) => item.id), [
            'pp', 'r1', 'r2', 's1', 's2',
        ]);
        assert.equal(PivotPointsIndicator.category, IndicatorCategory.SupportResistance);
        assert.deepEqual(RelativeVigorIndexIndicator.outputs.map((item) => item.id), [
            'rvi', 'signal',
        ]);
        assert.equal(RelativeVigorIndexIndicator.category, IndicatorCategory.Momentum);
        assert.deepEqual(KeltnerChannelsIndicator.outputs.map((item) => item.id), [
            'upper', 'middle', 'lower',
        ]);
        assert.deepEqual(KasePeakOscillatorIndicator.outputs.map((item) => item.id), [
            'shortTerm', 'longTerm',
        ]);
        assert.deepEqual(KnowSureThingIndicator.outputs.map((item) => item.id), [
            'kst', 'signal',
        ]);
        assert.deepEqual(KlingerVolumeOscillatorIndicator.outputs.map((item) => item.id), [
            'shortEma', 'longEma', 'oscillator',
        ]);
        assert.deepEqual(MovingAverageCrossoverIndicator.outputs.map((item) => item.id), [
            'signal',
        ]);
        assert.deepEqual(
            MovingAverageRibbonIndicator.outputFactory({
                shortPeriod: 3, longPeriod: 9, ribbonCount: 4,
            }).map((item) => [item.id, item.name]),
            [
                ['ribbon0', 'SMA 3'],
                ['ribbon1', 'SMA 5'],
                ['ribbon2', 'SMA 7'],
                ['ribbon3', 'SMA 9'],
            ],
        );
        assert.deepEqual(
            RainbowChartsIndicator.outputFactory({ lines: 4 }).map((item) => [item.id, item.name]),
            [['sma1', 'SMA 2'], ['sma2', 'SMA 4'], ['sma3', 'SMA 6']],
        );
        assert.deepEqual(EnvelopeIndicator.outputs.map((item) => item.id), [
            'upper', 'middle', 'lower',
        ]);
        assert.deepEqual(MacdIndicator.outputs.map((item) => item.id), [
            'macd', 'signal', 'histogram',
        ]);
        assert.equal(T3MovingAverageIndicator.category, IndicatorCategory.Trend);
        assert.deepEqual(T3MovingAverageIndicator.outputs.map((item) => item.id), ['line']);
        assert.deepEqual(MacdSignalIndicator.outputs.map((item) => item.id), [
            'macd', 'signal',
        ]);
        assert.deepEqual(PercentagePriceOscillatorIndicator.outputs.map((item) => item.id), [
            'ppo', 'signal', 'histogram',
        ]);
        assert.equal(PercentagePriceOscillatorIndicator.category, IndicatorCategory.Momentum);
        assert.deepEqual(SchaffTrendCycleIndicator.outputs.map((item) => item.id), [
            'line',
        ]);
        assert.equal(SchaffTrendCycleIndicator.category, IndicatorCategory.Cycle);
        assert.deepEqual(
            GuppyMultipleMovingAverageIndicator.outputs.map((item) => item.id),
            GMMA_OUTPUTS,
        );
        assert.equal(getIndicatorDefinition('sTOCHASTICoSCILLATOR'), StochasticIndicator);
        assert.equal(getIndicatorDefinition('fASTsTOCHASTIC'), FastStochasticIndicator);
        assert.ok(CompoundIndicators.every((item) => Object.isFrozen(item)));
    });

    it('Percentage Price Oscillator emits zero through signal and histogram at zero price', () => {
        const source = Array.from({ length: 8 }, (_, index) => ({
            time: index + 1,
            open: 0,
            high: 0,
            low: 0,
            close: 0,
            volume: 100,
        }));
        const runtime = new IndicatorRuntime({
            definition: PercentagePriceOscillatorIndicator,
            parameters: { shortLength: 2, longLength: 3, signalLength: 2 },
        });
        runtime.reset(source.map(input));
        assert.equal(runtime.points('ppo')[0].sourceIndex, 2);
        assert.ok(runtime.points('ppo').every((point) => point.value === 0));
        assert.equal(runtime.points('signal')[0].sourceIndex, 3);
        assert.ok(runtime.points('signal').every((point) => point.value === 0));
        assert.ok(runtime.points('histogram').every((point) => point.value === 0));
    });

    it('True Strength Index emits zero after flat-price denominator warm-up', () => {
        const source = Array.from({ length: 7 }, (_, index) => ({
            time: index + 1,
            open: 10,
            high: 10,
            low: 10,
            close: 10,
            volume: 100,
        }));
        const runtime = new IndicatorRuntime({
            definition: TrueStrengthIndexIndicator,
            parameters: { firstLength: 2, secondLength: 2, signalLength: 2 },
        });
        runtime.reset(source.map(input));
        assert.equal(runtime.points('tsi')[0].sourceIndex, 2);
        assert.ok(runtime.points('tsi').every((point) => point.value === 0));
        assert.equal(runtime.points('signal')[0].sourceIndex, 3);
        assert.ok(runtime.points('signal').every((point) => point.value === 0));
    });

    it('T3 Moving Average previews its formation boundary without consuming warm-up', () => {
        const source = bars(11);
        const params = { length: 2, volumeFactor: 0.7 };
        const testCase = {
            definition: T3MovingAverageIndicator,
            calc: (candles, parameters) => ({ line: calcT3(candles, parameters) }),
            params,
            outputs: ['line'],
            epsilon: 1e-9,
        };
        const runtime = new IndicatorRuntime({
            definition: T3MovingAverageIndicator,
            parameters: params,
        });
        runtime.reset(source.slice(0, 10).map(input));
        assert.equal(runtime.points('line').length, 0);

        for (let iteration = 0; iteration < 3; iteration += 1) {
            runtime.update(input(source[10]), false);
            assertCase(runtime, testCase, source);
            assert.equal(runtime.committedCount, 10);
        }
        runtime.update(input(source[10]), true);
        assertCase(runtime, testCase, source);
        assert.equal(runtime.points('line')[0].sourceIndex, 10);
    });

    it('Schaff Trend Cycle keeps its stochastic window still on a flat close range', () => {
        const params = {
            length: 3,
            shortLength: 5,
            longLength: 11,
            cycleLength: 3,
            signalLength: 2,
        };
        const source = bars(52).map((bar, index) => (
            index >= 30 && index <= 41
                ? { ...bar, open: 135, high: 135, low: 135, close: 135 }
                : bar
        ));
        const testCase = {
            definition: SchaffTrendCycleIndicator,
            calc: (candles, parameters) => ({
                line: calcSchaffTrendCycle(candles, parameters),
            }),
            params,
            outputs: ['line'],
            epsilon: 1e-9,
        };
        const runtime = new IndicatorRuntime({
            definition: SchaffTrendCycleIndicator,
            parameters: params,
            checkpointInterval: 7,
        });

        runtime.reset(source.slice(0, 39).map(input));
        for (let iteration = 0; iteration < 3; iteration += 1) {
            runtime.update(input(source[39]), false);
            assertCase(runtime, testCase, source.slice(0, 40));
            assert.equal(runtime.committedCount, 39);
        }
        runtime.update(input(source[39]), true);
        assertCase(runtime, testCase, source.slice(0, 40));

        runtime.reset(source.map(input));
        assertCase(runtime, testCase, source);
        assert.ok(runtime.points('line').some((point) => (
            point.sourceIndex >= 32 && point.sourceIndex <= 41
        )));
    });

    for (const testCase of CASES) {
        it(`${testCase.definition.name} matches every batch append and initial reset`, () => {
            const source = bars();
            const runtime = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
                checkpointInterval: 13,
            });
            for (let index = 0; index < source.length; index += 1) {
                runtime.update(input(source[index]), true);
                assertCase(runtime, testCase, source.slice(0, index + 1));
            }

            const reset = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
            });
            reset.reset(source.map(input));
            assertCase(reset, testCase, source);
        });

        it(`${testCase.definition.name} matches preview, final, gaps and correction replay`, () => {
            const source = bars(65);
            const committed = source.slice(0, 48);
            const runtime = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
                checkpointInterval: 8,
            });
            runtime.reset(committed.map(input));

            for (const delta of [2, -4, 7, -1]) {
                const probe = {
                    ...source[48],
                    close: source[48].close + delta,
                    high: source[48].high + Math.max(delta, 0),
                    low: source[48].low + Math.min(delta, 0),
                };
                runtime.update(input(probe), false);
                assertCase(runtime, testCase, [...committed, probe]);
                assert.equal(runtime.committedCount, committed.length);
            }

            runtime.update(input(source[48]), true);
            const finalized = [...committed, source[48]];
            assertCase(runtime, testCase, finalized);

            const corrected = {
                ...source[21],
                close: source[21].close + 5,
                high: source[21].high + 5,
            };
            runtime.correct(21, input(corrected));
            finalized[21] = corrected;
            assertCase(runtime, testCase, finalized);

            const withGaps = bars(42);
            withGaps[6] = { ...withGaps[6], close: Number.NaN };
            withGaps[19] = { ...withGaps[19], high: Number.NaN };
            withGaps[30] = { ...withGaps[30], close: Number.NaN };
            runtime.reset(withGaps.map(input));
            assertCase(runtime, testCase, withGaps);

            const initialGap = bars(30);
            initialGap[2] = {
                ...initialGap[2],
                close: Number.NaN,
                high: Number.NaN,
            };
            runtime.reset(initialGap.map(input));
            assertCase(runtime, testCase, initialGap);

            const streaming = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
            });
            const points = streaming.resetStreaming(committed.map(input), input(source[48]));
            const expected = testCase.outputs.flatMap((outputId) => (
                oracle(testCase.calc, [...committed, source[48]], testCase.params, outputId)
                    .map((point) => ({ ...point, outputId }))
            ));
            assert.equal(points.length, expected.length);
            points.forEach((point, index) => {
                assert.equal(point.outputId, expected[index].outputId);
                assert.equal(point.targetIndex, expected[index].index);
                const tolerance = Math.max(1, Math.abs(expected[index].value)) * testCase.epsilon;
                assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
                assert.deepEqual(point.metadata, expected[index].metadata);
            });
        });
    }
});
