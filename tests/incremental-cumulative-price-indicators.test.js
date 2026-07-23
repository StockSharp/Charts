const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    AccumulationDistributionLineIndicator,
    CumulativePriceIndicators,
    IndicatorCategory,
    IndicatorRuntime,
    MedianPriceIndicator,
    PassThroughIndicator,
    ShiftIndicator,
    TimeWeightedAveragePriceIndicator,
    TypicalPriceIndicator,
    VolumeWeightedAveragePriceIndicator,
    WeightedClosePriceIndicator,
    WilliamsAccumulationDistributionIndicator,
    WilliamsVariableAccumulationDistributionIndicator,
    getIndicatorDefinition,
} = require('../src/indicators/index.js');
const { calcTWAP } = require('../src/chart/indicators/calc/twap.js');
const { calcVWAP } = require('../src/chart/indicators/calc/vwap.js');
const { calcADL } = require('../src/chart/indicators/calc/adl.js');
const { calcMedianPrice } = require('../src/chart/indicators/calc/medianprice.js');
const { calcPassThrough } = require('../src/chart/indicators/calc/passthrough.js');
const { calcShift } = require('../src/chart/indicators/calc/shift.js');
const { calcTypicalPrice } = require('../src/chart/indicators/calc/typicalprice.js');
const {
    calcWeightedClosePrice,
} = require('../src/chart/indicators/calc/weightedcloseprice.js');
const { calcWilliamsAD } = require('../src/chart/indicators/calc/williamsad.js');
const { calcWVAD } = require('../src/chart/indicators/calc/wvad.js');

function bars(count = 70) {
    return Array.from({ length: count }, (_, index) => {
        const close = 75 + Math.sin(index / 4.6) * 8 + index * 0.12;
        return {
            time: index + 1,
            open: close - 0.5,
            high: close + 1.3 + (index % 4) * 0.15,
            low: close - 1.1 - (index % 3) * 0.12,
            close,
            volume: 600 + (index % 9) * 80 + index * 4,
        };
    });
}

function input(bar) {
    return { time: bar.time, value: bar };
}

