const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    AverageDirectionalIndexIndicator,
    CommodityChannelIndexIndicator,
    DirectionalIndexIndicator,
    FractalDimensionIndicator,
    HurstExponentIndicator,
    IndicatorCategory,
    IndicatorRuntime,
    MarketMeannessIndexIndicator,
    RecursiveStatisticalIndicators,
    getIndicatorDefinition,
} = require('../src/indicators/index.js');
const { calcADX } = require('../src/chart/indicators/calc/adx.js');
const { calcCCI } = require('../src/chart/indicators/calc/cci.js');
const { calcDX } = require('../src/chart/indicators/calc/dx.js');
const {
    calcFractalDimension,
} = require('../src/chart/indicators/calc/fractaldimension.js');
const { calcHurstExponent } = require('../src/chart/indicators/calc/hurstexponent.js');
const { calcMarketMeannessIndex } = require('../src/chart/indicators/calc/mmi.js');

function bars(count = 90) {
    return Array.from({ length: count }, (_, index) => {
        const close = 105 + Math.sin(index / 3.8) * 10
            + Math.cos(index / 11.2) * 4 + index * 0.07;
        return {
            time: index + 1,
            open: close - Math.cos(index / 2.4) * 0.8,
            high: close + 1.5 + (index % 5) * 0.21,
            low: close - 1.2 - (index % 4) * 0.17,
            close,
            volume: 900 + index * 13,
        };
    });
}

function input(bar) {
    return { time: bar.time, value: bar };
}

function oracle(testCase, source, outputId) {
    const calculated = testCase.calc(source, testCase.params);
    const series = Array.isArray(calculated) ? calculated : calculated[outputId];
    return series
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertOutput(runtime, outputId, expected, epsilon) {
    const actual = runtime.points(outputId);
    assert.equal(actual.length, expected.length, `${outputId} point count`);
    actual.forEach((point, index) => {
        const value = expected[index];
        assert.equal(point.outputId, outputId);
        assert.equal(point.sourceIndex, value.index);
        assert.equal(point.targetIndex, value.index);
        assert.equal(point.time, value.time);
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
            oracle(testCase, source, outputId),
            testCase.epsilon,
        );
    }
}

const CASES = [
    {
        definition: AverageDirectionalIndexIndicator,
        calc: calcADX,
        params: { length: 7 },
        outputs: ['plusDI', 'minusDI', 'adx'],
        epsilon: 1e-9,
    },
    {
        definition: DirectionalIndexIndicator,
        calc: calcDX,
        params: { length: 7 },
        outputs: ['plusDI', 'minusDI', 'dx'],
        epsilon: 1e-9,
    },
    {
        definition: CommodityChannelIndexIndicator,
        calc: calcCCI,
        params: { length: 9 },
        outputs: ['line'],
        epsilon: 1e-9,
    },
    {
        definition: FractalDimensionIndicator,
        calc: calcFractalDimension,
        params: { length: 9 },
        outputs: ['line'],
        epsilon: 1e-9,
    },
    {
        definition: HurstExponentIndicator,
        calc: calcHurstExponent,
        params: { length: 9 },
        outputs: ['line'],
        epsilon: 1e-8,
    },
    {
        definition: MarketMeannessIndexIndicator,
        calc: calcMarketMeannessIndex,
        params: { length: 9 },
        outputs: ['line'],
        epsilon: 1e-10,
    },
];

describe('incremental recursive and statistical indicators', () => {
    it('registers typed definitions with painter-compatible output schemas', () => {
        assert.deepEqual(RecursiveStatisticalIndicators.map((item) => item.id), [
            'AverageDirectionalIndex',
            'DirectionalIndex',
            'CommodityChannelIndex',
            'FractalDimension',
            'HurstExponent',
            'MarketMeannessIndex',
        ]);
        assert.deepEqual(AverageDirectionalIndexIndicator.outputs.map((item) => item.id), [
            'plusDI', 'minusDI', 'adx',
        ]);
        assert.deepEqual(DirectionalIndexIndicator.outputs.map((item) => item.id), [
            'plusDI', 'minusDI', 'dx',
        ]);
        assert.equal(getIndicatorDefinition('aVERAGEdIRECTIONALiNDEX'), AverageDirectionalIndexIndicator);
        assert.equal(AverageDirectionalIndexIndicator.category, IndicatorCategory.Trend);
        assert.equal(DirectionalIndexIndicator.category, IndicatorCategory.Trend);
        assert.equal(CommodityChannelIndexIndicator.category, IndicatorCategory.Statistical);
        assert.equal(FractalDimensionIndicator.category, IndicatorCategory.Statistical);
        assert.equal(HurstExponentIndicator.category, IndicatorCategory.Statistical);
        assert.equal(MarketMeannessIndexIndicator.category, IndicatorCategory.MarketStrength);
        assert.ok(RecursiveStatisticalIndicators.every((item) => Object.isFrozen(item)));
        assert.throws(
            () => AverageDirectionalIndexIndicator.processorFactory({ length: 1 }),
            /integer from 2 to 100/,
        );
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
            const source = bars(70);
            const committed = source.slice(0, 52);
            const runtime = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
                checkpointInterval: 8,
            });
            runtime.reset(committed.map(input));

            for (const delta of [2, -4, 7, -1]) {
                const probe = {
                    ...source[52],
                    close: source[52].close + delta,
                    high: source[52].high + Math.max(delta, 0),
                    low: source[52].low + Math.min(delta, 0),
                };
                runtime.update(input(probe), false);
                assertCase(runtime, testCase, [...committed, probe]);
                assert.equal(runtime.committedCount, committed.length);
            }

            runtime.update(input(source[52]), true);
            const finalized = [...committed, source[52]];
            assertCase(runtime, testCase, finalized);

            const corrected = {
                ...source[23],
                close: source[23].close + 5,
                high: source[23].high + 5,
            };
            runtime.correct(23, input(corrected));
            finalized[23] = corrected;
            assertCase(runtime, testCase, finalized);

            const withGaps = bars(48);
            withGaps[6] = { ...withGaps[6], close: Number.NaN };
            withGaps[19] = { ...withGaps[19], high: Number.NaN };
            withGaps[34] = { ...withGaps[34], low: Number.NaN };
            runtime.reset(withGaps.map(input));
            assertCase(runtime, testCase, withGaps);

            const streaming = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params,
            });
            const points = streaming.resetStreaming(committed.map(input), input(source[52]));
            const expected = testCase.outputs.flatMap((outputId) => (
                oracle(testCase, [...committed, source[52]], outputId)
                    .map((point) => ({ ...point, outputId }))
            ));
            assert.equal(points.length, expected.length);
            points.forEach((point, index) => {
                assert.equal(point.outputId, expected[index].outputId);
                assert.equal(point.targetIndex, expected[index].index);
                const tolerance = Math.max(1, Math.abs(expected[index].value)) * testCase.epsilon;
                assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
            });
            assert.equal(streaming.retainedFrom, committed.length);
            assert.equal(streaming.hasPreview, true);
        });
    }
});
