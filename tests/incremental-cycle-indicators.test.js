const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    CenterOfGravityOscillatorIndicator,
    CycleIndicators,
    DetrendedPriceOscillatorIndicator,
    EhlersFisherTransformIndicator,
    HarmonicOscillatorIndicator,
    IndicatorCategory,
    IndicatorRuntime,
    LunarPhaseIndicator,
    SineWaveIndicator,
    getIndicatorDefinition,
} = require('../src/indicators/index.js');
const { calcCOG } = require('../src/chart/indicators/calc/cog.js');
const { calcDPO } = require('../src/chart/indicators/calc/dpo.js');
const {
    calcHarmonicOscillator,
} = require('../src/chart/indicators/calc/harmonicoscillator.js');
const { calcLunarPhase } = require('../src/chart/indicators/calc/lunarphase.js');
const { calcSineWave } = require('../src/chart/indicators/calc/sinewave.js');

function bars(count = 68) {
    return Array.from({ length: count }, (_, index) => {
        const close = 70 + Math.sin(index / 3.2) * 8 + Math.cos(index / 7.1) * 3 + index * 0.09;
        return {
            time: index + 1,
            open: close - 0.4,
            high: close + 1.1,
            low: close - 1.2,
            close,
            volume: 900 + index * 11,
        };
    });
}

function lunarBars(count = 68) {
    const first = Date.UTC(2024, 0, 1) / 1_000;
    return bars(count).map((bar, index) => ({
        ...bar,
        time: first + index * 2 * 86_400,
    }));
}

function input(bar) {
    return { time: bar.time, value: bar };
}

