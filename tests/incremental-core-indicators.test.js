const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    ArnaudLegouxMovingAverageIndicator,
    AverageTrueRangeIndicator,
    CoreIncrementalIndicators,
    EndpointMovingAverageIndicator,
    ExponentialMovingAverageIndicator,
    HighestIndicator,
    IndicatorCategory,
    IndicatorRuntime,
    JurikMovingAverageIndicator,
    KalmanFilterIndicator,
    LinearRegressionForecastIndicator,
    LinearRegressionIndicator,
    LinearRegressionRSquaredIndicator,
    LinearRegressionSlopeIndicator,
    LowestIndicator,
    MeanDeviationIndicator,
    MedianIndicator,
    SimpleMovingAverageIndicator,
    StandardDeviationIndicator,
    StandardErrorIndicator,
    SumIndicator,
    SmoothedMovingAverageIndicator,
    WeightedMovingAverageIndicator,
    WilderMovingAverageIndicator,
    TrueRangeIndicator,
    ZeroLagExponentialMovingAverageIndicator,
    getIndicatorDefinition,
    getIndicatorDefinitions,
} = require('../src/indicators/index.js');
const { calcSMA } = require('../src/chart/indicators/calc/sma.js');
const { calcEMA } = require('../src/chart/indicators/calc/ema.js');
const { calcATR } = require('../src/chart/indicators/calc/atr.js');
const { calcWMA } = require('../src/chart/indicators/calc/wma.js');
const { calcSMMA } = require('../src/chart/indicators/calc/smma.js');
const {
    calcWilderMovingAverage,
} = require('../src/chart/indicators/calc/wildermovingaverage.js');
const { calcTrueRange } = require('../src/chart/indicators/calc/truerange.js');
const {
    calcStandardDeviation,
} = require('../src/chart/indicators/calc/standarddeviation.js');
const { calcStandardError } = require('../src/chart/indicators/calc/standarderror.js');
const { calcSum } = require('../src/chart/indicators/calc/sum.js');
const { calcHighest } = require('../src/chart/indicators/calc/highest.js');
const { calcLowest } = require('../src/chart/indicators/calc/lowest.js');
const { calcALMA } = require('../src/chart/indicators/calc/alma.js');
const {
    calcEndpointMovingAverage,
} = require('../src/chart/indicators/calc/endpointma.js');
const { calcJurikMovingAverage } = require('../src/chart/indicators/calc/jma.js');
const { calcKalmanFilter } = require('../src/chart/indicators/calc/kalmanfilter.js');
const {
    calcLinearRegForecast,
} = require('../src/chart/indicators/calc/linregforecast.js');
const { calcLinearReg } = require('../src/chart/indicators/calc/linreg.js');
const {
    calcLinearRegRSquared,
} = require('../src/chart/indicators/calc/linregrsquared.js');
const { calcLinearRegSlope } = require('../src/chart/indicators/calc/linregslope.js');
const { calcMeanDeviation } = require('../src/chart/indicators/calc/meandeviation.js');
const { calcMedian } = require('../src/chart/indicators/calc/median.js');
const { calcZLEMA } = require('../src/chart/indicators/calc/zlema.js');

function bars(count = 80) {
    return Array.from({ length: count }, (_, index) => {
        const close = 100 + Math.sin(index / 5) * 8 + index * 0.09;
        return {
            time: index + 1,
            open: close - 0.4,
            high: close + 1 + (index % 4) * 0.15,
            low: close - 1 - (index % 3) * 0.12,
            close,
            volume: 1_000 + index * 7,
        };
    });
}

function input(bar) {
    return { time: bar.time, value: bar };
}

