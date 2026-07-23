const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    AlligatorIndicator,
    FractalsIndicator,
    GatorOscillatorIndicator,
    IchimokuIndicator,
    IndicatorCategory,
    IndicatorRuntime,
    PeakIndicator,
    ShiftedSparseIndicators,
    TroughIndicator,
    ZigZagIndicator,
    getIndicatorDefinition,
} = require('../src/indicators/index.js');
const { calcIchimoku } = require('../src/chart/indicators/calc/ichimoku.js');
const { calcFractals } = require('../src/chart/indicators/calc/fractals.js');
const { calcZigZag } = require('../src/chart/indicators/calc/zigzag.js');
const { calcPeak } = require('../src/chart/indicators/calc/peak.js');
const { calcTrough } = require('../src/chart/indicators/calc/trough.js');
const { calcAlligator } = require('../src/chart/indicators/calc/alligator.js');
const { calcGatorOscillator } = require('../src/chart/indicators/calc/gator.js');

function bars(count = 85) {
    return Array.from({ length: count }, (_, index) => {
        const close = 130 + Math.sin(index / 4.3) * 12
            + Math.cos(index / 10.7) * 3 + index * 0.06;
        return {
            time: index + 1,
            open: close - Math.sin(index / 2.1) * 0.7,
            high: close + 1.6 + (index % 6) * 0.18,
            low: close - 1.4 - (index % 5) * 0.14,
            close,
            volume: 1_200 + index * 11,
        };
    });
}

function input(bar) {
    return { time: bar.time, value: bar };
}