function oracle(source, parameters, calc = calcCOG) {
    return calc(source, parameters)
        .map((point, index) => ({ index, ...point }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertOutput(runtime, source, parameters, calc = calcCOG) {
    const expected = oracle(source, parameters, calc);
    const actual = runtime.points('line');
    assert.equal(actual.length, expected.length);
    actual.forEach((point, index) => {
        const wanted = expected[index];
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

function sineWaveOracle(source, parameters, outputId) {
    return calcSineWave(source, parameters)[outputId]
        .map((point, index) => ({ index, ...point }));
}

function assertSineWave(runtime, source, parameters) {
    for (const outputId of ['sine', 'leadsine']) {
        const expected = sineWaveOracle(source, parameters, outputId);
        const actual = runtime.points(outputId);
        assert.equal(actual.length, expected.length, outputId);
        actual.forEach((point, index) => {
            assert.equal(point.sourceIndex, expected[index].index);
            assert.equal(point.targetIndex, expected[index].index);
            assert.equal(point.time, expected[index].time);
            assert.ok(Math.abs(point.value - expected[index].value) <= 1e-12);
        });
    }
}

describe('incremental cycle indicators', () => {
    it('registers Center Of Gravity with stable typed metadata', () => {
        assert.deepEqual(CycleIndicators.map((item) => item.id), [
            'CenterOfGravityOscillator',
            'DetrendedPriceOscillator',
            'EhlersFisherTransform',
            'HarmonicOscillator',
            'LunarPhase',
            'SineWave',
        ]);
        assert.equal(
            getIndicatorDefinition('cENTERoFgRAVITYoSCILLATOR'),
            CenterOfGravityOscillatorIndicator,
        );
        assert.equal(CenterOfGravityOscillatorIndicator.category, IndicatorCategory.Cycle);
        assert.equal(DetrendedPriceOscillatorIndicator.category, IndicatorCategory.Cycle);
        assert.equal(EhlersFisherTransformIndicator.category, IndicatorCategory.Cycle);
        assert.equal(HarmonicOscillatorIndicator.category, IndicatorCategory.Cycle);
        assert.equal(LunarPhaseIndicator.category, IndicatorCategory.Cycle);
        assert.equal(SineWaveIndicator.category, IndicatorCategory.Cycle);
        assert.ok(Object.isFrozen(CenterOfGravityOscillatorIndicator));
    });

    it('matches Sine Wave append, preview, correction and streaming semantics', () => {
        const source = bars();
        const parameters = { length: 7 };
        const runtime = new IndicatorRuntime({
            definition: SineWaveIndicator,
            parameters,
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertSineWave(runtime, source.slice(0, index + 1), parameters);
        }

        const committed = source.slice(0, 43);
        runtime.reset(committed.map(input));
        for (const delta of [3, -6, 8, -2]) {
            const probe = { ...source[43], close: source[43].close + delta };
            runtime.update(input(probe), false);
            assertSineWave(runtime, [...committed, probe], parameters);
            assert.equal(runtime.committedCount, committed.length);
        }
        runtime.update(input(source[43]), true);
        const finalized = [...committed, source[43]];
        const corrected = { ...source[16], close: Number.NaN };
        runtime.correct(16, input(corrected));
        finalized[16] = corrected;
        assertSineWave(runtime, finalized, parameters);

        const streaming = new IndicatorRuntime({
            definition: SineWaveIndicator,
            parameters,
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[43]));
        for (const outputId of ['sine', 'leadsine']) {
            const expected = sineWaveOracle([...committed, source[43]], parameters, outputId);
            const actual = points.filter((point) => point.outputId === outputId);
            assert.equal(actual.length, expected.length, outputId);
            actual.forEach((point, index) => {
                assert.equal(point.targetIndex, expected[index].index);
                assert.ok(Math.abs(point.value - expected[index].value) <= 1e-12);
            });
        }
        assert.equal(streaming.retainedFrom, committed.length);
        assert.equal(streaming.hasPreview, true);
    });

    it('matches batch on every append and a full reset', () => {
        const source = bars();
        const parameters = { length: 7 };
        const runtime = new IndicatorRuntime({
            definition: CenterOfGravityOscillatorIndicator,
            parameters,
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertOutput(runtime, source.slice(0, index + 1), parameters);
        }
        const reset = new IndicatorRuntime({
            definition: CenterOfGravityOscillatorIndicator,
            parameters,
        });
        reset.reset(source.map(input));
        assertOutput(reset, source, parameters);
    });

    it('matches previews, finalization, gaps, correction replay and streaming reset', () => {
        const source = bars(56);
        const parameters = { length: 7 };
        const committed = source.slice(0, 41);
        const runtime = new IndicatorRuntime({
            definition: CenterOfGravityOscillatorIndicator,
            parameters,
            checkpointInterval: 8,
        });
        runtime.reset(committed.map(input));

        for (const delta of [3, -6, 8, -2]) {
            const probe = { ...source[41], close: source[41].close + delta };
            runtime.update(input(probe), false);
            assertOutput(runtime, [...committed, probe], parameters);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[41]), true);
        const finalized = [...committed, source[41]];
        assertOutput(runtime, finalized, parameters);

        const corrected = { ...source[16], close: source[16].close + 9 };
        runtime.correct(16, input(corrected));
        finalized[16] = corrected;
        assertOutput(runtime, finalized, parameters);

        const withGaps = bars(34);
        withGaps[4] = { ...withGaps[4], close: Number.NaN };
        withGaps[18] = { ...withGaps[18], close: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertOutput(runtime, withGaps, parameters);

        const streaming = new IndicatorRuntime({
            definition: CenterOfGravityOscillatorIndicator,
            parameters,
        });
        const streamed = streaming.resetStreaming(committed.map(input), input(source[41]));
        const expected = oracle([...committed, source[41]], parameters);
        assert.equal(streamed.length, expected.length);
        streamed.forEach((point, index) => {
            assert.equal(point.targetIndex, expected[index].index);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-10;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
        assert.equal(streaming.retainedFrom, committed.length);
        assert.equal(streaming.hasPreview, true);
    });

    it('matches DPO batch on every append and a full reset', () => {
        const source = bars();
        const parameters = { length: 7 };
        const runtime = new IndicatorRuntime({
            definition: DetrendedPriceOscillatorIndicator,
            parameters,
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertOutput(runtime, source.slice(0, index + 1), parameters, calcDPO);
        }
        const reset = new IndicatorRuntime({
            definition: DetrendedPriceOscillatorIndicator,
            parameters,
        });
        reset.reset(source.map(input));
        assertOutput(reset, source, parameters, calcDPO);
    });

    it('matches DPO previews, gaps, correction replay and streaming reset', () => {
        const source = bars(56);
        const parameters = { length: 7 };
        const committed = source.slice(0, 41);
        const runtime = new IndicatorRuntime({
            definition: DetrendedPriceOscillatorIndicator,
            parameters,
            checkpointInterval: 8,
        });
        runtime.reset(committed.map(input));

        for (const delta of [3, -6, 8, -2]) {
            const probe = { ...source[41], close: source[41].close + delta };
            runtime.update(input(probe), false);
            assertOutput(runtime, [...committed, probe], parameters, calcDPO);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[41]), true);
        const finalized = [...committed, source[41]];
        assertOutput(runtime, finalized, parameters, calcDPO);
        const corrected = { ...source[16], close: source[16].close + 9 };
        runtime.correct(16, input(corrected));
        finalized[16] = corrected;
        assertOutput(runtime, finalized, parameters, calcDPO);

        const withGaps = bars(34);
        withGaps[4] = { ...withGaps[4], close: Number.NaN };
        withGaps[18] = { ...withGaps[18], close: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertOutput(runtime, withGaps, parameters, calcDPO);

        const streaming = new IndicatorRuntime({
            definition: DetrendedPriceOscillatorIndicator,
            parameters,
        });
        const streamed = streaming.resetStreaming(committed.map(input), input(source[41]));
        const expected = oracle([...committed, source[41]], parameters, calcDPO);
        assert.equal(streamed.length, expected.length);
        streamed.forEach((point, index) => {
            assert.equal(point.targetIndex, expected[index].index);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-10;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
        assert.equal(streaming.retainedFrom, committed.length);
        assert.equal(streaming.hasPreview, true);
    });

    it('matches Harmonic Oscillator across append, preview, gaps and replay', () => {
        const source = bars();
        const parameters = { length: 7 };
        const runtime = new IndicatorRuntime({
            definition: HarmonicOscillatorIndicator,
            parameters,
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertOutput(
                runtime,
                source.slice(0, index + 1),
                parameters,
                calcHarmonicOscillator,
            );
        }

        const committed = source.slice(0, 41);
        runtime.reset(committed.map(input));
        for (const delta of [3, -6, 8, -2]) {
            const probe = { ...source[41], close: source[41].close + delta };
            runtime.update(input(probe), false);
            assertOutput(
                runtime,
                [...committed, probe],
                parameters,
                calcHarmonicOscillator,
            );
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[41]), true);
        const finalized = [...committed, source[41]];
        const corrected = { ...source[16], close: source[16].close + 9 };
        runtime.correct(16, input(corrected));
        finalized[16] = corrected;
        assertOutput(runtime, finalized, parameters, calcHarmonicOscillator);

        const withGaps = bars(34);
        withGaps[4] = { ...withGaps[4], close: Number.NaN };
        withGaps[18] = { ...withGaps[18], close: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertOutput(runtime, withGaps, parameters, calcHarmonicOscillator);

        const streaming = new IndicatorRuntime({
            definition: HarmonicOscillatorIndicator,
            parameters,
        });
        const streamed = streaming.resetStreaming(committed.map(input), input(source[41]));
        const expected = oracle(
            [...committed, source[41]],
            parameters,
            calcHarmonicOscillator,
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

    it('matches Lunar Phase across append, preview, replay and streaming reset', () => {
        const source = lunarBars();
        const parameters = {};
        const runtime = new IndicatorRuntime({
            definition: LunarPhaseIndicator,
            parameters,
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertOutput(
                runtime,
                source.slice(0, index + 1),
                parameters,
                calcLunarPhase,
            );
        }

        const committed = source.slice(0, 41);
        runtime.reset(committed.map(input));
        for (const closeDelta of [1, -3, 7, -11]) {
            const probe = { ...source[41], close: source[41].close + closeDelta };
            runtime.update(input(probe), false);
            assertOutput(runtime, [...committed, probe], parameters, calcLunarPhase);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[41]), true);
        const finalized = [...committed, source[41]];
        const corrected = { ...source[16], time: source[16].time + 86_400 };
        runtime.correct(16, input(corrected));
        finalized[16] = corrected;
        assertOutput(runtime, finalized, parameters, calcLunarPhase);

        const withPriceGaps = lunarBars(34);
        withPriceGaps[4] = { ...withPriceGaps[4], close: Number.NaN };
        withPriceGaps[18] = { ...withPriceGaps[18], close: Number.NaN };
        runtime.reset(withPriceGaps.map(input));
        assertOutput(runtime, withPriceGaps, parameters, calcLunarPhase);

        const streaming = new IndicatorRuntime({
            definition: LunarPhaseIndicator,
            parameters,
        });
        const streamed = streaming.resetStreaming(committed.map(input), input(source[41]));
        const expected = oracle([...committed, source[41]], parameters, calcLunarPhase);
        assert.equal(streamed.length, expected.length);
        streamed.forEach((point, index) => {
            assert.equal(point.targetIndex, expected[index].index);
            assert.equal(point.value, expected[index].value);
        });
        assert.equal(streaming.retainedFrom, committed.length);
        assert.equal(streaming.hasPreview, true);
    });
});