function finiteOracle(calc, source, params) {
    return calc(source, params)
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertPoints(runtime, expected, epsilon = 1e-10) {
    const actual = runtime.points('line');
    assert.equal(actual.length, expected.length);
    actual.forEach((point, index) => {
        assert.equal(point.outputId, 'line');
        assert.equal(point.sourceIndex, expected[index].index);
        assert.equal(point.targetIndex, expected[index].index);
        assert.equal(point.time, expected[index].time);
        assert.ok(
            Math.abs(point.value - expected[index].value) <= epsilon,
            `${point.value} != ${expected[index].value} at ${point.targetIndex}`,
        );
    });
}

const CASES = [
    { definition: SimpleMovingAverageIndicator, calc: calcSMA, params: { length: 7 } },
    { definition: ExponentialMovingAverageIndicator, calc: calcEMA, params: { length: 7 } },
    { definition: WeightedMovingAverageIndicator, calc: calcWMA, params: { length: 7 } },
    {
        definition: ArnaudLegouxMovingAverageIndicator,
        calc: calcALMA,
        params: { length: 9, offset: 0.85, sigma: 6 },
    },
    {
        definition: EndpointMovingAverageIndicator,
        calc: calcEndpointMovingAverage,
        params: { length: 7 },
    },
    {
        definition: JurikMovingAverageIndicator,
        calc: calcJurikMovingAverage,
        params: { length: 7, phase: -25 },
    },
    {
        definition: KalmanFilterIndicator,
        calc: calcKalmanFilter,
        params: { length: 7, processNoise: 0.00001, measurementNoise: 0.001 },
    },
    {
        definition: LinearRegressionForecastIndicator,
        calc: calcLinearRegForecast,
        params: { length: 7 },
    },
    {
        definition: LinearRegressionIndicator,
        calc: calcLinearReg,
        params: { length: 7 },
    },
    {
        definition: LinearRegressionSlopeIndicator,
        calc: calcLinearRegSlope,
        params: { length: 7 },
    },
    {
        definition: LinearRegressionRSquaredIndicator,
        calc: calcLinearRegRSquared,
        params: { length: 7 },
    },
    {
        definition: StandardDeviationIndicator,
        calc: calcStandardDeviation,
        params: { length: 7 },
    },
    { definition: StandardErrorIndicator, calc: calcStandardError, params: { length: 7 } },
    { definition: MeanDeviationIndicator, calc: calcMeanDeviation, params: { length: 7 } },
    { definition: MedianIndicator, calc: calcMedian, params: { length: 7 } },
    { definition: SumIndicator, calc: calcSum, params: { length: 7 } },
    { definition: HighestIndicator, calc: calcHighest, params: { length: 7 } },
    { definition: LowestIndicator, calc: calcLowest, params: { length: 7 } },
    { definition: SmoothedMovingAverageIndicator, calc: calcSMMA, params: { length: 7 } },
    {
        definition: WilderMovingAverageIndicator,
        calc: calcWilderMovingAverage,
        params: { length: 7 },
    },
    {
        definition: ZeroLagExponentialMovingAverageIndicator,
        calc: calcZLEMA,
        params: { length: 7 },
    },
    { definition: AverageTrueRangeIndicator, calc: calcATR, params: { length: 7 } },
    { definition: TrueRangeIndicator, calc: calcTrueRange, params: {} },
];

describe('core incremental indicator definitions', () => {
    it('registers executable immutable metadata with real categories', () => {
        assert.deepEqual(CoreIncrementalIndicators.map((item) => item.id), [
            'SimpleMovingAverage',
            'ExponentialMovingAverage',
            'WeightedMovingAverage',
            'ArnaudLegouxMovingAverage',
            'EndpointMovingAverage',
            'JurikMovingAverage',
            'KalmanFilter',
            'LinearRegressionForecast',
            'LinearReg',
            'LinearRegSlope',
            'LinearRegRSquared',
            'StandardError',
            'StandardDeviation',
            'MeanDeviation',
            'Median',
            'Sum',
            'Highest',
            'Lowest',
            'SmoothedMovingAverage',
            'WilderMovingAverage',
            'ZeroLagExponentialMovingAverage',
            'AverageTrueRange',
            'TrueRange',
        ]);
        assert.equal(getIndicatorDefinition('sIMPLEmOVINGaVERAGE'), SimpleMovingAverageIndicator);
        assert.ok(getIndicatorDefinitions().includes(AverageTrueRangeIndicator));
        assert.equal(AverageTrueRangeIndicator.category, IndicatorCategory.Volatility);
        assert.equal(JurikMovingAverageIndicator.category, IndicatorCategory.Trend);
        assert.equal(KalmanFilterIndicator.category, IndicatorCategory.Trend);
        assert.equal(
            ZeroLagExponentialMovingAverageIndicator.category,
            IndicatorCategory.Trend,
        );
        assert.equal(LinearRegressionForecastIndicator.category, IndicatorCategory.Trend);
        assert.equal(LinearRegressionIndicator.category, IndicatorCategory.Trend);
        assert.equal(LinearRegressionSlopeIndicator.category, IndicatorCategory.Trend);
        assert.equal(
            LinearRegressionRSquaredIndicator.category,
            IndicatorCategory.Statistical,
        );
        assert.deepEqual(
            LinearRegressionRSquaredIndicator.outputs.map((output) => output.id),
            ['line'],
        );
        assert.equal(StandardErrorIndicator.category, IndicatorCategory.Statistical);
        assert.equal(MeanDeviationIndicator.category, IndicatorCategory.Volatility);
        assert.equal(MedianIndicator.category, IndicatorCategory.Trend);
        assert.ok(CoreIncrementalIndicators.every((item) => Object.isFrozen(item)));
        assert.ok(CoreIncrementalIndicators.every((item) => typeof item.processorFactory === 'function'));
        assert.throws(
            () => SimpleMovingAverageIndicator.processorFactory({ length: 1 }),
            /integer from 2 to 500/,
        );
        assert.throws(
            () => JurikMovingAverageIndicator.processorFactory({ length: 20, phase: -101 }),
            /integer from -100 to 100/,
        );
        assert.throws(
            () => KalmanFilterIndicator.processorFactory({
                length: 10, processNoise: 0, measurementNoise: 0.001,
            }),
            /positive finite number/,
        );
    });

    it('Jurik Moving Average preserves warm-up position across invalid closes', () => {
        const source = bars(10);
        source[2] = { ...source[2], close: Number.NaN };
        const parameters = { length: 5, phase: 0 };
        const runtime = new IndicatorRuntime({
            definition: JurikMovingAverageIndicator,
            parameters,
            checkpointInterval: 3,
        });
        runtime.reset(source.map(input));
        assertPoints(runtime, finiteOracle(calcJurikMovingAverage, source, parameters));
    });

    for (const testCase of CASES) {
        it(`${testCase.definition.name} matches batch on initial history and every append`, () => {
            const source = bars();
            const runtime = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
                checkpointInterval: 16,
            });

            for (let index = 0; index < source.length; index += 1) {
                runtime.update(input(source[index]), true);
                assertPoints(
                    runtime,
                    finiteOracle(testCase.calc, source.slice(0, index + 1), testCase.params),
                );
            }

            const reset = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
            });
            reset.reset(source.map(input));
            assertPoints(reset, finiteOracle(testCase.calc, source, testCase.params));
        });

        it(`${testCase.definition.name} keeps replace-last previews isolated and replays corrections`, () => {
            const source = bars(50);
            const committed = source.slice(0, 40);
            const runtime = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
                checkpointInterval: 8,
            });
            runtime.reset(committed.map(input));

            for (const delta of [1, -3, 7, -2]) {
                const probe = {
                    ...source[40],
                    close: source[40].close + delta,
                    high: source[40].high + Math.max(delta, 0),
                    low: source[40].low + Math.min(delta, 0),
                };
                runtime.update(input(probe), false);
                assertPoints(
                    runtime,
                    finiteOracle(testCase.calc, [...committed, probe], testCase.params),
                );
                assert.equal(runtime.committedCount, committed.length);
            }

            runtime.update(input(source[40]), true);
            const finalized = [...committed, source[40]];
            assertPoints(runtime, finiteOracle(testCase.calc, finalized, testCase.params));
            assert.equal(runtime.committedCount, 41);

            const corrected = { ...source[20], close: source[20].close + 5, high: source[20].high + 5 };
            runtime.correct(20, input(corrected));
            finalized[20] = corrected;
            assertPoints(runtime, finiteOracle(testCase.calc, finalized, testCase.params));

            const withGap = bars(24);
            withGap[8] = {
                ...withGap[8],
                high: Number.NaN,
                close: Number.NaN,
            };
            runtime.reset(withGap.map(input));
            assertPoints(runtime, finiteOracle(testCase.calc, withGap, testCase.params));

            const streaming = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
            });
            const points = streaming.resetStreaming(committed.map(input), input(source[40]));
            const expected = finiteOracle(
                testCase.calc,
                [...committed, source[40]],
                testCase.params,
            );
            assert.equal(points.length, expected.length);
            points.forEach((point, index) => {
                assert.equal(point.targetIndex, expected[index].index);
                assert.ok(Math.abs(point.value - expected[index].value) <= 1e-10);
            });
        });
    }
});
