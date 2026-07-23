const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    AdaptiveLaguerreFilterIndicator,
    AdaptivePriceZoneIndicator,
    AdaptiveIndicators,
    FractalAdaptiveMovingAverageIndicator,
    IndicatorCategory,
    IndicatorRuntime,
    KaufmanAdaptiveMovingAverageIndicator,
    KaufmanEfficiencyRatioIndicator,
    LaguerreRsiIndicator,
    McGinleyDynamicIndicator,
    NickRypockTrailingReverseIndicator,
    OptimalTrackingIndicator,
    ParabolicSarIndicator,
    SuperTrendIndicator,
    VidyaIndicator,
    VariableMovingAverageIndicator,
    getIndicatorDefinition,
} = require('../src/indicators/index.js');
const { calcParabolicSAR } = require('../src/chart/indicators/calc/parabolicsar.js');
const { calcKAMA } = require('../src/chart/indicators/calc/kama.js');
const { calcKaufmanEfficiencyRatio } = require('../src/chart/indicators/calc/ker.js');
const { calcFRAMA } = require('../src/chart/indicators/calc/frama.js');
const { calcAdaptiveLaguerreFilter } = require('../src/chart/indicators/calc/alf.js');
const { calcLaguerreRSI } = require('../src/chart/indicators/calc/laguerrersi.js');
const { calcAdaptivePriceZone } = require('../src/chart/indicators/calc/apz.js');
const { calcMcGinleyDynamic } = require('../src/chart/indicators/calc/mcginley.js');
const {
    calcNickRypockTrailingReverse,
} = require('../src/chart/indicators/calc/nrtr.js');
const {
    calcOptimalTracking,
} = require('../src/chart/indicators/calc/optimaltracking.js');
const { calcSuperTrend } = require('../src/chart/indicators/calc/supertrend.js');
const { calcVidya } = require('../src/chart/indicators/calc/vidya.js');
const { calcVMA } = require('../src/chart/indicators/calc/vma.js');

const PARAMS = {
    acceleration: 0.025,
    accelerationStep: 0.015,
    accelerationMax: 0.23,
};

function bars(count = 82) {
    return Array.from({ length: count }, (_, index) => {
        const close = 95 + Math.sin(index / 4.2) * 13
            + Math.cos(index / 9.1) * 4 + index * 0.04;
        return {
            time: index + 1,
            open: close - Math.sin(index / 2.3) * 0.8,
            high: close + 1.5 + (index % 5) * 0.18,
            low: close - 1.3 - (index % 4) * 0.16,
            close,
            volume: 1_000 + index * 7,
        };
    });
}

function input(bar) {
    return { time: bar.time, value: bar };
}

