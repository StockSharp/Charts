const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    ChaikinVolatilityIndicator,
    GopalakrishnanRangeIndexIndicator,
    HistoricalVolatilityRatioIndicator,
    IndicatorCategory,
    IndicatorRuntime,
    MassIndexIndicator,
    VolatilityIndicators,
    getIndicatorDefinition,
} = require('../src/indicators/index.js');
const {
    calcChaikinVolatility,
} = require('../src/chart/indicators/calc/chaikinvolatility.js');
const { calcGRI } = require('../src/chart/indicators/calc/gri.js');
const {
    calcHistoricalVolatilityRatio,
} = require('../src/chart/indicators/calc/hvr.js');
const { calcMassIndex } = require('../src/chart/indicators/calc/massindex.js');

function bars(count = 72) {
    return Array.from({ length: count }, (_, index) => {
        const midpoint = 100 + Math.sin(index / 4.1) * 7 + index * 0.08;
        const spread = 0.8 + (index % 9) * 0.31 + Math.cos(index / 3.3) * 0.2;
        return {
            time: index + 1,
            open: midpoint - 0.2,
            high: midpoint + spread,
            low: midpoint - spread * 0.73,
            close: midpoint + 0.3,
            volume: 1_000 + index * 7,
        };
    });
}

function input(bar) {
    return { time: bar.time, value: bar };
}

