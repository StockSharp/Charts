const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    AroonIndicator,
    AroonOscillatorIndicator,
    AroonOscillatorProcessor,
    AroonProcessor,
    BalanceOfMarketPowerIndicator,
    BalanceOfPowerIndicator,
    BearPowerIndicator,
    BullPowerIndicator,
    ChoppinessIndexIndicator,
    ChandeKrollStopIndicator,
    ElderRayIndicator,
    FibonacciRetracementIndicator,
    IndicatorCategory,
    IndicatorRuntime,
    RangeIndicators,
    VerticalHorizontalFilterIndicator,
    VortexIndicator,
    getIndicatorDefinition,
} = require('../src/indicators/index.js');
const { calcAroon } = require('../src/chart/indicators/calc/aroon.js');
const { calcAroonOscillator } = require('../src/chart/indicators/calc/aroonoscillator.js');
const { calcBalanceOfPower } = require('../src/chart/indicators/calc/balanceofpower.js');
const { calcBalanceOfMarketPower } = require('../src/chart/indicators/calc/bomp.js');
const { calcBearPower } = require('../src/chart/indicators/calc/bearpower.js');
const { calcBullPower } = require('../src/chart/indicators/calc/bullpower.js');
const { calcChoppinessIndex } = require('../src/chart/indicators/calc/chop.js');
const { calcChandeKrollStop } = require('../src/chart/indicators/calc/chandekrollstop.js');
const { calcElderRay } = require('../src/chart/indicators/calc/elderray.js');
const { calcFibonacciRetracement } = require('../src/chart/indicators/calc/fibo.js');
const { calcVHF } = require('../src/chart/indicators/calc/vhf.js');
const { calcVortex } = require('../src/chart/indicators/calc/vortex.js');

function bars(count = 75) {
    return Array.from({ length: count }, (_, index) => {
        const center = 90 + Math.round(Math.sin(index / 4.3) * 12) + (index % 9) * 0.25;
        const high = center + 2 + (index % 4 === 0 ? 1 : 0);
        const low = center - 2 - (index % 5 === 0 ? 1 : 0);
        return {
            time: index + 1,
            open: center - 0.5,
            high,
            low,
            close: center + 0.5,
            volume: 900 + index * 7,
        };
    });
}

function input(bar) {
    return { time: bar.time, value: bar };
}