function oracle(source) {
    return calcParabolicSAR(source, PARAMS)
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertPoints(runtime, source) {
    const expected = oracle(source);
    const actual = runtime.points('value');
    assert.equal(actual.length, expected.length);
    actual.forEach((point, index) => {
        const value = expected[index];
        assert.equal(point.sourceIndex, value.index);
        assert.equal(point.targetIndex, value.index);
        assert.equal(point.time, value.time);
        const tolerance = Math.max(1, Math.abs(value.value)) * 1e-10;
        assert.ok(
            Math.abs(point.value - value.value) <= tolerance,
            `${point.value} != ${value.value} at ${point.targetIndex}`,
        );
    });
}

function lineOracle(testCase, source) {
    return testCase.calc(source, testCase.params)
        .map((point, index) => ({
            index,
            time: point.time,
            value: point.value,
            metadata: typeof point.up === 'boolean' ? { up: point.up } : undefined,
        }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertLine(runtime, testCase, source) {
    const expected = lineOracle(testCase, source);
    const actual = runtime.points(testCase.outputId ?? 'line');
    assert.equal(actual.length, expected.length);
    actual.forEach((point, index) => {
        const value = expected[index];
        assert.equal(point.sourceIndex, value.index);
        assert.equal(point.targetIndex, value.index);
        assert.equal(point.time, value.time);
        assert.deepEqual(point.metadata, value.metadata);
        const tolerance = Math.max(1, Math.abs(value.value)) * 1e-9;
        assert.ok(
            Math.abs(point.value - value.value) <= tolerance,
            `${point.value} != ${value.value} at ${point.targetIndex}`,
        );
    });
}

const APZ_PARAMS = { period: 7, bandPercentage: 2.4 };

function expectedApz(source, outputId) {
    const expected = calcAdaptivePriceZone(source, APZ_PARAMS);
    return expected[outputId]
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertApzOutput(actual, outputId, source) {
    const values = expectedApz(source, outputId);
    assert.equal(actual.length, values.length, outputId);
    actual.forEach((point, index) => {
        const value = values[index];
        assert.equal(point.sourceIndex, value.index);
        assert.equal(point.targetIndex, value.index);
        assert.equal(point.time, value.time);
        const tolerance = Math.max(1, Math.abs(value.value)) * 1e-9;
        assert.ok(
            Math.abs(point.value - value.value) <= tolerance,
            `${outputId}: ${point.value} != ${value.value} at ${point.targetIndex}`,
        );
    });
}

function assertApz(runtime, source) {
    for (const outputId of ['ma', 'upper', 'lower']) {
        assertApzOutput(runtime.points(outputId), outputId, source);
    }
}

const ADAPTIVE_LINE_CASES = [
    {
        definition: McGinleyDynamicIndicator,
        calc: calcMcGinleyDynamic,
        params: { length: 7 },
    },
    {
        definition: NickRypockTrailingReverseIndicator,
        calc: calcNickRypockTrailingReverse,
        params: { length: 7, multiple: 100 },
    },
    {
        definition: OptimalTrackingIndicator,
        calc: calcOptimalTracking,
        params: {},
    },
    {
        definition: AdaptiveLaguerreFilterIndicator,
        calc: calcAdaptiveLaguerreFilter,
        params: { gamma: 0.55 },
    },
    {
        definition: LaguerreRsiIndicator,
        calc: calcLaguerreRSI,
        params: { gamma: 0.7 },
    },
    {
        definition: KaufmanAdaptiveMovingAverageIndicator,
        calc: calcKAMA,
        params: { length: 8, fastSc: 3, slowSc: 24 },
    },
    {
        definition: KaufmanEfficiencyRatioIndicator,
        calc: calcKaufmanEfficiencyRatio,
        params: { length: 8 },
    },
    {
        definition: FractalAdaptiveMovingAverageIndicator,
        calc: calcFRAMA,
        params: { length: 11 },
    },
    {
        definition: SuperTrendIndicator,
        calc(source, params) {
            const calculated = calcSuperTrend(source, params);
            return calculated.value.map((point, index) => ({
                ...point,
                up: calculated.direction[index].value === null
                    ? undefined
                    : calculated.direction[index].value === 1,
            }));
        },
        params: { length: 7, multiplier: 2.5 },
        outputId: 'value',
    },
    {
        definition: VidyaIndicator,
        calc: calcVidya,
        params: { length: 7 },
    },
    {
        definition: VariableMovingAverageIndicator,
        calc: calcVMA,
        params: { length: 7, volatilityIndex: 0.35 },
    },
];

describe('incremental adaptive indicators', () => {
    it('registers Parabolic SAR with typed recursive state', () => {
        assert.deepEqual(AdaptiveIndicators.map((item) => item.id), [
            'ParabolicSar',
            'McGinleyDynamic',
            'NickRypockTrailingReverse',
            'OptimalTracking',
            'SuperTrend',
            'Vidya',
            'VariableMovingAverage',
            'KaufmanAdaptiveMovingAverage',
            'KaufmanEfficiencyRatio',
            'FractalAdaptiveMovingAverage',
            'AdaptiveLaguerreFilter',
            'LaguerreRSI',
            'AdaptivePriceZone',
        ]);
        assert.equal(getIndicatorDefinition('pARABOLICsAR'), ParabolicSarIndicator);
        assert.equal(ParabolicSarIndicator.category, IndicatorCategory.Trend);
        assert.equal(McGinleyDynamicIndicator.category, IndicatorCategory.Trend);
        assert.equal(NickRypockTrailingReverseIndicator.category, IndicatorCategory.Trend);
        assert.equal(OptimalTrackingIndicator.category, IndicatorCategory.Trend);
        assert.equal(SuperTrendIndicator.category, IndicatorCategory.Trend);
        assert.equal(VidyaIndicator.category, IndicatorCategory.Trend);
        assert.equal(VariableMovingAverageIndicator.category, IndicatorCategory.Trend);
        assert.equal(AdaptiveLaguerreFilterIndicator.category, IndicatorCategory.Trend);
        assert.equal(LaguerreRsiIndicator.category, IndicatorCategory.Momentum);
        assert.equal(AdaptivePriceZoneIndicator.category, IndicatorCategory.Volatility);
        assert.ok(Object.isFrozen(ParabolicSarIndicator));
        assert.throws(
            () => ParabolicSarIndicator.processorFactory({
                acceleration: 0.3,
                accelerationStep: 0.02,
                accelerationMax: 0.2,
            }),
            /cannot exceed accelerationMax/,
        );
        assert.throws(
            () => AdaptiveLaguerreFilterIndicator.processorFactory({ gamma: 1 }),
            /gamma/,
        );
        assert.throws(
            () => LaguerreRsiIndicator.processorFactory({ gamma: 0 }),
            /gamma/,
        );
    });

    it('Adaptive Price Zone matches every batch append and initial reset', () => {
        const source = bars();
        const runtime = new IndicatorRuntime({
            definition: AdaptivePriceZoneIndicator,
            parameters: APZ_PARAMS,
            checkpointInterval: 11,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertApz(runtime, source.slice(0, index + 1));
        }

        const reset = new IndicatorRuntime({
            definition: AdaptivePriceZoneIndicator,
            parameters: APZ_PARAMS,
        });
        reset.reset(source.map(input));
        assertApz(reset, source);
    });

    it('Adaptive Price Zone matches preview, gaps and correction replay', () => {
        const source = bars(66);
        const committed = source.slice(0, 50);
        const runtime = new IndicatorRuntime({
            definition: AdaptivePriceZoneIndicator,
            parameters: APZ_PARAMS,
            checkpointInterval: 8,
        });
        runtime.reset(committed.map(input));
        for (const delta of [4, -7, 10, -2]) {
            const probe = { ...source[50], close: source[50].close + delta };
            runtime.update(input(probe), false);
            assertApz(runtime, [...committed, probe]);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[50]), true);
        const finalized = [...committed, source[50]];
        assertApz(runtime, finalized);
        const corrected = { ...source[21], close: source[21].close + 8 };
        runtime.correct(21, input(corrected));
        finalized[21] = corrected;
        assertApz(runtime, finalized);

        const withGap = bars(43);
        withGap[16] = { ...withGap[16], close: Number.NaN };
        runtime.reset(withGap.map(input));
        assertApz(runtime, withGap);
        const initialGap = bars(30);
        initialGap[3] = { ...initialGap[3], close: Number.NaN };
        runtime.reset(initialGap.map(input));
        assertApz(runtime, initialGap);

        const streaming = new IndicatorRuntime({
            definition: AdaptivePriceZoneIndicator,
            parameters: APZ_PARAMS,
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[50]));
        const all = [...committed, source[50]];
        for (const outputId of ['ma', 'upper', 'lower']) {
            assertApzOutput(
                points.filter((point) => point.outputId === outputId),
                outputId,
                all,
            );
        }
    });

    it('matches every batch append and initial reset', () => {
        const source = bars();
        const runtime = new IndicatorRuntime({
            definition: ParabolicSarIndicator,
            parameters: PARAMS,
            checkpointInterval: 11,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertPoints(runtime, source.slice(0, index + 1));
        }

        const reset = new IndicatorRuntime({
            definition: ParabolicSarIndicator,
            parameters: PARAMS,
        });
        reset.reset(source.map(input));
        assertPoints(reset, source);
    });

    it('matches preview, final, gaps, reset and correction replay', () => {
        const source = bars(68);
        const committed = source.slice(0, 51);
        const runtime = new IndicatorRuntime({
            definition: ParabolicSarIndicator,
            parameters: PARAMS,
            checkpointInterval: 8,
        });
        runtime.reset(committed.map(input));

        for (const delta of [3, -6, 9, -2]) {
            const probe = {
                ...source[51],
                close: source[51].close + delta,
                high: source[51].high + Math.max(delta, 0),
                low: source[51].low + Math.min(delta, 0),
            };
            runtime.update(input(probe), false);
            assertPoints(runtime, [...committed, probe]);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[51]), true);
        const finalized = [...committed, source[51]];
        assertPoints(runtime, finalized);

        const corrected = {
            ...source[22],
            high: source[22].high + 8,
            low: source[22].low - 7,
        };
        runtime.correct(22, input(corrected));
        finalized[22] = corrected;
        assertPoints(runtime, finalized);

        const withGaps = bars(44);
        withGaps[0] = { ...withGaps[0], high: Number.NaN };
        withGaps[13] = { ...withGaps[13], low: Number.NaN };
        withGaps[29] = { ...withGaps[29], high: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertPoints(runtime, withGaps);

        const streaming = new IndicatorRuntime({
            definition: ParabolicSarIndicator,
            parameters: PARAMS,
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[51]));
        const expected = oracle([...committed, source[51]]);
        assert.equal(points.length, expected.length);
        points.forEach((point, index) => {
            assert.equal(point.targetIndex, expected[index].index);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-10;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
        assert.equal(streaming.retainedFrom, committed.length);
        assert.equal(streaming.hasPreview, true);
    });

    for (const testCase of ADAPTIVE_LINE_CASES) {
        it(`${testCase.definition.name} matches every batch append and initial reset`, () => {
            const source = bars();
            const runtime = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
                checkpointInterval: 11,
            });
            for (let index = 0; index < source.length; index += 1) {
                runtime.update(input(source[index]), true);
                assertLine(runtime, testCase, source.slice(0, index + 1));
            }
            const reset = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
            });
            reset.reset(source.map(input));
            assertLine(reset, testCase, source);
        });

        it(`${testCase.definition.name} matches preview, gaps and correction replay`, () => {
            const source = bars(66);
            const committed = source.slice(0, 50);
            const runtime = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
                checkpointInterval: 8,
            });
            runtime.reset(committed.map(input));
            for (const delta of [4, -7, 10, -2]) {
                const probe = {
                    ...source[50],
                    close: source[50].close + delta,
                    high: source[50].high + Math.max(delta, 0),
                    low: source[50].low + Math.min(delta, 0),
                };
                runtime.update(input(probe), false);
                assertLine(runtime, testCase, [...committed, probe]);
                assert.equal(runtime.committedCount, committed.length);
            }

            runtime.update(input(source[50]), true);
            const finalized = [...committed, source[50]];
            assertLine(runtime, testCase, finalized);
            const corrected = {
                ...source[21], close: source[21].close + 8, high: source[21].high + 8,
            };
            runtime.correct(21, input(corrected));
            finalized[21] = corrected;
            assertLine(runtime, testCase, finalized);

            const withGap = bars(43);
            withGap[16] = { ...withGap[16], close: Number.NaN, high: Number.NaN };
            runtime.reset(withGap.map(input));
            assertLine(runtime, testCase, withGap);
            const initialGap = bars(30);
            initialGap[3] = {
                ...initialGap[3], close: Number.NaN, low: Number.NaN,
            };
            runtime.reset(initialGap.map(input));
            assertLine(runtime, testCase, initialGap);

            const streaming = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
            });
            const points = streaming.resetStreaming(committed.map(input), input(source[50]));
            const expected = lineOracle(testCase, [...committed, source[50]]);
            assert.equal(points.length, expected.length);
            points.forEach((point, index) => {
                assert.equal(point.targetIndex, expected[index].index);
                assert.deepEqual(point.metadata, expected[index].metadata);
                const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-9;
                assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
            });
        });
    }
});