function oracle(testCase, source) {
    return testCase.calc(source, testCase.params ?? {})
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertCase(runtime, testCase, source) {
    const expected = oracle(testCase, source);
    const actual = runtime.points('line');
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

const CASES = [
    { definition: PassThroughIndicator, calc: calcPassThrough },
    { definition: ShiftIndicator, calc: calcShift, params: { length: 3 } },
    { definition: MedianPriceIndicator, calc: calcMedianPrice },
    { definition: TypicalPriceIndicator, calc: calcTypicalPrice },
    { definition: WeightedClosePriceIndicator, calc: calcWeightedClosePrice },
    { definition: TimeWeightedAveragePriceIndicator, calc: calcTWAP },
    { definition: VolumeWeightedAveragePriceIndicator, calc: calcVWAP },
    { definition: AccumulationDistributionLineIndicator, calc: calcADL },
    { definition: WilliamsAccumulationDistributionIndicator, calc: calcWilliamsAD },
    {
        definition: WilliamsVariableAccumulationDistributionIndicator,
        calc: calcWVAD,
    },
];

describe('incremental cumulative price indicators', () => {
    it('registers typed cumulative price and volume definitions', () => {
        assert.deepEqual(CumulativePriceIndicators.map((item) => item.id), [
            'PassThroughIndicator',
            'Shift',
            'MedianPrice',
            'TypicalPrice',
            'WeightedClosePrice',
            'TimeWeightedAveragePrice',
            'VolumeWeightedAveragePrice',
            'AccumulationDistributionLine',
            'WilliamsAccumulationDistribution',
            'WilliamsVariableAccumulationDistribution',
        ]);
        assert.equal(
            getIndicatorDefinition('tIMEwEIGHTEDaVERAGEpRICE'),
            TimeWeightedAveragePriceIndicator,
        );
        assert.equal(TimeWeightedAveragePriceIndicator.category, IndicatorCategory.Price);
        assert.equal(MedianPriceIndicator.category, IndicatorCategory.Price);
        assert.equal(TypicalPriceIndicator.category, IndicatorCategory.Price);
        assert.equal(WeightedClosePriceIndicator.category, IndicatorCategory.Price);
        assert.equal(PassThroughIndicator.category, IndicatorCategory.Price);
        assert.equal(ShiftIndicator.category, IndicatorCategory.Price);
        assert.equal(VolumeWeightedAveragePriceIndicator.category, IndicatorCategory.Volume);
        assert.equal(AccumulationDistributionLineIndicator.category, IndicatorCategory.Volume);
        assert.equal(
            WilliamsAccumulationDistributionIndicator.category,
            IndicatorCategory.Volume,
        );
        assert.equal(
            WilliamsVariableAccumulationDistributionIndicator.category,
            IndicatorCategory.Volume,
        );
        assert.ok(CumulativePriceIndicators.every((item) => Object.isFrozen(item)));
    });

    it('keeps Shift output on the current candle after its warm-up gate', () => {
        const source = bars(6);
        const runtime = new IndicatorRuntime({
            definition: ShiftIndicator,
            parameters: { length: 3 },
        });
        runtime.reset(source.map(input));
        assert.deepEqual(runtime.points('line').map((point) => ({
            sourceIndex: point.sourceIndex,
            targetIndex: point.targetIndex,
            value: point.value,
        })), source.slice(3).map((bar, offset) => ({
            sourceIndex: offset + 3,
            targetIndex: offset + 3,
            value: bar.close,
        })));
    });

    for (const testCase of CASES) {
        it(`${testCase.definition.name} matches every batch append and reset`, () => {
            const source = bars();
            const runtime = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params ?? {},
                checkpointInterval: 13,
            });
            for (let index = 0; index < source.length; index += 1) {
                runtime.update(input(source[index]), true);
                assertCase(runtime, testCase, source.slice(0, index + 1));
            }

            const reset = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params ?? {},
            });
            reset.reset(source.map(input));
            assertCase(reset, testCase, source);
        });

        it(`${testCase.definition.name} matches preview, final, gaps and correction replay`, () => {
            const source = bars(58);
            const committed = source.slice(0, 43);
            const runtime = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params ?? {},
                checkpointInterval: 8,
            });
            runtime.reset(committed.map(input));

            for (const delta of [2, -4, 7, -1]) {
                const probe = {
                    ...source[43],
                    close: source[43].close + delta,
                    high: source[43].high + Math.max(delta, 0),
                    low: source[43].low + Math.min(delta, 0),
                    volume: source[43].volume + delta * 20,
                };
                runtime.update(input(probe), false);
                assertCase(runtime, testCase, [...committed, probe]);
                assert.equal(runtime.committedCount, committed.length);
            }

            runtime.update(input(source[43]), true);
            const finalized = [...committed, source[43]];
            assertCase(runtime, testCase, finalized);

            const corrected = {
                ...source[17],
                close: source[17].close + 5,
                high: source[17].high + 5,
                volume: source[17].volume + 300,
            };
            runtime.correct(17, input(corrected));
            finalized[17] = corrected;
            assertCase(runtime, testCase, finalized);

            const withGaps = bars(36);
            withGaps[5] = { ...withGaps[5], high: Number.NaN };
            withGaps[14] = { ...withGaps[14], volume: Number.NaN };
            withGaps[25] = { ...withGaps[25], close: Number.NaN };
            runtime.reset(withGaps.map(input));
            assertCase(runtime, testCase, withGaps);

            const streaming = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: testCase.params ?? {},
            });
            const points = streaming.resetStreaming(committed.map(input), input(source[43]));
            const expected = oracle(testCase, [...committed, source[43]]);
            assert.equal(points.length, expected.length);
            points.forEach((point, index) => {
                assert.equal(point.targetIndex, expected[index].index);
                const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-10;
                assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
            });
            assert.equal(streaming.retainedFrom, committed.length);
            assert.equal(streaming.hasPreview, true);
        });
    }
});