function oracle(source, parameters, calc = calcChaikinVolatility) {
    return calc(source, parameters)
        .map((point, index) => ({ index, ...point }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertOutput(runtime, source, parameters, calc = calcChaikinVolatility) {
    const expected = oracle(source, parameters, calc);
    const actual = runtime.points('line');
    assert.equal(actual.length, expected.length);
    actual.forEach((point, index) => {
        const wanted = expected[index];
        assert.equal(point.outputId, 'line');
        assert.equal(point.sourceIndex, wanted.index);
        assert.equal(point.targetIndex, wanted.index);
        assert.equal(point.time, wanted.time);
        const tolerance = Math.max(1, Math.abs(wanted.value)) * 1e-10;
        assert.ok(
            Math.abs(point.value - wanted.value) <= tolerance,
            `${point.value} != ${wanted.value} at ${wanted.index}`,
        );
    });
}

describe('incremental volatility indicators', () => {
    it('registers Chaikin Volatility with StockSharp periods and typed metadata', () => {
        assert.deepEqual(VolatilityIndicators.map((item) => item.id), [
            'ChaikinVolatility',
            'MassIndex',
            'GopalakrishnanRangeIndex',
            'HistoricalVolatilityRatio',
        ]);
        assert.equal(getIndicatorDefinition('cHAIKINvOLATILITY'), ChaikinVolatilityIndicator);
        assert.equal(ChaikinVolatilityIndicator.category, IndicatorCategory.Volatility);
        assert.equal(MassIndexIndicator.category, IndicatorCategory.Volatility);
        assert.equal(GopalakrishnanRangeIndexIndicator.category, IndicatorCategory.Volatility);
        assert.equal(HistoricalVolatilityRatioIndicator.category, IndicatorCategory.Volatility);
        assert.deepEqual(
            ChaikinVolatilityIndicator.parameters.map((parameter) => parameter.defaultValue),
            [32, 5],
        );
        assert.ok(Object.isFrozen(ChaikinVolatilityIndicator));
        assert.throws(
            () => ChaikinVolatilityIndicator.processorFactory({ emaLength: 0, rocLength: 5 }),
            /emaLength must be an integer from 1 to 500/,
        );
    });

    it('matches Mass Index across append, preview, gaps and correction replay', () => {
        const source = bars();
        const parameters = { length: 7, emaLength: 3 };
        const runtime = new IndicatorRuntime({
            definition: MassIndexIndicator,
            parameters,
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertOutput(runtime, source.slice(0, index + 1), parameters, calcMassIndex);
        }

        const committed = source.slice(0, 42);
        runtime.reset(committed.map(input));
        for (const delta of [2, -4, 7, -1]) {
            const probe = {
                ...source[42],
                high: source[42].high + Math.max(delta, 0),
                low: source[42].low + Math.min(delta, 0),
            };
            runtime.update(input(probe), false);
            assertOutput(
                runtime,
                [...committed, probe],
                parameters,
                calcMassIndex,
            );
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[42]), true);
        const finalized = [...committed, source[42]];
        const corrected = {
            ...source[17],
            high: source[17].high + 5,
            low: source[17].low - 2,
        };
        runtime.correct(17, input(corrected));
        finalized[17] = corrected;
        assertOutput(runtime, finalized, parameters, calcMassIndex);

        const withGaps = bars(37);
        withGaps[3] = { ...withGaps[3], low: Number.NaN };
        withGaps[19] = { ...withGaps[19], high: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertOutput(runtime, withGaps, parameters, calcMassIndex);

        const streaming = new IndicatorRuntime({
            definition: MassIndexIndicator,
            parameters,
        });
        const streamed = streaming.resetStreaming(committed.map(input), input(source[42]));
        const expected = oracle(
            [...committed, source[42]],
            parameters,
            calcMassIndex,
        );
        assert.equal(streamed.length, expected.length);
        streamed.forEach((point, index) => {
            assert.equal(point.targetIndex, expected[index].index);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-10;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
        assert.equal(streaming.retainedFrom, committed.length);
        assert.equal(streaming.hasPreview, true);
    });

    it('matches batch on every append and a full reset', () => {
        const source = bars();
        const parameters = { emaLength: 5, rocLength: 3 };
        const runtime = new IndicatorRuntime({
            definition: ChaikinVolatilityIndicator,
            parameters,
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertOutput(runtime, source.slice(0, index + 1), parameters);
        }

        const reset = new IndicatorRuntime({
            definition: ChaikinVolatilityIndicator,
            parameters,
        });
        reset.reset(source.map(input));
        assertOutput(reset, source, parameters);
    });

    it('matches previews, finalization, gaps, correction replay and streaming reset', () => {
        const source = bars(58);
        const parameters = { emaLength: 5, rocLength: 3 };
        const committed = source.slice(0, 42);
        const runtime = new IndicatorRuntime({
            definition: ChaikinVolatilityIndicator,
            parameters,
            checkpointInterval: 8,
        });
        runtime.reset(committed.map(input));

        for (const delta of [2, -4, 7, -1]) {
            const probe = {
                ...source[42],
                high: source[42].high + Math.max(delta, 0),
                low: source[42].low + Math.min(delta, 0),
            };
            runtime.update(input(probe), false);
            assertOutput(runtime, [...committed, probe], parameters);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[42]), true);
        const finalized = [...committed, source[42]];
        assertOutput(runtime, finalized, parameters);

        const corrected = {
            ...source[17],
            high: source[17].high + 5,
            low: source[17].low - 2,
        };
        runtime.correct(17, input(corrected));
        finalized[17] = corrected;
        assertOutput(runtime, finalized, parameters);

        const withGaps = bars(37);
        withGaps[3] = { ...withGaps[3], low: Number.NaN };
        withGaps[19] = { ...withGaps[19], high: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertOutput(runtime, withGaps, parameters);

        const streaming = new IndicatorRuntime({
            definition: ChaikinVolatilityIndicator,
            parameters,
        });
        const streamed = streaming.resetStreaming(committed.map(input), input(source[42]));
        const expected = oracle([...committed, source[42]], parameters);
        assert.equal(streamed.length, expected.length);
        streamed.forEach((point, index) => {
            assert.equal(point.targetIndex, expected[index].index);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-10;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
        assert.equal(streaming.retainedFrom, committed.length);
        assert.equal(streaming.hasPreview, true);
    });

    it('matches Gopalakrishnan Range Index across append, preview, gaps and replay', () => {
        const source = bars();
        const parameters = { length: 7 };
        const runtime = new IndicatorRuntime({
            definition: GopalakrishnanRangeIndexIndicator,
            parameters,
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertOutput(runtime, source.slice(0, index + 1), parameters, calcGRI);
        }

        const committed = source.slice(0, 42);
        runtime.reset(committed.map(input));
        for (const delta of [2, -4, 7, -1]) {
            const probe = {
                ...source[42],
                high: source[42].high + Math.max(delta, 0),
                low: source[42].low + Math.min(delta, 0),
            };
            runtime.update(input(probe), false);
            assertOutput(runtime, [...committed, probe], parameters, calcGRI);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[42]), true);
        const finalized = [...committed, source[42]];
        const corrected = {
            ...source[17],
            high: source[17].high + 5,
            low: source[17].low - 2,
        };
        runtime.correct(17, input(corrected));
        finalized[17] = corrected;
        assertOutput(runtime, finalized, parameters, calcGRI);

        const withGaps = bars(37);
        withGaps[3] = { ...withGaps[3], low: Number.NaN };
        withGaps[19] = { ...withGaps[19], high: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertOutput(runtime, withGaps, parameters, calcGRI);

        const streaming = new IndicatorRuntime({
            definition: GopalakrishnanRangeIndexIndicator,
            parameters,
        });
        const streamed = streaming.resetStreaming(committed.map(input), input(source[42]));
        const expected = oracle([...committed, source[42]], parameters, calcGRI);
        assert.equal(streamed.length, expected.length);
        streamed.forEach((point, index) => {
            assert.equal(point.targetIndex, expected[index].index);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-10;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
        assert.equal(streaming.retainedFrom, committed.length);
        assert.equal(streaming.hasPreview, true);
    });

    it('matches Historical Volatility Ratio across append, preview, gaps and replay', () => {
        const source = bars();
        const parameters = { shortPeriod: 5, longPeriod: 11 };
        const runtime = new IndicatorRuntime({
            definition: HistoricalVolatilityRatioIndicator,
            parameters,
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertOutput(
                runtime,
                source.slice(0, index + 1),
                parameters,
                calcHistoricalVolatilityRatio,
            );
        }

        const committed = source.slice(0, 42);
        runtime.reset(committed.map(input));
        for (const delta of [2, -4, 7, -1]) {
            const probe = { ...source[42], close: source[42].close + delta };
            runtime.update(input(probe), false);
            assertOutput(
                runtime,
                [...committed, probe],
                parameters,
                calcHistoricalVolatilityRatio,
            );
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[42]), true);
        const finalized = [...committed, source[42]];
        const corrected = { ...source[17], close: source[17].close + 5 };
        runtime.correct(17, input(corrected));
        finalized[17] = corrected;
        assertOutput(runtime, finalized, parameters, calcHistoricalVolatilityRatio);

        const withGaps = bars(37);
        withGaps[3] = { ...withGaps[3], close: Number.NaN };
        withGaps[19] = { ...withGaps[19], close: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertOutput(runtime, withGaps, parameters, calcHistoricalVolatilityRatio);

        const streaming = new IndicatorRuntime({
            definition: HistoricalVolatilityRatioIndicator,
            parameters,
        });
        const streamed = streaming.resetStreaming(committed.map(input), input(source[42]));
        const expected = oracle(
            [...committed, source[42]],
            parameters,
            calcHistoricalVolatilityRatio,
        );
        assert.equal(streamed.length, expected.length);
        streamed.forEach((point, index) => {
            assert.equal(point.targetIndex, expected[index].index);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-9;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
        assert.equal(streaming.retainedFrom, committed.length);
        assert.equal(streaming.hasPreview, true);
    });
});
