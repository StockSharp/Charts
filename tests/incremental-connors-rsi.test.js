const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    ConnorsRsiIndicator,
    IndicatorRuntime,
} = require('../src/indicators/index.js');
const { calcConnorsRSI } = require('../src/chart/indicators/calc/connorsrsi.js');

const OUTPUTS = ['rsi', 'updown', 'rocrsi', 'crsi'];

function bars(count = 76) {
    return Array.from({ length: count }, (_, index) => {
        const close = 95 + Math.sin(index / 2.7) * 6 + Math.cos(index / 6.3) * 3 + index * 0.07;
        return {
            time: index + 1,
            open: close - 0.3,
            high: close + 1,
            low: close - 1,
            close,
            volume: 700 + index * 13,
        };
    });
}

function input(bar) {
    return { time: bar.time, value: bar };
}

function oracle(source, parameters, outputId) {
    return calcConnorsRSI(source, parameters)[outputId]
        .map((point, index) => ({ index, ...point }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertOutputPoints(actual, expected, outputId) {
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
        assertOutputPoints(runtime.points(outputId), oracle(source, parameters, outputId), outputId);
}

describe('incremental Connors RSI', () => {
    it('exposes all four StockSharp output lines', () => {
        assert.deepEqual(
            ConnorsRsiIndicator.outputs.map((output) => output.id),
            OUTPUTS,
        );
    });

    it('matches every batch append and a full reset', () => {
        const source = bars();
        const parameters = { rsiLength: 3, streakLength: 2, rocLength: 5 };
        const runtime = new IndicatorRuntime({
            definition: ConnorsRsiIndicator,
            parameters,
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertRuntime(runtime, source.slice(0, index + 1), parameters);
        }

        const reset = new IndicatorRuntime({ definition: ConnorsRsiIndicator, parameters });
        reset.reset(source.map(input));
        assertRuntime(reset, source, parameters);
    });

    it('matches repeated previews, gaps, correction replay and streaming reset', () => {
        const source = bars(62);
        const parameters = { rsiLength: 3, streakLength: 2, rocLength: 5 };
        const committed = source.slice(0, 45);
        const runtime = new IndicatorRuntime({
            definition: ConnorsRsiIndicator,
            parameters,
            checkpointInterval: 8,
        });
        runtime.reset(committed.map(input));

        for (const delta of [2, -5, 7, -1]) {
            const probe = { ...source[45], close: source[45].close + delta };
            runtime.update(input(probe), false);
            assertRuntime(runtime, [...committed, probe], parameters);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[45]), true);
        const finalized = [...committed, source[45]];
        assertRuntime(runtime, finalized, parameters);

        const corrected = { ...source[17], close: source[17].close + 8 };
        runtime.correct(17, input(corrected));
        finalized[17] = corrected;
        assertRuntime(runtime, finalized, parameters);

        const withGaps = bars(39);
        withGaps[0] = { ...withGaps[0], close: Number.NaN };
        withGaps[11] = { ...withGaps[11], close: Number.NaN };
        withGaps[25] = { ...withGaps[25], close: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertRuntime(runtime, withGaps, parameters);

        const streaming = new IndicatorRuntime({ definition: ConnorsRsiIndicator, parameters });
        const points = streaming.resetStreaming(committed.map(input), input(source[45]));
        for (const outputId of OUTPUTS) {
            assertOutputPoints(
                points.filter((point) => point.outputId === outputId),
                oracle([...committed, source[45]], parameters, outputId),
                outputId,
            );
        }
        assert.equal(streaming.retainedFrom, committed.length);
        assert.equal(streaming.hasPreview, true);
    });
});
