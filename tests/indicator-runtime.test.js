const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    CandlestickIndicatorInput,
    IndicatorCategory,
    IndicatorMeasure,
    IndicatorPane,
    IndicatorPatchOperation,
    IndicatorRuntime,
    IndicatorRuntimePatchKind,
    IndicatorSeriesStyle,
    SequentialIndicatorProcessor,
} = require('../src/indicators/index.js');

class SumProcessor extends SequentialIndicatorProcessor {
    constructor(shift = 0) {
        super(['value']);
        this.sum = 0;
        this.shift = shift;
    }
    calculate(input, commit) {
        const sum = this.sum + input.value.close;
        if (commit) this.sum = sum;
        return {
            isFormed: true,
            values: [this.output('value', sum, Math.max(0, input.index - this.shift))],
        };
    }
    resetState() { this.sum = 0; }
    captureState() { return Object.freeze({ sum: this.sum }); }
    restoreState(state) { this.sum = state.sum; }
}

class NullableProcessor extends SequentialIndicatorProcessor {
    constructor() { super(['value']); }
    calculate(input) {
        const close = input.value.close;
        return {
            isFormed: close >= 0,
            values: [this.output('value', close >= 0 ? close : null, input.index)],
        };
    }
    resetState() {}
    captureState() { return Object.freeze({}); }
    restoreState() {}
}

class FutureProcessor extends SequentialIndicatorProcessor {
    constructor() { super(['value']); }
    calculate(input) {
        return {
            isFormed: true,
            values: [this.output('value', input.value.close, input.index + 2)],
        };
    }
    resetState() {}
    captureState() { return Object.freeze({}); }
    restoreState() {}
}

class DirectionProcessor extends SequentialIndicatorProcessor {
    constructor() { super(['value']); }
    calculate(input) {
        return {
            isFormed: true,
            values: [this.output(
                'value',
                Math.abs(input.value.close),
                input.index,
                { up: input.value.close >= 0 },
            )],
        };
    }
    resetState() {}
    captureState() { return Object.freeze({}); }
    restoreState() {}
}

class ThrowProcessor extends SumProcessor {
    calculate(input, commit) {
        if (input.value.close === 99) throw new Error('deliberate processor failure');
        return super.calculate(input, commit);
    }
}

function definition(shift = 0) {
    return {
        id: 'CumulativeClose',
        name: 'Cumulative Close',
        description: 'Runtime test definition.',
        category: IndicatorCategory.Momentum,
        input: CandlestickIndicatorInput,
        parameters: [],
        outputs: [{
            id: 'value', name: 'Value',
            defaultStyle: { series: IndicatorSeriesStyle.Line },
        }],
        naturalPane: IndicatorPane.Separate,
        measure: IndicatorMeasure.Absolute,
        processorFactory: () => new SumProcessor(shift),
    };
}

function candle(time, close) {
    return { time, value: { time, open: close, high: close, low: close, close } };
}

function runtime(options = {}) {
    return new IndicatorRuntime({
        definition: definition(options.shift),
        parameters: {},
        checkpointInterval: options.checkpointInterval || 2,
    });
}

