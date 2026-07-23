const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    EhlersFisherTransformIndicator,
    IndicatorRuntime,
} = require('../src/indicators/index.js');
const { calcEhlerFisher } = require('../src/chart/indicators/calc/ehlerfisher.js');

const OUTPUTS = ['main', 'trigger'];

function bars(count = 72) {
    return Array.from({ length: count }, (_, index) => {
        const middle = 100 + Math.sin(index / 3.4) * 8 + index * 0.1;
        const spread = 1 + (index % 7) * 0.27;
        return {
            time: index + 1,
            open: middle - 0.2,
            high: middle + spread,
            low: middle - spread * 0.8,
            close: middle + 0.3,
            volume: 1_000 + index * 5,
        };
    });
}

function input(bar) {
    return { time: bar.time, value: bar };
}

function oracle(source, parameters, outputId) {
    return calcEhlerFisher(source, parameters)[outputId]
        .map((point, index) => ({ index, ...point }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertPoints(actual, expected, outputId) {
    assert.equal(actual.length, expected.length, outputId);
    actual.forEach((point, index) => {
        const wanted = expected[index];
        assert.equal(point.outputId, outputId);
        assert.equal(point.sourceIndex, wanted.index);
        assert.equal(point.targetIndex, wanted.index);
        assert.equal(point.time, wanted.time);
        const tolerance = Math.max(1, Math.abs(wanted.value)) * 1e-10;
        assert.ok(
            Math.abs(point.value - wanted.value) <= tolerance,
            `${outputId}: ${point.value} != ${wanted.value} at ${wanted.index}`,
        );
    });
}

function assertRuntime(runtime, source, parameters) {
    for (const outputId of OUTPUTS)
        assertPoints(runtime.points(outputId), oracle(source, parameters, outputId), outputId);
}

describe('incremental Ehlers Fisher Transform', () => {
    it('exposes synchronized main and trigger lines', () => {
        assert.deepEqual(
            EhlersFisherTransformIndicator.outputs.map((output) => output.id),
            OUTPUTS,
        );
    });

    it('matches every batch append and a full reset', () => {
        const source = bars();
        const parameters = { length: 7 };
        const runtime = new IndicatorRuntime({
            definition: EhlersFisherTransformIndicator,
            parameters,
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertRuntime(runtime, source.slice(0, index + 1), parameters);
        }
        const reset = new IndicatorRuntime({
            definition: EhlersFisherTransformIndicator,
            parameters,
        });
        reset.reset(source.map(input));
        assertRuntime(reset, source, parameters);
    });

    it('matches repeated previews, gaps, correction replay and streaming reset', () => {
        const source = bars(58);
        const parameters = { length: 7 };
        const committed = source.slice(0, 42);
        const runtime = new IndicatorRuntime({
            definition: EhlersFisherTransformIndicator,
            parameters,
            checkpointInterval: 8,
        });
        runtime.reset(committed.map(input));

        for (const delta of [2, -5, 8, -1]) {
            const probe = {
                ...source[42],
                high: source[42].high + Math.max(delta, 0),
                low: source[42].low + Math.min(delta, 0),
            };
            runtime.update(input(probe), false);
            assertRuntime(runtime, [...committed, probe], parameters);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[42]), true);
        const finalized = [...committed, source[42]];
        assertRuntime(runtime, finalized, parameters);
        const corrected = {
            ...source[17],
            high: source[17].high + 6,
            low: source[17].low - 3,
        };
        runtime.correct(17, input(corrected));
        finalized[17] = corrected;
        assertRuntime(runtime, finalized, parameters);

        const withGaps = bars(38);
        withGaps[3] = { ...withGaps[3], low: Number.NaN };
        withGaps[19] = { ...withGaps[19], high: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertRuntime(runtime, withGaps, parameters);

        const streaming = new IndicatorRuntime({
            definition: EhlersFisherTransformIndicator,
            parameters,
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[42]));
        for (const outputId of OUTPUTS) {
            assertPoints(
                points.filter((point) => point.outputId === outputId),
                oracle([...committed, source[42]], parameters, outputId),
                outputId,
            );
        }
        assert.equal(streaming.retainedFrom, committed.length);
        assert.equal(streaming.hasPreview, true);
    });
});