function oracle(source, length, outputId) {
    return calcAroon(source, { length })[outputId]
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertOutput(runtime, source, length, outputId) {
    const expected = oracle(source, length, outputId);
    const actual = runtime.points(outputId);
    assert.equal(actual.length, expected.length, `${outputId} point count`);
    actual.forEach((point, index) => {
        assert.equal(point.outputId, outputId);
        assert.equal(point.sourceIndex, expected[index].index);
        assert.equal(point.targetIndex, expected[index].index);
        assert.equal(point.time, expected[index].time);
        assert.equal(point.value, expected[index].value);
    });
}

function assertAroon(runtime, source, length) {
    assertOutput(runtime, source, length, 'up');
    assertOutput(runtime, source, length, 'down');
}

function oscillatorOracle(source, length) {
    return calcAroonOscillator(source, { length })
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertOscillator(runtime, source, length) {
    const expected = oscillatorOracle(source, length);
    const actual = runtime.points('line');
    assert.equal(actual.length, expected.length);
    actual.forEach((point, index) => {
        assert.equal(point.outputId, 'line');
        assert.equal(point.sourceIndex, expected[index].index);
        assert.equal(point.targetIndex, expected[index].index);
        assert.equal(point.time, expected[index].time);
        assert.equal(point.value, expected[index].value);
    });
}

function bopOracle(source) {
    return calcBalanceOfPower(source, {})
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertBalanceOfPower(runtime, source) {
    const expected = bopOracle(source);
    const actual = runtime.points('line');
    assert.equal(actual.length, expected.length);
    actual.forEach((point, index) => {
        assert.equal(point.sourceIndex, expected[index].index);
        assert.equal(point.targetIndex, expected[index].index);
        assert.equal(point.time, expected[index].time);
        assert.equal(point.value, expected[index].value);
    });
}

function marketPowerOracle(source, length) {
    return calcBalanceOfMarketPower(source, { length })
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertBalanceOfMarketPower(runtime, source, length) {
    const expected = marketPowerOracle(source, length);
    const actual = runtime.points('line');
    assert.equal(actual.length, expected.length);
    actual.forEach((point, index) => {
        assert.equal(point.sourceIndex, expected[index].index);
        assert.equal(point.targetIndex, expected[index].index);
        assert.equal(point.time, expected[index].time);
        assert.ok(Math.abs(point.value - expected[index].value) <= 1e-12);
    });
}

function choppinessOracle(source, length) {
    return calcChoppinessIndex(source, { length })
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertChoppiness(runtime, source, length) {
    const expected = choppinessOracle(source, length);
    const actual = runtime.points('line');
    assert.equal(actual.length, expected.length);
    actual.forEach((point, index) => {
        assert.equal(point.sourceIndex, expected[index].index);
        assert.equal(point.targetIndex, expected[index].index);
        assert.equal(point.time, expected[index].time);
        const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-12;
        assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
    });
}

const CHANDE_KROLL_PARAMS = { period: 7, multiplier: 1.4, stopPeriod: 5 };

function chandeKrollOracle(source, outputId) {
    return calcChandeKrollStop(source, CHANDE_KROLL_PARAMS)[outputId]
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertChandeKroll(runtime, source) {
    for (const outputId of ['longStop', 'shortStop']) {
        const expected = chandeKrollOracle(source, outputId);
        const actual = runtime.points(outputId);
        assert.equal(actual.length, expected.length, outputId);
        actual.forEach((point, index) => {
            assert.equal(point.sourceIndex, expected[index].index);
            assert.equal(point.targetIndex, expected[index].index);
            assert.equal(point.time, expected[index].time);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-12;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
    }
}

function elderRayOracle(source, length, outputId) {
    return calcElderRay(source, { length })[outputId]
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertElderRay(runtime, source, length) {
    for (const outputId of ['bull', 'bear']) {
        const expected = elderRayOracle(source, length, outputId);
        const actual = runtime.points(outputId);
        assert.equal(actual.length, expected.length, outputId);
        actual.forEach((point, index) => {
            assert.equal(point.sourceIndex, expected[index].index);
            assert.equal(point.targetIndex, expected[index].index);
            assert.equal(point.time, expected[index].time);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-12;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
    }
}

const FIBONACCI_OUTPUTS = ['l236', 'l382', 'l500', 'l618', 'l786'];

function fibonacciOracle(source, length, outputId) {
    return calcFibonacciRetracement(source, { length })[outputId]
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertFibonacci(runtime, source, length) {
    for (const outputId of FIBONACCI_OUTPUTS) {
        const expected = fibonacciOracle(source, length, outputId);
        const actual = runtime.points(outputId);
        assert.equal(actual.length, expected.length, outputId);
        actual.forEach((point, index) => {
            assert.equal(point.sourceIndex, expected[index].index);
            assert.equal(point.targetIndex, expected[index].index);
            assert.equal(point.time, expected[index].time);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-12;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
    }
}

function vhfOracle(source, length) {
    return calcVHF(source, { length })
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertVhf(runtime, source, length) {
    const expected = vhfOracle(source, length);
    const actual = runtime.points('line');
    assert.equal(actual.length, expected.length);
    actual.forEach((point, index) => {
        assert.equal(point.sourceIndex, expected[index].index);
        assert.equal(point.targetIndex, expected[index].index);
        assert.equal(point.time, expected[index].time);
        const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-12;
        assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
    });
}

function vortexOracle(source, length, outputId) {
    return calcVortex(source, { length })[outputId]
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertVortex(runtime, source, length) {
    for (const outputId of ['viPlus', 'viMinus']) {
        const expected = vortexOracle(source, length, outputId);
        const actual = runtime.points(outputId);
        assert.equal(actual.length, expected.length, outputId);
        actual.forEach((point, index) => {
            assert.equal(point.sourceIndex, expected[index].index);
            assert.equal(point.targetIndex, expected[index].index);
            assert.equal(point.time, expected[index].time);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-12;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
    }
}

function bearOracle(source, length) {
    return calcBearPower(source, { length })
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertBearPower(runtime, source, length) {
    const expected = bearOracle(source, length);
    const actual = runtime.points('line');
    assert.equal(actual.length, expected.length);
    actual.forEach((point, index) => {
        assert.equal(point.sourceIndex, expected[index].index);
        assert.equal(point.targetIndex, expected[index].index);
        assert.equal(point.time, expected[index].time);
        assert.ok(Math.abs(point.value - expected[index].value) <= 1e-10);
    });
}

function bullOracle(source, length) {
    return calcBullPower(source, { length })
        .map((point, index) => ({ index, time: point.time, value: point.value }))
        .filter((point) => typeof point.value === 'number' && Number.isFinite(point.value));
}

function assertBullPower(runtime, source, length) {
    const expected = bullOracle(source, length);
    const actual = runtime.points('line');
    assert.equal(actual.length, expected.length);
    actual.forEach((point, index) => {
        assert.equal(point.sourceIndex, expected[index].index);
        assert.equal(point.targetIndex, expected[index].index);
        assert.equal(point.time, expected[index].time);
        assert.ok(Math.abs(point.value - expected[index].value) <= 1e-10);
    });
}

describe('incremental range indicators', () => {
    it('registers Aroon with stable dual outputs and a real trend category', () => {
        assert.deepEqual(RangeIndicators.map((item) => item.id), [
            'Aroon',
            'AroonOscillator',
            'BalanceOfPower',
            'BearPower',
            'BullPower',
            'BalanceOfMarketPower',
            'ChoppinessIndex',
            'ChandeKrollStop',
            'ElderRay',
            'FibonacciRetracement',
            'VerticalHorizontalFilter',
            'VortexIndicator',
        ]);
        assert.deepEqual(AroonIndicator.outputs.map((item) => item.id), ['up', 'down']);
        assert.equal(AroonIndicator.category, IndicatorCategory.Trend);
        assert.equal(BalanceOfPowerIndicator.category, IndicatorCategory.MarketStrength);
        assert.equal(BearPowerIndicator.category, IndicatorCategory.MarketStrength);
        assert.equal(BullPowerIndicator.category, IndicatorCategory.MarketStrength);
        assert.equal(BalanceOfMarketPowerIndicator.category, IndicatorCategory.MarketStrength);
        assert.equal(ChoppinessIndexIndicator.category, IndicatorCategory.MarketStrength);
        assert.equal(ChandeKrollStopIndicator.category, IndicatorCategory.SupportResistance);
        assert.equal(ElderRayIndicator.category, IndicatorCategory.MarketStrength);
        assert.equal(
            FibonacciRetracementIndicator.category,
            IndicatorCategory.SupportResistance,
        );
        assert.equal(
            VerticalHorizontalFilterIndicator.category,
            IndicatorCategory.MarketStrength,
        );
        assert.deepEqual(VortexIndicator.outputs.map((output) => output.id), [
            'viPlus', 'viMinus',
        ]);
        assert.equal(VortexIndicator.category, IndicatorCategory.MarketStrength);
        assert.deepEqual(
            FibonacciRetracementIndicator.outputs.map((output) => output.id),
            FIBONACCI_OUTPUTS,
        );
        assert.equal(getIndicatorDefinition('aROON'), AroonIndicator);
        assert.equal(getIndicatorDefinition('AROONoscillator'), AroonOscillatorIndicator);
        assert.throws(
            () => AroonIndicator.processorFactory({ length: 0 }),
            /integer from 1 to 500/,
        );
    });

    it('matches Vertical Horizontal Filter across append, preview, gaps and replay', () => {
        const source = bars(64);
        const filterLength = 7;
        const runtime = new IndicatorRuntime({
            definition: VerticalHorizontalFilterIndicator,
            parameters: { length: filterLength },
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertVhf(runtime, source.slice(0, index + 1), filterLength);
        }

        const committed = source.slice(0, 44);
        runtime.reset(committed.map(input));
        for (const delta of [2, -4, 6, -1]) {
            const probe = {
                ...source[44],
                high: source[44].high + delta,
                low: source[44].low - delta / 2,
                close: source[44].close + delta / 3,
            };
            runtime.update(input(probe), false);
            assertVhf(runtime, [...committed, probe], filterLength);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[44]), true);
        const finalized = [...committed, source[44]];
        const corrected = {
            ...source[18],
            high: source[18].high + 11,
            low: source[18].low - 7,
            close: source[18].close + 4,
        };
        runtime.correct(18, input(corrected));
        finalized[18] = corrected;
        assertVhf(runtime, finalized, filterLength);

        const withGaps = bars(35);
        withGaps[8] = { ...withGaps[8], high: Number.NaN };
        withGaps[19] = { ...withGaps[19], close: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertVhf(runtime, withGaps, filterLength);

        const streaming = new IndicatorRuntime({
            definition: VerticalHorizontalFilterIndicator,
            parameters: { length: filterLength },
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[44]));
        const expected = vhfOracle([...committed, source[44]], filterLength);
        assert.equal(points.length, expected.length);
        points.forEach((point, index) => {
            assert.equal(point.targetIndex, expected[index].index);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-12;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
    });

    it('matches Vortex Indicator across append, preview, gaps and replay', () => {
        const source = bars(64);
        const vortexLength = 7;
        const runtime = new IndicatorRuntime({
            definition: VortexIndicator,
            parameters: { length: vortexLength },
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertVortex(runtime, source.slice(0, index + 1), vortexLength);
        }

        const committed = source.slice(0, 44);
        runtime.reset(committed.map(input));
        for (const delta of [2, -4, 6, -1]) {
            const probe = {
                ...source[44],
                high: source[44].high + delta,
                low: source[44].low - delta / 2,
                close: source[44].close + delta / 3,
            };
            runtime.update(input(probe), false);
            assertVortex(runtime, [...committed, probe], vortexLength);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[44]), true);
        const finalized = [...committed, source[44]];
        const corrected = {
            ...source[18],
            high: source[18].high + 11,
            low: source[18].low - 7,
            close: source[18].close + 4,
        };
        runtime.correct(18, input(corrected));
        finalized[18] = corrected;
        assertVortex(runtime, finalized, vortexLength);

        const withGaps = bars(35);
        withGaps[8] = { ...withGaps[8], high: Number.NaN };
        withGaps[19] = { ...withGaps[19], close: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertVortex(runtime, withGaps, vortexLength);

        const streaming = new IndicatorRuntime({
            definition: VortexIndicator,
            parameters: { length: vortexLength },
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[44]));
        const expected = ['viPlus', 'viMinus'].flatMap((outputId) => (
            vortexOracle([...committed, source[44]], vortexLength, outputId)
                .map((point) => ({ ...point, outputId }))
        ));
        assert.equal(points.length, expected.length);
        points.forEach((point, index) => {
            assert.equal(point.outputId, expected[index].outputId);
            assert.equal(point.targetIndex, expected[index].index);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-12;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
    });

    it('Vortex Indicator preserves formed zeros for a flat range', () => {
        const source = Array.from({ length: 5 }, (_, index) => ({
            time: index + 1,
            open: 10,
            high: 10,
            low: 10,
            close: 10,
            volume: 100,
        }));
        const runtime = new IndicatorRuntime({
            definition: VortexIndicator,
            parameters: { length: 2 },
        });
        runtime.reset(source.map(input));
        assert.ok(runtime.points('viPlus').every((point) => point.value === 0));
        assert.ok(runtime.points('viMinus').every((point) => point.value === 0));
    });

    it('matches Elder Ray across append, preview, gaps and replay', () => {
        const source = bars(64);
        const length = 7;
        const runtime = new IndicatorRuntime({
            definition: ElderRayIndicator,
            parameters: { length },
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertElderRay(runtime, source.slice(0, index + 1), length);
        }

        const committed = source.slice(0, 44);
        runtime.reset(committed.map(input));
        for (const delta of [2, -4, 6, -1]) {
            const probe = {
                ...source[44],
                close: source[44].close + delta,
                high: source[44].high + delta / 2,
                low: source[44].low - delta / 3,
            };
            runtime.update(input(probe), false);
            assertElderRay(runtime, [...committed, probe], length);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[44]), true);
        const finalized = [...committed, source[44]];
        const corrected = {
            ...source[18],
            close: source[18].close + 7,
            high: source[18].high + 10,
            low: source[18].low - 5,
        };
        runtime.correct(18, input(corrected));
        finalized[18] = corrected;
        assertElderRay(runtime, finalized, length);

        const withGaps = bars(35);
        withGaps[15] = { ...withGaps[15], close: Number.NaN };
        withGaps[24] = { ...withGaps[24], high: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertElderRay(runtime, withGaps, length);

        const streaming = new IndicatorRuntime({
            definition: ElderRayIndicator,
            parameters: { length },
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[44]));
        const all = [...committed, source[44]];
        const expected = ['bull', 'bear'].flatMap((outputId) => (
            elderRayOracle(all, length, outputId).map((point) => ({ ...point, outputId }))
        ));
        assert.equal(points.length, expected.length);
        points.forEach((point, index) => {
            assert.equal(point.outputId, expected[index].outputId);
            assert.equal(point.targetIndex, expected[index].index);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-12;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
    });

    it('matches Fibonacci Retracement across append, preview, gaps and replay', () => {
        const source = bars(64);
        const length = 7;
        const runtime = new IndicatorRuntime({
            definition: FibonacciRetracementIndicator,
            parameters: { length },
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertFibonacci(runtime, source.slice(0, index + 1), length);
        }

        const committed = source.slice(0, 44);
        runtime.reset(committed.map(input));
        for (const delta of [2, -4, 6, -1]) {
            const probe = {
                ...source[44],
                high: source[44].high + delta,
                low: source[44].low - delta / 2,
            };
            runtime.update(input(probe), false);
            assertFibonacci(runtime, [...committed, probe], length);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[44]), true);
        const finalized = [...committed, source[44]];
        const corrected = {
            ...source[18],
            high: source[18].high + 12,
            low: source[18].low - 8,
        };
        runtime.correct(18, input(corrected));
        finalized[18] = corrected;
        assertFibonacci(runtime, finalized, length);

        const withGaps = bars(35);
        withGaps[8] = { ...withGaps[8], high: Number.NaN };
        withGaps[19] = { ...withGaps[19], low: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertFibonacci(runtime, withGaps, length);

        const streaming = new IndicatorRuntime({
            definition: FibonacciRetracementIndicator,
            parameters: { length },
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[44]));
        const all = [...committed, source[44]];
        const expected = FIBONACCI_OUTPUTS.flatMap((outputId) => (
            fibonacciOracle(all, length, outputId).map((point) => ({ ...point, outputId }))
        ));
        assert.equal(points.length, expected.length);
        points.forEach((point, index) => {
            assert.equal(point.outputId, expected[index].outputId);
            assert.equal(point.targetIndex, expected[index].index);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-12;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
    });

    it('matches Chande Kroll Stop across append, preview, gaps and replay', () => {
        const source = bars(64);
        const runtime = new IndicatorRuntime({
            definition: ChandeKrollStopIndicator,
            parameters: CHANDE_KROLL_PARAMS,
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertChandeKroll(runtime, source.slice(0, index + 1));
        }

        const committed = source.slice(0, 44);
        runtime.reset(committed.map(input));
        for (const delta of [2, -4, 6, -1]) {
            const probe = {
                ...source[44],
                high: source[44].high + delta,
                low: source[44].low - delta / 2,
            };
            runtime.update(input(probe), false);
            assertChandeKroll(runtime, [...committed, probe]);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[44]), true);
        const finalized = [...committed, source[44]];
        const corrected = {
            ...source[18],
            high: source[18].high + 12,
            low: source[18].low - 8,
        };
        runtime.correct(18, input(corrected));
        finalized[18] = corrected;
        assertChandeKroll(runtime, finalized);

        const withGaps = bars(35);
        withGaps[8] = { ...withGaps[8], high: Number.NaN };
        withGaps[19] = { ...withGaps[19], low: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertChandeKroll(runtime, withGaps);

        const streaming = new IndicatorRuntime({
            definition: ChandeKrollStopIndicator,
            parameters: CHANDE_KROLL_PARAMS,
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[44]));
        const all = [...committed, source[44]];
        const expected = ['longStop', 'shortStop'].flatMap((outputId) => (
            chandeKrollOracle(all, outputId).map((point) => ({ ...point, outputId }))
        ));
        assert.equal(points.length, expected.length);
        points.forEach((point, index) => {
            assert.equal(point.outputId, expected[index].outputId);
            assert.equal(point.targetIndex, expected[index].index);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-12;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
    });

    it('matches Choppiness Index across append, preview, gaps and replay', () => {
        const source = bars(64);
        const length = 7;
        const runtime = new IndicatorRuntime({
            definition: ChoppinessIndexIndicator,
            parameters: { length },
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertChoppiness(runtime, source.slice(0, index + 1), length);
        }

        const committed = source.slice(0, 44);
        runtime.reset(committed.map(input));
        for (const delta of [2, -4, 6, -1]) {
            const probe = {
                ...source[44],
                high: source[44].high + delta,
                low: source[44].low - delta / 2,
                close: source[44].close + delta / 3,
            };
            runtime.update(input(probe), false);
            assertChoppiness(runtime, [...committed, probe], length);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[44]), true);
        const finalized = [...committed, source[44]];
        const corrected = {
            ...source[18],
            high: source[18].high + 11,
            low: source[18].low - 7,
            close: source[18].close + 4,
        };
        runtime.correct(18, input(corrected));
        finalized[18] = corrected;
        assertChoppiness(runtime, finalized, length);

        const withGaps = bars(35);
        withGaps[8] = { ...withGaps[8], high: Number.NaN };
        withGaps[19] = { ...withGaps[19], close: Number.NaN };
        withGaps[27] = { ...withGaps[27], high: withGaps[27].low };
        runtime.reset(withGaps.map(input));
        assertChoppiness(runtime, withGaps, length);

        const streaming = new IndicatorRuntime({
            definition: ChoppinessIndexIndicator,
            parameters: { length },
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[44]));
        const expected = choppinessOracle([...committed, source[44]], length);
        assert.equal(points.length, expected.length);
        points.forEach((point, index) => {
            assert.equal(point.targetIndex, expected[index].index);
            const tolerance = Math.max(1, Math.abs(expected[index].value)) * 1e-12;
            assert.ok(Math.abs(point.value - expected[index].value) <= tolerance);
        });
    });

    it('matches Balance of Market Power across append, preview, gaps and replay', () => {
        const source = bars(64);
        const length = 7;
        const runtime = new IndicatorRuntime({
            definition: BalanceOfMarketPowerIndicator,
            parameters: { length },
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertBalanceOfMarketPower(runtime, source.slice(0, index + 1), length);
        }

        const committed = source.slice(0, 44);
        runtime.reset(committed.map(input));
        for (const delta of [2, -4, 6, -1]) {
            const probe = {
                ...source[44],
                open: source[44].open - delta,
                close: source[44].close + delta,
                volume: delta === -4 ? 0 : source[44].volume,
            };
            runtime.update(input(probe), false);
            assertBalanceOfMarketPower(runtime, [...committed, probe], length);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[44]), true);
        const finalized = [...committed, source[44]];
        const corrected = {
            ...source[18],
            open: source[18].open - 7,
            close: source[18].close + 9,
        };
        runtime.correct(18, input(corrected));
        finalized[18] = corrected;
        assertBalanceOfMarketPower(runtime, finalized, length);

        const withGaps = bars(35);
        withGaps[8] = { ...withGaps[8], high: Number.NaN };
        withGaps[17] = { ...withGaps[17], volume: 0 };
        withGaps[25] = { ...withGaps[25], high: withGaps[25].low };
        runtime.reset(withGaps.map(input));
        assertBalanceOfMarketPower(runtime, withGaps, length);

        const streaming = new IndicatorRuntime({
            definition: BalanceOfMarketPowerIndicator,
            parameters: { length },
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[44]));
        const expected = marketPowerOracle([...committed, source[44]], length);
        assert.equal(points.length, expected.length);
        points.forEach((point, index) => {
            assert.equal(point.targetIndex, expected[index].index);
            assert.ok(Math.abs(point.value - expected[index].value) <= 1e-12);
        });
    });

    it('matches Bull Power batch across seed, live gaps and historical replay', () => {
        const source = bars(64);
        const length = 7;
        const runtime = new IndicatorRuntime({
            definition: BullPowerIndicator,
            parameters: { length },
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertBullPower(runtime, source.slice(0, index + 1), length);
        }

        const committed = source.slice(0, 44);
        runtime.reset(committed.map(input));
        for (const delta of [2, -4, 6, -1]) {
            const probe = {
                ...source[44],
                close: source[44].close + delta,
                high: source[44].high + delta / 2,
            };
            runtime.update(input(probe), false);
            assertBullPower(runtime, [...committed, probe], length);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[44]), true);
        const finalized = [...committed, source[44]];
        const corrected = {
            ...source[18],
            close: source[18].close + 8,
            high: source[18].high + 12,
        };
        runtime.correct(18, input(corrected));
        finalized[18] = corrected;
        assertBullPower(runtime, finalized, length);

        const withGaps = bars(35);
        withGaps[15] = { ...withGaps[15], close: Number.NaN };
        withGaps[24] = { ...withGaps[24], high: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertBullPower(runtime, withGaps, length);

        const brokenSeed = bars(25);
        brokenSeed[3] = { ...brokenSeed[3], close: Number.NaN };
        runtime.reset(brokenSeed.map(input));
        assertBullPower(runtime, brokenSeed, length);

        const streaming = new IndicatorRuntime({
            definition: BullPowerIndicator,
            parameters: { length },
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[44]));
        const expected = bullOracle([...committed, source[44]], length);
        assert.equal(points.length, expected.length);
        points.forEach((point, index) => {
            assert.equal(point.targetIndex, expected[index].index);
            assert.ok(Math.abs(point.value - expected[index].value) <= 1e-10);
        });
    });

    it('matches Bear Power batch across seed, live gaps and historical replay', () => {
        const source = bars(64);
        const length = 7;
        const runtime = new IndicatorRuntime({
            definition: BearPowerIndicator,
            parameters: { length },
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertBearPower(runtime, source.slice(0, index + 1), length);
        }

        const committed = source.slice(0, 44);
        runtime.reset(committed.map(input));
        for (const delta of [2, -4, 6, -1]) {
            const probe = {
                ...source[44],
                close: source[44].close + delta,
                low: source[44].low + delta / 2,
            };
            runtime.update(input(probe), false);
            assertBearPower(runtime, [...committed, probe], length);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[44]), true);
        const finalized = [...committed, source[44]];
        const corrected = {
            ...source[18],
            close: source[18].close + 8,
            low: source[18].low - 4,
        };
        runtime.correct(18, input(corrected));
        finalized[18] = corrected;
        assertBearPower(runtime, finalized, length);

        const withGaps = bars(35);
        withGaps[15] = { ...withGaps[15], close: Number.NaN };
        withGaps[24] = { ...withGaps[24], low: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertBearPower(runtime, withGaps, length);

        const brokenSeed = bars(25);
        brokenSeed[3] = { ...brokenSeed[3], close: Number.NaN };
        runtime.reset(brokenSeed.map(input));
        assertBearPower(runtime, brokenSeed, length);

        const streaming = new IndicatorRuntime({
            definition: BearPowerIndicator,
            parameters: { length },
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[44]));
        const expected = bearOracle([...committed, source[44]], length);
        assert.equal(points.length, expected.length);
        points.forEach((point, index) => {
            assert.equal(point.targetIndex, expected[index].index);
            assert.ok(Math.abs(point.value - expected[index].value) <= 1e-10);
        });
    });

    it('matches Balance of Power batch across live and historical mutations', () => {
        const source = bars(58);
        const runtime = new IndicatorRuntime({
            definition: BalanceOfPowerIndicator,
            parameters: {},
            checkpointInterval: 10,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertBalanceOfPower(runtime, source.slice(0, index + 1));
        }

        const committed = source.slice(0, 42);
        runtime.reset(committed.map(input));
        for (const delta of [2, -4, 7, -1]) {
            const probe = {
                ...source[42],
                open: source[42].open - delta,
                close: source[42].close + delta,
            };
            runtime.update(input(probe), false);
            assertBalanceOfPower(runtime, [...committed, probe]);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[42]), true);
        const finalized = [...committed, source[42]];
        const corrected = {
            ...source[16],
            open: source[16].low - 10,
            close: source[16].high + 10,
        };
        runtime.correct(16, input(corrected));
        finalized[16] = corrected;
        assertBalanceOfPower(runtime, finalized);

        const withGaps = bars(34);
        withGaps[4] = { ...withGaps[4], open: Number.NaN };
        withGaps[12] = { ...withGaps[12], high: withGaps[12].low };
        withGaps[23] = { ...withGaps[23], close: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertBalanceOfPower(runtime, withGaps);

        const streaming = new IndicatorRuntime({
            definition: BalanceOfPowerIndicator,
            parameters: {},
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[42]));
        const expected = bopOracle([...committed, source[42]]);
        assert.equal(points.length, expected.length);
        points.forEach((point, index) => {
            assert.equal(point.targetIndex, expected[index].index);
            assert.equal(point.value, expected[index].value);
        });
    });

    it('matches Aroon Oscillator batch across append, preview, replay, gaps and reset', () => {
        const source = bars(68);
        const length = 7;
        const runtime = new IndicatorRuntime({
            definition: AroonOscillatorIndicator,
            parameters: { length },
            checkpointInterval: 9,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertOscillator(runtime, source.slice(0, index + 1), length);
        }

        const committed = source.slice(0, 45);
        runtime.reset(committed.map(input));
        for (const delta of [4, -6, 9, -3]) {
            const probe = {
                ...source[45],
                high: source[45].high + delta,
                low: source[45].low - delta / 2,
            };
            runtime.update(input(probe), false);
            assertOscillator(runtime, [...committed, probe], length);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[45]), true);
        const finalized = [...committed, source[45]];
        const corrected = {
            ...source[22],
            high: source[22].high + 13,
            low: source[22].low - 9,
        };
        runtime.correct(22, input(corrected));
        finalized[22] = corrected;
        assertOscillator(runtime, finalized, length);

        const withGaps = bars(36);
        withGaps[5] = { ...withGaps[5], high: Number.NaN };
        withGaps[17] = { ...withGaps[17], low: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertOscillator(runtime, withGaps, length);

        const streaming = new IndicatorRuntime({
            definition: AroonOscillatorIndicator,
            parameters: { length },
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[45]));
        const expected = oscillatorOracle([...committed, source[45]], length);
        assert.equal(points.length, expected.length);
        points.forEach((point, index) => {
            assert.equal(point.targetIndex, expected[index].index);
            assert.equal(point.value, expected[index].value);
        });
    });

    it('keeps Aroon Oscillator previews isolated from its shared kernel state', () => {
        const processor = new AroonOscillatorProcessor(3);
        const makeInput = (index, high, low, isFinal) => ({
            index,
            time: index + 1,
            value: { time: index + 1, open: 0, high, low, close: 0 },
            isFinal,
        });
        processor.process(makeInput(0, 3, 1, true));
        processor.process(makeInput(1, 5, 2, true));
        const checkpoint = processor.checkpoint();
        processor.process(makeInput(2, 9, 0, false));
        processor.process(makeInput(2, 4, 3, false));
        assert.deepEqual(processor.checkpoint(), checkpoint);
    });

    it('matches StockSharp eviction and tie semantics exactly', () => {
        const rows = [
            [5, 1], [5, 2], [4, 2], [3, 3], [5, 2],
            [2, 1], [2, 1], [6, 0], [6, 0], [4, 2],
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
            definition: AroonIndicator,
            parameters: { length: 4 },
        });
        runtime.reset(source.map(input));
        assertAroon(runtime, source, 4);
    });

    it('matches every batch append and initial reset', () => {
        const source = bars();
        const length = 9;
        const runtime = new IndicatorRuntime({
            definition: AroonIndicator,
            parameters: { length },
            checkpointInterval: 11,
        });
        for (let index = 0; index < source.length; index += 1) {
            runtime.update(input(source[index]), true);
            assertAroon(runtime, source.slice(0, index + 1), length);
        }

        const reset = new IndicatorRuntime({
            definition: AroonIndicator,
            parameters: { length },
        });
        reset.reset(source.map(input));
        assertAroon(reset, source, length);
    });

    it('matches previews, finalization, gaps, correction replay and streaming reset', () => {
        const source = bars(60);
        const length = 8;
        const committed = source.slice(0, 43);
        const runtime = new IndicatorRuntime({
            definition: AroonIndicator,
            parameters: { length },
            checkpointInterval: 7,
        });
        runtime.reset(committed.map(input));

        for (const delta of [3, -5, 8, -2]) {
            const probe = {
                ...source[43],
                high: source[43].high + delta,
                low: source[43].low - delta / 2,
            };
            runtime.update(input(probe), false);
            assertAroon(runtime, [...committed, probe], length);
            assert.equal(runtime.committedCount, committed.length);
        }

        runtime.update(input(source[43]), true);
        const finalized = [...committed, source[43]];
        assertAroon(runtime, finalized, length);

        const corrected = {
            ...source[19],
            high: source[19].high + 15,
            low: source[19].low - 8,
        };
        runtime.correct(19, input(corrected));
        finalized[19] = corrected;
        assertAroon(runtime, finalized, length);

        const withGaps = bars(38);
        withGaps[7] = { ...withGaps[7], high: Number.NaN };
        withGaps[18] = { ...withGaps[18], low: Number.NaN };
        runtime.reset(withGaps.map(input));
        assertAroon(runtime, withGaps, length);

        const streaming = new IndicatorRuntime({
            definition: AroonIndicator,
            parameters: { length },
        });
        const points = streaming.resetStreaming(committed.map(input), input(source[43]));
        const expected = ['up', 'down'].flatMap((outputId) => (
            oracle([...committed, source[43]], length, outputId)
                .map((point) => ({ ...point, outputId }))
        ));
        assert.equal(points.length, expected.length);
        points.forEach((point, index) => {
            assert.equal(point.outputId, expected[index].outputId);
            assert.equal(point.targetIndex, expected[index].index);
            assert.equal(point.value, expected[index].value);
        });
        assert.equal(streaming.retainedFrom, committed.length);
        assert.equal(streaming.hasPreview, true);
    });

    it('keeps non-final processor calls isolated from committed Aroon state', () => {
        const processor = new AroonProcessor(3);
        const makeInput = (index, high, low, isFinal) => ({
            index,
            time: index + 1,
            value: { time: index + 1, open: 0, high, low, close: 0 },
            isFinal,
        });
        processor.process(makeInput(0, 3, 1, true));
        processor.process(makeInput(1, 5, 2, true));
        const checkpoint = processor.checkpoint();
        processor.process(makeInput(2, 9, 0, false));
        processor.process(makeInput(2, 4, 3, false));
        assert.deepEqual(processor.checkpoint(), checkpoint);
    });
});