describe('IndicatorRuntime', () => {
    it('emits tail patches while previews leave committed state untouched', () => {
        const value = runtime();
        const initial = value.reset([candle(1, 1), candle(2, 2), candle(3, 3)]);
        assert.equal(initial.kind, IndicatorRuntimePatchKind.Reset);
        assert.deepEqual(initial.operations.map((item) => item.operation), [
            IndicatorPatchOperation.Append,
            IndicatorPatchOperation.Append,
            IndicatorPatchOperation.Append,
        ]);
        assert.deepEqual(value.points().map((point) => point.value), [1, 3, 6]);

        const firstPreview = value.update(candle(4, 4), false);
        assert.equal(firstPreview.operations.length, 1);
        assert.equal(firstPreview.operations[0].operation, IndicatorPatchOperation.Append);
        assert.equal(firstPreview.operations[0].point.value, 10);
        assert.equal(value.committedCount, 3);
        assert.equal(value.hasPreview, true);

        const secondPreview = value.update(candle(4, 10), false);
        assert.equal(secondPreview.operations.length, 1);
        assert.equal(secondPreview.operations[0].operation, IndicatorPatchOperation.Replace);
        assert.equal(secondPreview.operations[0].point.value, 16);
        assert.equal(value.committedCount, 3);

        const final = value.update(candle(4, 5), true);
        assert.equal(final.operations.length, 1);
        assert.equal(final.operations[0].operation, IndicatorPatchOperation.Replace);
        assert.equal(final.operations[0].point.value, 11);
        assert.equal(value.committedCount, 4);
        assert.equal(value.hasPreview, false);
        assert.deepEqual(value.points().map((point) => point.value), [1, 3, 6, 11]);
    });

    it('discards a preview and truncates retained committed inputs through patches', () => {
        const value = runtime({ checkpointInterval: 2 });
        value.reset([candle(1, 1), candle(2, 2), candle(3, 3)]);
        value.update(candle(4, 4), false);

        const discarded = value.discardPreview();
        assert.equal(discarded.kind, IndicatorRuntimePatchKind.Correction);
        assert.deepEqual(discarded.operations, [{
            operation: IndicatorPatchOperation.Remove,
            outputId: 'value',
            targetIndex: 3,
        }]);
        assert.equal(value.hasPreview, false);
        assert.deepEqual(value.points().map((point) => point.value), [1, 3, 6]);

        const truncated = value.truncateTail();
        assert.equal(truncated.kind, IndicatorRuntimePatchKind.Correction);
        assert.equal(truncated.fromIndex, 2);
        assert.deepEqual(truncated.operations, [{
            operation: IndicatorPatchOperation.Remove,
            outputId: 'value',
            targetIndex: 2,
        }]);
        assert.equal(value.committedCount, 2);
        assert.deepEqual(value.points().map((point) => point.value), [1, 3]);

        const replacement = value.update(candle(3, 10), false);
        assert.equal(replacement.operations[0].operation, IndicatorPatchOperation.Append);
        assert.equal(replacement.operations[0].point.value, 13);
    });

    it('requires an explicit preview discard and refuses to truncate compacted history', () => {
        const value = runtime();
        value.reset([candle(1, 1), candle(2, 2)]);
        value.update(candle(3, 3), false);
        assert.throws(() => value.truncateTail(), /discard.*preview/i);

        value.discardPreview();
        value.compactHistory();
        assert.throws(() => value.truncateTail(), /no longer retained/);
    });

    it('preserves metadata and emits a patch when only painter fields change', () => {
        const value = new IndicatorRuntime({
            definition: { ...definition(), processorFactory: () => new DirectionProcessor() },
            parameters: {},
        });
        value.reset([candle(1, 1)]);

        const appended = value.update(candle(2, 5), false);
        assert.equal(appended.operations[0].operation, IndicatorPatchOperation.Append);
        assert.deepEqual(appended.operations[0].point.metadata, { up: true });
        assert.equal(Object.isFrozen(appended.operations[0].point.metadata), true);

        assert.equal(value.update(candle(2, 5), false).operations.length, 0);
        const recolored = value.update(candle(2, -5), false);
        assert.equal(recolored.operations.length, 1);
        assert.equal(recolored.operations[0].operation, IndicatorPatchOperation.Replace);
        assert.equal(recolored.operations[0].point.value, 5);
        assert.deepEqual(recolored.operations[0].point.metadata, { up: false });

        value.update(candle(2, -5), true);
        const corrected = value.correct(1, candle(2, 5));
        assert.equal(corrected.operations.length, 1);
        assert.equal(corrected.operations[0].operation, IndicatorPatchOperation.Replace);
        assert.equal(corrected.operations[0].point.value, 5);
        assert.deepEqual(corrected.operations[0].point.metadata, { up: true });

        const streaming = new IndicatorRuntime({
            definition: { ...definition(), processorFactory: () => new DirectionProcessor() },
            parameters: {},
        }).resetStreaming([candle(1, -3)]);
        assert.deepEqual(streaming[0].metadata, { up: false });
    });

    it('reopens a committed tail for replace-last without replaying on every preview', () => {
        const value = runtime();
        value.reset([candle(1, 2), candle(2, 3)]);

        const reopened = value.update(candle(2, 5), false);
        assert.equal(reopened.kind, IndicatorRuntimePatchKind.Correction);
        assert.equal(value.committedCount, 1);
        assert.equal(value.hasPreview, true);
        assert.deepEqual(value.points().map((point) => point.value), [2, 7]);

        const preview = value.update(candle(2, 8), false);
        assert.equal(preview.kind, IndicatorRuntimePatchKind.Update);
        assert.deepEqual(value.points().map((point) => point.value), [2, 10]);
        value.update(candle(2, 8), true);
        assert.equal(value.committedCount, 2);
        assert.deepEqual(value.points().map((point) => point.value), [2, 10]);
    });

    it('replays historical corrections from checkpoints and returns only changed points', () => {
        const value = runtime({ checkpointInterval: 2 });
        value.reset([
            candle(1, 1), candle(2, 2), candle(3, 3),
            candle(4, 4), candle(5, 5), candle(6, 6),
        ]);
        const patch = value.correct(2, candle(3, 30));

        assert.equal(patch.kind, IndicatorRuntimePatchKind.Correction);
        assert.equal(patch.fromIndex, 2);
        assert.deepEqual(patch.operations.map((item) => item.targetIndex), [2, 3, 4, 5]);
        assert.ok(patch.operations.every((item) => item.operation === IndicatorPatchOperation.Replace));
        assert.deepEqual(value.points().map((point) => point.value), [1, 3, 33, 37, 42, 48]);
        assert.deepEqual(value.snapshot(), {
            revision: 2,
            committedInputs: 6,
            retainedFrom: 0,
            hasPreview: false,
            outputPoints: 6,
            checkpoints: 4,
        });
    });

    it('uses targetIndex for shifted sparse replacements', () => {
        const value = runtime({ shift: 2 });
        value.reset([candle(1, 1), candle(2, 2)]);
        const patch = value.update(candle(3, 3), true);

        assert.equal(patch.operations.length, 1);
        assert.equal(patch.operations[0].operation, IndicatorPatchOperation.Replace);
        assert.equal(patch.operations[0].targetIndex, 0);
        assert.equal(patch.operations[0].point.sourceIndex, 2);
        assert.equal(patch.operations[0].point.time, 1);
        assert.deepEqual(value.points(), [
            { outputId: 'value', sourceIndex: 2, targetIndex: 0, time: 1, value: 6 },
        ]);
    });

    it('appends a new shifted sparse target even when confirmation comes later', () => {
        const value = runtime({ shift: 2 });
        value.reset([candle(1, 1), candle(2, 2), candle(3, 3)]);
        const patch = value.update(candle(4, 4), true);

        assert.deepEqual(patch.operations.map((item) => ({
            operation: item.operation,
            sourceIndex: item.point?.sourceIndex,
            targetIndex: item.targetIndex,
            time: item.point?.time,
        })), [{
            operation: IndicatorPatchOperation.Append,
            sourceIndex: 3,
            targetIndex: 1,
            time: 2,
        }]);
    });

    it('emits remove operations and resolves forward target time without rebuilding output', () => {
        const nullable = new IndicatorRuntime({
            definition: { ...definition(), processorFactory: () => new NullableProcessor() },
            parameters: {},
        });
        nullable.reset([candle(1, 5)]);
        const removed = nullable.update(candle(1, -1), false);
        assert.deepEqual(removed.operations, [{
            operation: IndicatorPatchOperation.Remove,
            outputId: 'value',
            targetIndex: 0,
        }]);
        assert.deepEqual(nullable.points(), []);

        const future = new IndicatorRuntime({
            definition: { ...definition(), processorFactory: () => new FutureProcessor() },
            parameters: {},
        });
        future.reset([candle(1, 10), candle(2, 20)]);
        assert.equal(future.points()[0].time, null);
        const patch = future.update(candle(3, 30), false);
        const resolved = patch.operations.find((item) => item.targetIndex === 2);
        assert.equal(resolved.operation, IndicatorPatchOperation.Append);
        assert.equal(resolved.point.time, 3);
        assert.equal(resolved.point.sourceIndex, 0);
        assert.equal(patch.operations.some((item) => item.point?.time === null), false);
    });

    it('retains unresolved forward outputs across streaming compaction', () => {
        const future = new IndicatorRuntime({
            definition: { ...definition(), processorFactory: () => new FutureProcessor() },
            parameters: {},
        });
        const snapshot = future.resetStreaming(
            [candle(1, 10), candle(2, 20)],
            candle(3, 30),
        );
        assert.deepEqual(snapshot.map((point) => [point.targetIndex, point.time, point.value]), [
            [2, 3, 10],
            [3, null, 20],
            [4, null, 30],
        ]);
        assert.deepEqual(future.points().map((point) => [point.targetIndex, point.time]), [
            [2, 3],
            [3, null],
            [4, null],
        ]);

        future.compactHistory();
        assert.deepEqual(future.points().map((point) => [point.targetIndex, point.time]), [
            [2, 3],
            [3, null],
            [4, null],
        ]);
        assert.equal(future.update(candle(3, 30), true).operations.length, 0);
        const next = future.update(candle(4, 40), false);
        assert.deepEqual(next.operations.map((item) => ({
            operation: item.operation,
            targetIndex: item.targetIndex,
            time: item.point?.time,
            value: item.point?.value,
        })), [{
            operation: IndicatorPatchOperation.Append,
            targetIndex: 3,
            time: 4,
            value: 20,
        }]);
    });

    it('rolls reset and correction failures back to the previous runtime state', () => {
        const value = new IndicatorRuntime({
            definition: { ...definition(), processorFactory: () => new ThrowProcessor() },
            parameters: {},
            checkpointInterval: 2,
        });
        value.reset([candle(1, 1), candle(2, 2), candle(3, 3)]);
        const inputs = value.inputs();
        const points = value.points();
        const snapshot = value.snapshot();

        assert.throws(
            () => value.reset([candle(10, 4), candle(11, 99)]),
            /deliberate processor failure/,
        );
        assert.deepEqual(value.inputs(), inputs);
        assert.deepEqual(value.points(), points);
        assert.deepEqual(value.snapshot(), snapshot);

        assert.throws(() => value.correct(1, candle(2, 99)), /deliberate processor failure/);
        assert.deepEqual(value.inputs(), inputs);
        assert.deepEqual(value.points(), points);
        assert.deepEqual(value.snapshot(), snapshot);
    });

    it('keeps a live update patch proportional to changed outputs, not history length', () => {
        const value = runtime({ checkpointInterval: 128 });
        value.reset(Array.from({ length: 5_000 }, (_, index) => candle(index + 1, 1)));
        const patch = value.update(candle(5_001, 2), false);
        assert.equal(patch.operations.length, 1);
        assert.equal(patch.operations[0].targetIndex, 5_000);
        assert.equal(value.committedCount, 5_000);
        assert.ok([...value.contributions.values()].every((entry) => !Array.isArray(entry)));
        assert.ok([...value.keysByTarget.values()].every((entry) => typeof entry === 'string'));
    });

    it('releases replay history without losing absolute indexes or the live preview', () => {
        const value = runtime({ checkpointInterval: 128 });
        value.reset(Array.from({ length: 5_000 }, (_, index) => candle(index + 1, 1)));
        value.update(candle(5_001, 2), false);

        const compacted = value.compactHistory();
        assert.deepEqual(compacted, {
            revision: 2,
            committedInputs: 5_000,
            retainedFrom: 5_000,
            hasPreview: true,
            outputPoints: 1,
            checkpoints: 1,
        });
        assert.equal(value.retainedFrom, 5_000);
        assert.deepEqual(value.inputs(), []);
        assert.equal(value.results.length, 0);
        assert.equal(value.contributions.size, 0);
        assert.equal(value.committedOutputs.size, 0);
        assert.equal(value.archivedTimes.length, 5_000);
        assert.deepEqual(value.points(), [{
            outputId: 'value',
            sourceIndex: 5_000,
            targetIndex: 5_000,
            time: 5_001,
            value: 5_002,
        }]);

        const preview = value.update(candle(5_001, 3), false);
        assert.equal(preview.operations[0].operation, IndicatorPatchOperation.Replace);
        assert.equal(preview.operations[0].point.sourceIndex, 5_000);
        assert.equal(preview.operations[0].point.targetIndex, 5_000);
        value.update(candle(5_001, 3), true);
        assert.equal(value.committedCount, 5_001);
        assert.equal(value.inputs().length, 1);
        const corrected = value.correct(5_000, candle(5_001, 6));
        assert.equal(corrected.operations[0].point.sourceIndex, 5_000);
        assert.equal(corrected.operations[0].point.value, 5_006);

        value.compactHistory();
        const next = value.update(candle(5_002, 4), false);
        assert.equal(next.operations[0].operation, IndicatorPatchOperation.Append);
        assert.equal(next.operations[0].point.sourceIndex, 5_001);
        assert.equal(next.operations[0].point.targetIndex, 5_001);
        assert.throws(() => value.correct(5_000, candle(5_001, 30)), /out of range/);

        value.reset([candle(10, 10), candle(11, 11)]);
        assert.equal(value.committedCount, 2);
        assert.equal(value.retainedFrom, 0);
        assert.equal(value.inputs().length, 2);
    });

    it('retains target times and rolls a failed reset back after compaction', () => {
        const shifted = runtime({ shift: 2 });
        shifted.reset([candle(1, 1), candle(2, 2), candle(3, 3), candle(4, 4)]);
        shifted.compactHistory();
        const shiftedPatch = shifted.update(candle(5, 5), false);
        assert.equal(shiftedPatch.operations[0].point.targetIndex, 2);
        assert.equal(shiftedPatch.operations[0].point.time, 3);

        const value = new IndicatorRuntime({
            definition: { ...definition(), processorFactory: () => new ThrowProcessor() },
            parameters: {},
            checkpointInterval: 2,
        });
        value.reset([candle(1, 1), candle(2, 2), candle(3, 3)]);
        value.update(candle(4, 4), false);
        value.compactHistory();
        const points = value.points();
        const snapshot = value.snapshot();

        assert.throws(
            () => value.reset([candle(10, 4), candle(11, 99)]),
            /deliberate processor failure/,
        );
        assert.deepEqual(value.points(), points);
        assert.deepEqual(value.snapshot(), snapshot);
        const preview = value.update(candle(4, 5), false);
        assert.equal(preview.operations[0].point.sourceIndex, 3);
        assert.equal(preview.operations[0].point.value, 11);
    });

    it('seeds a compact streaming runtime with a complete output snapshot', () => {
        const inputs = Array.from({ length: 2_000 }, (_, index) => candle(index + 1, 1));
        const preview = candle(2_001, 5);
        const reference = runtime({ shift: 2, checkpointInterval: 128 });
        reference.reset(inputs);
        reference.update(preview, false);

        const value = runtime({ shift: 2, checkpointInterval: 128 });
        const points = value.resetStreaming(inputs, preview);
        assert.deepEqual(points, reference.points());
        assert.equal(value.revision, 1);
        assert.equal(value.committedCount, 2_000);
        assert.equal(value.retainedFrom, 2_000);
        assert.equal(value.hasPreview, true);
        assert.equal(value.inputs().length, 0);
        assert.equal(value.snapshot().outputPoints, 1);
        assert.equal(points[points.length - 1].targetIndex, 1_998);
        assert.equal(points[points.length - 1].time, 1_999);

        const patch = value.update(candle(2_001, 7), false);
        assert.equal(patch.operations[0].operation, IndicatorPatchOperation.Replace);
        assert.equal(patch.operations[0].point.sourceIndex, 2_000);
        assert.equal(patch.operations[0].point.targetIndex, 1_998);
        assert.throws(() => value.correct(1_999, candle(2_000, 10)), /out of range/);
    });

    it('rolls a failed streaming reset back without copying inputs through call arguments', () => {
        const value = new IndicatorRuntime({
            definition: { ...definition(), processorFactory: () => new ThrowProcessor() },
            parameters: {},
        });
        const retained = Array.from({ length: 5_000 }, (_, index) => candle(index + 1, 1));
        value.resetStreaming(retained, candle(5_001, 2));
        const points = value.points();
        const snapshot = value.snapshot();

        assert.throws(
            () => value.resetStreaming([candle(10_000, 1), candle(10_001, 99)]),
            /deliberate processor failure/,
        );
        assert.deepEqual(value.points(), points);
        assert.deepEqual(value.snapshot(), snapshot);
        assert.equal(value.update(candle(5_001, 3), false).operations[0].point.sourceIndex, 5_000);
    });

    it('owns input snapshots and rejects gaps or ambiguous time changes', () => {
        const value = runtime();
        const source = candle(1, 1);
        value.update(source, true);
        source.value.close = 99;
        assert.equal(value.inputs()[0].value.close, 1);

        value.update(candle(2, 2), false);
        assert.throws(() => value.update(candle(3, 3), false), /must finalize/);
        assert.throws(() => value.correct(0, candle(2, 4)), /remain increasing/);
        assert.throws(() => value.update(candle(0, 1), true), /must finalize/);
    });
});