function oracle(source, params, outputId) {
    return calcIchimoku(source, params)[outputId]
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertOutput(runtime, outputId, expected, epsilon = 1e-9) {
    const actual = runtime.points(outputId).filter((point) => point.time !== null);
    assert.equal(actual.length, expected.length, `${outputId} point count`);
    actual.forEach((point, index) => {
        const value = expected[index];
        assert.equal(point.outputId, outputId);
        assert.equal(point.targetIndex, value.index);
        assert.equal(point.time, value.time);
        const tolerance = Math.max(1, Math.abs(value.value)) * epsilon;
        assert.ok(
            Math.abs(point.value - value.value) <= tolerance,
            `${outputId}: ${point.value} != ${value.value} at ${point.targetIndex}`,
        );
    });
}

const OUTPUTS = ['tenkan', 'kijun', 'senkouA', 'senkouB', 'chikou'];
const PARAMS = { tenkan: 4, kijun: 7, senkouB: 12 };

function assertIchimoku(runtime, source) {
    for (const outputId of OUTPUTS)
        assertOutput(runtime, outputId, oracle(source, PARAMS, outputId));
}

function fractalOracle(source, length, outputId) {
    const middle = Math.floor(length / 2);
    return calcFractals(source, { length })[outputId]
        .map((point, sourceIndex) => ({
            sourceIndex,
            targetIndex: sourceIndex - middle,
            time: source[sourceIndex - middle]?.time,
            value: point.value,
        }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertFractals(runtime, source, length = 5) {
    for (const outputId of ['up', 'down']) {
        const expected = fractalOracle(source, length, outputId);
        const actual = runtime.points(outputId);
        assert.equal(actual.length, expected.length, `${outputId} point count`);
        actual.forEach((point, index) => {
            const value = expected[index];
            assert.equal(point.sourceIndex, value.sourceIndex);
            assert.equal(point.targetIndex, value.targetIndex);
            assert.equal(point.time, value.time);
            assert.equal(point.value, value.value);
        });
    }
}

function zigZagOracle(source, deviation) {
    return calcZigZag(source, { deviation })
        .map((point, sourceIndex) => ({
            sourceIndex,
            targetIndex: sourceIndex - (point.shift || 0),
            time: source[sourceIndex - (point.shift || 0)]?.time,
            value: point.value,
        }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertZigZag(runtime, source, deviation) {
    const expected = zigZagOracle(source, deviation);
    const actual = runtime.points('value');
    assert.equal(actual.length, expected.length);
    actual.forEach((point, index) => {
        const value = expected[index];
        assert.equal(point.sourceIndex, value.sourceIndex);
        assert.equal(point.targetIndex, value.targetIndex);
        assert.equal(point.time, value.time);
        assert.equal(point.value, value.value);
    });
}

function directionalOracle(calc, source, deviation) {
    return calc(source, { deviation })
        .map((point, sourceIndex) => ({
            sourceIndex,
            targetIndex: sourceIndex - (point.shift || 0),
            time: source[sourceIndex - (point.shift || 0)]?.time,
            value: point.value,
        }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertDirectional(runtime, calc, source, deviation) {
    const expected = directionalOracle(calc, source, deviation);
    const actual = runtime.points('value');
    assert.equal(actual.length, expected.length);
    actual.forEach((point, index) => {
        assert.equal(point.sourceIndex, expected[index].sourceIndex);
        assert.equal(point.targetIndex, expected[index].targetIndex);
        assert.equal(point.time, expected[index].time);
        assert.equal(point.value, expected[index].value);
    });
}

const ALLIGATOR_PARAMS = {
    jawLength: 5,
    jawShift: 3,
    teethLength: 4,
    teethShift: 2,
    lipsLength: 3,
    lipsShift: 1,
};

function alligatorShift(outputId, params = ALLIGATOR_PARAMS) {
    return params[`${outputId}Shift`];
}

function alligatorOracle(source, outputId, params = ALLIGATOR_PARAMS) {
    const shift = alligatorShift(outputId, params);
    const lastTime = source[source.length - 1]?.time || 0;
    const extension = Array.from({ length: shift }, (_, index) => ({
        time: lastTime + index + 1,
        open: Number.NaN,
        high: Number.NaN,
        low: Number.NaN,
        close: Number.NaN,
        volume: 0,
    }));
    return calcAlligator([...source, ...extension], params)[outputId]
        .map((point, targetIndex) => ({
            sourceIndex: targetIndex - shift,
            targetIndex,
            time: source[targetIndex]?.time ?? null,
            value: point.value,
        }))
        .filter((point) => point.sourceIndex < source.length
            && typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertAlligator(runtime, source, params = ALLIGATOR_PARAMS) {
    for (const outputId of ['jaw', 'teeth', 'lips']) {
        const expected = alligatorOracle(source, outputId, params);
        const actual = runtime.points(outputId);
        assert.equal(actual.length, expected.length, `${outputId} point count`);
        actual.forEach((point, index) => {
            const value = expected[index];
            assert.equal(point.sourceIndex, value.sourceIndex);
            assert.equal(point.targetIndex, value.targetIndex);
            assert.equal(point.time, value.time);
            const tolerance = Math.max(1, Math.abs(value.value)) * 1e-9;
            assert.ok(Math.abs(point.value - value.value) <= tolerance);
        });
    }
}

const GATOR_PARAMS = {
    jawLength: 5,
    jawShift: 0,
    teethLength: 4,
    teethShift: 1,
    lipsLength: 3,
    lipsShift: 0,
};

function assertGator(runtime, source, params = GATOR_PARAMS) {
    const expected = calcGatorOscillator(source, params);
    for (const outputId of ['upper', 'lower']) {
        const oracle = expected[outputId]
            .map((point, index) => ({ index, time: point.time, value: point.value }))
            .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
        const actual = runtime.points(outputId);
        assert.equal(actual.length, oracle.length, `${outputId} point count`);
        actual.forEach((point, index) => {
            assert.equal(point.sourceIndex, oracle[index].index);
            assert.equal(point.targetIndex, oracle[index].index);
            assert.equal(point.time, oracle[index].time);
            const tolerance = Math.max(1, Math.abs(oracle[index].value)) * 1e-9;
            assert.ok(Math.abs(point.value - oracle[index].value) <= tolerance);
        });
    }
}

describe('incremental shifted and sparse indicators', () => {
    it('registers Ichimoku with the complete cloud output schema', () => {
        assert.deepEqual(ShiftedSparseIndicators.map((item) => item.id), [
            'Ichimoku',
            'Alligator',
            'GatorOscillator',
            'Fractals',
            'ZigZag',
            'Peak',
            'Trough',
        ]);
        assert.deepEqual(IchimokuIndicator.outputs.map((item) => item.id), OUTPUTS);
        assert.equal(getIndicatorDefinition('iCHIMOKU'), IchimokuIndicator);
        assert.equal(IchimokuIndicator.category, IndicatorCategory.Trend);
        assert.ok(Object.isFrozen(IchimokuIndicator));
        assert.deepEqual(FractalsIndicator.outputs.map((item) => item.id), ['up', 'down']);
        assert.deepEqual(AlligatorIndicator.outputs.map((item) => item.id), [
            'jaw', 'teeth', 'lips',
        ]);
        assert.deepEqual(GatorOscillatorIndicator.outputs.map((item) => item.id), [
            'upper', 'lower',
        ]);
        assert.throws(
            () => IchimokuIndicator.processorFactory({ ...PARAMS, kijun: 0 }),
            /integer from 1 to 400/,
        );
        assert.throws(
            () => FractalsIndicator.processorFactory({ length: 4 }),
            /odd integer from 3 to 99/,
        );
        assert.equal(ZigZagIndicator.processorFactory({ deviation: 5 }).deviation, 0.05);
        assert.equal(ZigZagIndicator.processorFactory({ deviation: 1 }).deviation, 0.01);
        assert.throws(
            () => PeakIndicator.processorFactory({ deviation: 1 }),
            /between 0 and 1/,
        );
    });

    it('aligns Gator histograms by target candle across different line shifts', () => {
        const source = bars(76);
        const runtime = new IndicatorRuntime({
            definition: GatorOscillatorIndicator,
            parameters: GATOR_PARAMS,
            checkpointInterval: 10,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertGator(runtime, source.slice(0, index + 1));
        }
    });

    it('matches Gator preview, gaps, correction and compact streaming', () => {
        const source = bars(64);
        const committed = source.slice(0, 50);
        const runtime = new IndicatorRuntime({
            definition: GatorOscillatorIndicator,
            parameters: GATOR_PARAMS,
            checkpointInterval: 8,
        });
        runtime.reset(committed.map(input));
        for (const delta of [4, -6, 9, -3]) {
            const probe = {
                ...source[50],
                high: source[50].high + Math.max(delta, 0),
                low: source[50].low + Math.min(delta, 0),
            };
            runtime.update(input(probe), false);
            assertGator(runtime, [...committed, probe]);
            assert.equal(runtime.committedCount, committed.length);
        }
        runtime.update(input(source[50]), true);
        const finalized = [...committed, source[50]];
        assertGator(runtime, finalized);
        const corrected = {
            ...source[22],
            high: source[22].high + 7,
            low: source[22].low - 5,
        };
        runtime.correct(22, input(corrected));
        finalized[22] = corrected;
        assertGator(runtime, finalized);

        const withGaps = bars(42);
        withGaps[2] = { ...withGaps[2], high: Number.NaN };
        withGaps[18] = { ...withGaps[18], low: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertGator(runtime, withGaps);

        const streaming = new IndicatorRuntime({
            definition: GatorOscillatorIndicator,
            parameters: GATOR_PARAMS,
        });
        const full = [...committed, source[50]];
        const points = streaming.resetStreaming(committed.map(input), input(source[50]));
        const expected = calcGatorOscillator(full, GATOR_PARAMS);
        for (const outputId of ['upper', 'lower']) {
            const oracle = expected[outputId]
                .map((point, index) => ({ index, time: point.time, value: point.value }))
                .filter((point) => typeof point.value === 'number'
                    && Number.isFinite(point.value));
            const actual = points.filter((point) => point.outputId === outputId);
            assert.equal(actual.length, oracle.length, outputId);
            actual.forEach((point, index) => {
                assert.equal(point.sourceIndex, oracle[index].index);
                assert.equal(point.targetIndex, oracle[index].index);
                assert.equal(point.time, oracle[index].time);
            });
        }
    });

    it('streams Alligator lines to their exact forward targets', () => {
        const source = bars(74);
        const runtime = new IndicatorRuntime({
            definition: AlligatorIndicator,
            parameters: ALLIGATOR_PARAMS,
            checkpointInterval: 10,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertAlligator(runtime, source.slice(0, index + 1));
        }
        for (const outputId of ['jaw', 'teeth', 'lips']) {
            const shift = alligatorShift(outputId);
            const pending = runtime.points(outputId).filter((point) => point.time === null);
            assert.equal(pending.length, shift);
            assert.ok(pending.every((point) => point.targetIndex === point.sourceIndex + shift));
        }
    });

    it('matches Alligator preview, gaps, reset, correction and compact streaming', () => {
        const source = bars(66);
        const committed = source.slice(0, 52);
        const runtime = new IndicatorRuntime({
            definition: AlligatorIndicator,
            parameters: ALLIGATOR_PARAMS,
            checkpointInterval: 8,
        });
        runtime.reset(committed.map(input));
        for (const delta of [4, -7, 10, -2]) {
            const probe = {
                ...source[52],
                high: source[52].high + Math.max(delta, 0),
                low: source[52].low + Math.min(delta, 0),
            };
            runtime.update(input(probe), false);
            assertAlligator(runtime, [...committed, probe]);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[52]), true);
        const finalized = [...committed, source[52]];
        assertAlligator(runtime, finalized);
        const corrected = {
            ...source[23],
            high: source[23].high + 8,
            low: source[23].low - 6,
        };
        runtime.correct(23, input(corrected));
        finalized[23] = corrected;
        assertAlligator(runtime, finalized);

        const withGaps = bars(43);
        withGaps[2] = { ...withGaps[2], high: Number.NaN };
        withGaps[19] = { ...withGaps[19], low: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertAlligator(runtime, withGaps);

        const streaming = new IndicatorRuntime({
            definition: AlligatorIndicator,
            parameters: ALLIGATOR_PARAMS,
        });
        const full = [...committed, source[52]];
        const points = streaming.resetStreaming(committed.map(input), input(source[52]));
        for (const outputId of ['jaw', 'teeth', 'lips']) {
            const expected = alligatorOracle(full, outputId);
            const actual = points.filter((point) => point.outputId === outputId);
            assert.equal(actual.length, expected.length, outputId);
            actual.forEach((point, index) => {
                assert.equal(point.sourceIndex, expected[index].sourceIndex);
                assert.equal(point.targetIndex, expected[index].targetIndex);
                assert.equal(point.time, expected[index].time);
                const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-9;
                assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
            });
            // Compact state retains every forward contribution whose target
            // was not part of the committed history. The preview can already
            // materialize the first of those targets with a real time.
            const pending = expected.filter((point) => (
                point.targetIndex >= committed.length
            ));
            const retained = streaming.points(outputId);
            assert.equal(retained.length, pending.length);
            retained.forEach((point, index) => {
                assert.equal(point.sourceIndex, pending[index].sourceIndex);
                assert.equal(point.targetIndex, pending[index].targetIndex);
                assert.equal(point.time, pending[index].time);
            });
        }
    });

    it('matches every batch append and emits Senkou values at explicit future targets', () => {
        const source = bars();
        const runtime = new IndicatorRuntime({
            definition: IchimokuIndicator,
            parameters: PARAMS,
            checkpointInterval: 11,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertIchimoku(runtime, source.slice(0, index + 1));
        }

        const rawFirst = Math.max(PARAMS.tenkan, PARAMS.kijun) - 1;
        const first = runtime.points('senkouA')
            .find((point) => point.sourceIndex === rawFirst);
        const duplicate = runtime.points('senkouA')
            .find((point) => point.sourceIndex === rawFirst
                && point.targetIndex === rawFirst + PARAMS.kijun);
        assert.equal(first.targetIndex, rawFirst + PARAMS.kijun - 1);
        assert.equal(duplicate.targetIndex, rawFirst + PARAMS.kijun);
        assert.ok(runtime.points('senkouA').some((point) => point.time === null));
    });

    it('matches preview, final, gaps, reset and correction replay', () => {
        const source = bars(72);
        const committed = source.slice(0, 54);
        const runtime = new IndicatorRuntime({
            definition: IchimokuIndicator,
            parameters: PARAMS,
            checkpointInterval: 9,
        });
        runtime.reset(committed.map(input));

        for (const delta of [3, -5, 8, -2]) {
            const probe = {
                ...source[54],
                close: source[54].close + delta,
                high: source[54].high + Math.max(delta, 0),
                low: source[54].low + Math.min(delta, 0),
            };
            const patch = runtime.update(input(probe), false);
            assert.equal(patch.operations.some((operation) => operation.point?.time === null), false);
            assertIchimoku(runtime, [...committed, probe]);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[54]), true);
        const finalized = [...committed, source[54]];
        assertIchimoku(runtime, finalized);

        const corrected = {
            ...source[24],
            close: source[24].close + 6,
            high: source[24].high + 6,
        };
        runtime.correct(24, input(corrected));
        finalized[24] = corrected;
        assertIchimoku(runtime, finalized);

        const withGaps = bars(50);
        withGaps[7] = { ...withGaps[7], high: Number.NaN };
        withGaps[21] = { ...withGaps[21], low: Number.NaN };
        withGaps[37] = { ...withGaps[37], close: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertIchimoku(runtime, withGaps);

        const streaming = new IndicatorRuntime({
            definition: IchimokuIndicator,
            parameters: PARAMS,
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[54]));
        for (const outputId of OUTPUTS) {
            const actual = points.filter((point) => (
                point.outputId === outputId && point.time !== null
            ));
            const expected = oracle([...committed, source[54]], PARAMS, outputId);
            assert.equal(actual.length, expected.length, outputId);
            actual.forEach((point, index) => {
                assert.equal(point.targetIndex, expected[index].index);
                const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-9;
                assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
            });
        }
        assert.ok(streaming.points('senkouA').some((point) => point.time === null));
        assert.equal(streaming.retainedFrom, committed.length);
        assert.equal(streaming.hasPreview, true);
    });

    it('places hand-checked Fractals on pivot bars rather than confirmation bars', () => {
        const rows = [
            [1, 3], [2, 2], [5, 1], [3, 2], [1, 0],
            [0, -1], [1, -3], [0, -1], [1, 0],
        ];
        const source = rows.map(([high, low], index) => ({
            time: index + 1,
            open: (high + low) / 2,
            high,
            low,
            close: (high + low) / 2,
            volume: 0,
        }));
        const runtime = new IndicatorRuntime({
            definition: FractalsIndicator,
            parameters: { length: 5 },
        });
        runtime.reset(source.map(input));

        assert.deepEqual(runtime.points('up'), [{
            outputId: 'up',
            sourceIndex: 4,
            targetIndex: 2,
            time: source[2].time,
            value: 5,
        }]);
        assert.deepEqual(runtime.points('down'), [{
            outputId: 'down',
            sourceIndex: 8,
            targetIndex: 6,
            time: source[6].time,
            value: -3,
        }]);
    });

    it('matches Fractals batch append, preview, gaps, reset and correction replay', () => {
        const length = 5;
        const source = bars(75);
        const runtime = new IndicatorRuntime({
            definition: FractalsIndicator,
            parameters: { length },
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertFractals(runtime, source.slice(0, index + 1), length);
        }

        const committed = source.slice(0, 58);
        runtime.reset(committed.map(input));
        for (const delta of [4, -6, 9, -2]) {
            const probe = {
                ...source[58],
                high: source[58].high + delta,
                low: source[58].low - delta,
            };
            runtime.update(input(probe), false);
            assertFractals(runtime, [...committed, probe], length);
            assert.equal(runtime.committedCount, committed.length);
        }
        runtime.update(input(source[58]), true);
        const finalized = [...committed, source[58]];
        assertFractals(runtime, finalized, length);

        const corrected = {
            ...source[27],
            high: source[27].high + 8,
            low: source[27].low - 7,
        };
        runtime.correct(27, input(corrected));
        finalized[27] = corrected;
        assertFractals(runtime, finalized, length);

        const withGaps = bars(46);
        withGaps[8] = { ...withGaps[8], high: Number.NaN };
        withGaps[22] = { ...withGaps[22], low: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertFractals(runtime, withGaps, length);

        const streaming = new IndicatorRuntime({
            definition: FractalsIndicator,
            parameters: { length },
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[58]));
        for (const outputId of ['up', 'down']) {
            const expected = fractalOracle([...committed, source[58]], length, outputId);
            const actual = points.filter((point) => point.outputId === outputId);
            assert.equal(actual.length, expected.length, outputId);
            actual.forEach((point, index) => {
                assert.equal(point.sourceIndex, expected[index].sourceIndex);
                assert.equal(point.targetIndex, expected[index].targetIndex);
                assert.equal(point.time, expected[index].time);
                assert.equal(point.value, expected[index].value);
            });
        }
    });

    it('places hand-checked ZigZag reversals on their shifted extremum bars', () => {
        const closes = [10, 11, 12, 13, 12, 11, 10, 9, 8, 7, 8, 9, 10, 11, 12];
        const source = closes.map((close, index) => ({
            time: index + 1,
            open: close,
            high: close,
            low: close,
            close,
            volume: 0,
        }));
        const runtime = new IndicatorRuntime({
            definition: ZigZagIndicator,
            parameters: { deviation: 0.1 },
        });
        runtime.reset(source.map(input));

        assert.deepEqual(runtime.points('value'), [
            {
                outputId: 'value', sourceIndex: 5, targetIndex: 2,
                time: source[2].time, value: 13,
            },
            {
                outputId: 'value', sourceIndex: 10, targetIndex: 5,
                time: source[5].time, value: 7,
            },
        ]);
    });

    it('matches ZigZag batch append, preview, gaps, reset and correction replay', () => {
        const deviation = 0.04;
        const source = bars(78);
        const runtime = new IndicatorRuntime({
            definition: ZigZagIndicator,
            parameters: { deviation },
            checkpointInterval: 10,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertZigZag(runtime, source.slice(0, index + 1), deviation);
        }

        const committed = source.slice(0, 60);
        runtime.reset(committed.map(input));
        for (const delta of [5, -7, 10, -3]) {
            const probe = { ...source[60], close: source[60].close + delta };
            runtime.update(input(probe), false);
            assertZigZag(runtime, [...committed, probe], deviation);
            assert.equal(runtime.committedCount, committed.length);
        }
        runtime.update(input(source[60]), true);
        const finalized = [...committed, source[60]];
        assertZigZag(runtime, finalized, deviation);

        const corrected = { ...source[29], close: source[29].close + 9 };
        runtime.correct(29, input(corrected));
        finalized[29] = corrected;
        assertZigZag(runtime, finalized, deviation);

        const withGaps = bars(48);
        withGaps[0] = { ...withGaps[0], close: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertZigZag(runtime, withGaps, deviation);
        withGaps[0] = bars(48)[0];
        withGaps[13] = { ...withGaps[13], close: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertZigZag(runtime, withGaps, deviation);

        const streaming = new IndicatorRuntime({
            definition: ZigZagIndicator,
            parameters: { deviation },
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[60]));
        const expected = zigZagOracle([...committed, source[60]], deviation);
        assert.equal(points.length, expected.length);
        points.forEach((point, index) => {
            assert.equal(point.sourceIndex, expected[index].sourceIndex);
            assert.equal(point.targetIndex, expected[index].targetIndex);
            assert.equal(point.time, expected[index].time);
            assert.equal(point.value, expected[index].value);
        });
    });

    for (const testCase of [
        { definition: PeakIndicator, calc: calcPeak, gap: 'high' },
        { definition: TroughIndicator, calc: calcTrough, gap: 'low' },
    ]) {
        it(`${testCase.definition.name} reuses ZigZag state with exact directional parity`, () => {
            const deviation = 0.035;
            const source = bars(74);
            const runtime = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: { deviation },
                checkpointInterval: 9,
            });
            for (let index = 0; index < source.length; index += 1) {
                runtime.update(input(source[index]), true);
                assertDirectional(
                    runtime,
                    testCase.calc,
                    source.slice(0, index + 1),
                    deviation,
                );
            }

            const committed = source.slice(0, 56);
            runtime.reset(committed.map(input));
            for (const delta of [5, -8, 11, -3]) {
                const probe = {
                    ...source[56],
                    high: source[56].high + delta,
                    low: source[56].low - delta,
                };
                runtime.update(input(probe), false);
                assertDirectional(runtime, testCase.calc, [...committed, probe], deviation);
                assert.equal(runtime.committedCount, committed.length);
            }

            runtime.update(input(source[56]), true);
            const finalized = [...committed, source[56]];
            assertDirectional(runtime, testCase.calc, finalized, deviation);
            const corrected = {
                ...source[26],
                high: source[26].high + 9,
                low: source[26].low - 9,
            };
            runtime.correct(26, input(corrected));
            finalized[26] = corrected;
            assertDirectional(runtime, testCase.calc, finalized, deviation);

            const withGap = bars(45);
            withGap[15] = { ...withGap[15], [testCase.gap]: Number.NaN };
            runtime.reset(withGap.map(input));
            assertDirectional(runtime, testCase.calc, withGap, deviation);

            const streaming = new IndicatorRuntime({
                definition: testCase.definition,
                parameters: { deviation },
            });
            const points = streaming.resetStreaming(committed.map(input), input(source[56]));
            const expected = directionalOracle(
                testCase.calc,
                [...committed, source[56]],
                deviation,
            );
            assert.equal(points.length, expected.length);
            points.forEach((point, index) => {
                assert.equal(point.sourceIndex, expected[index].sourceIndex);
                assert.equal(point.targetIndex, expected[index].targetIndex);
                assert.equal(point.time, expected[index].time);
                assert.equal(point.value, expected[index].value);
            });
        });
    }
});
