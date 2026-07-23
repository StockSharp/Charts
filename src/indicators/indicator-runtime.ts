import type { Time } from '../core/chart-api.js';
import type {
    IIndicatorProcessor,
    IndicatorDefinition,
    IndicatorOutputMetadata,
    IndicatorOutputDefinition,
    IndicatorOutputValue,
    IndicatorParameters,
    IndicatorProcessResult,
} from './indicator-definition.js';
import { resolveIndicatorOutputs } from './indicator-definition.js';
import {
    normalizeIndicatorOutputMetadata,
    sameIndicatorOutputMetadata,
} from './output-metadata.js';

export interface IndicatorRuntimeInput<TInput> {
    readonly time: Time;
    readonly value: TInput;
}

export interface IndicatorRuntimePoint {
    readonly outputId: string;
    readonly sourceIndex: number;
    readonly targetIndex: number;
    /** Null only while a forward-shifted target bar does not exist yet. */
    readonly time: Time | null;
    readonly value: number;
    /** Optional flat fields forwarded to the rendered data point. */
    readonly metadata?: IndicatorOutputMetadata;
}

export const IndicatorPatchOperation = Object.freeze({
    Append: 'append',
    Replace: 'replace',
    Remove: 'remove',
} as const);
export type IndicatorPatchOperation = typeof IndicatorPatchOperation[keyof typeof IndicatorPatchOperation];

export interface IndicatorRuntimePatchOperation {
    readonly operation: IndicatorPatchOperation;
    readonly outputId: string;
    readonly targetIndex: number;
    readonly point?: IndicatorRuntimePoint;
}

export const IndicatorRuntimePatchKind = Object.freeze({
    Reset: 'reset',
    Update: 'update',
    Correction: 'correction',
} as const);
export type IndicatorRuntimePatchKind = typeof IndicatorRuntimePatchKind[keyof typeof IndicatorRuntimePatchKind];

export interface IndicatorRuntimePatch {
    readonly revision: number;
    readonly kind: IndicatorRuntimePatchKind;
    readonly fromIndex: number;
    readonly operations: readonly IndicatorRuntimePatchOperation[];
}

export interface IndicatorRuntimeSnapshot {
    readonly revision: number;
    readonly committedInputs: number;
    /** First committed input whose value is still retained for correction replay. */
    readonly retainedFrom: number;
    readonly hasPreview: boolean;
    readonly outputPoints: number;
    readonly checkpoints: number;
}

export interface IndicatorRuntimeOptions<
    TInput,
    TParameters extends IndicatorParameters,
> {
    readonly definition: IndicatorDefinition<TInput, TParameters>;
    readonly parameters: TParameters;
    readonly checkpointInterval?: number;
    /** Owns a stable input snapshot for later correction replay. */
    readonly snapshotInput?: (value: TInput) => Readonly<TInput>;
}

interface StoredInput<TInput> {
    readonly time: Time;
    readonly value: Readonly<TInput>;
}

interface StoredOutput {
    readonly outputId: string;
    readonly sourceIndex: number;
    readonly targetIndex: number;
    readonly value: number | null;
    readonly metadata?: IndicatorOutputMetadata;
}

interface RuntimeCheckpoint {
    readonly position: number;
    readonly processor: unknown;
}

interface RuntimeState<TInput> {
    readonly basePosition: number;
    readonly archivedTimes: readonly Time[];
    readonly processor: unknown;
    readonly inputs: readonly StoredInput<TInput>[];
    readonly results: readonly (readonly StoredOutput[])[];
    readonly contributions: ReadonlyMap<string, StoredOutput | StoredOutput[]>;
    readonly committedOutputs: ReadonlyMap<string, StoredOutput>;
    readonly previewOutputs: ReadonlyMap<string, StoredOutput>;
    readonly previewRemovals: ReadonlySet<string>;
    readonly keysByTarget: ReadonlyMap<number, string | Set<string>>;
    readonly checkpoints: ReadonlyMap<number, RuntimeCheckpoint>;
    readonly previewInput: StoredInput<TInput> | null;
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < 1)
        throw new RangeError(`sschart: indicator runtime ${name} must be a positive integer`);
    return value;
}

function time(value: unknown): Time {
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new TypeError('sschart: indicator runtime input time must be finite');
    return value;
}

function defaultSnapshot<TInput>(value: TInput): Readonly<TInput> {
    if (Array.isArray(value)) return Object.freeze([...value]) as unknown as Readonly<TInput>;
    if (value !== null && typeof value === 'object')
        return Object.freeze({ ...value }) as Readonly<TInput>;
    return value as Readonly<TInput>;
}

function outputKey(outputId: string, targetIndex: number): string {
    return `${outputId}\u0000${targetIndex}`;
}

function samePoint(left: IndicatorRuntimePoint | null, right: IndicatorRuntimePoint | null): boolean {
    return left === right || (left !== null && right !== null
        && left.outputId === right.outputId
        && left.sourceIndex === right.sourceIndex
        && left.targetIndex === right.targetIndex
        && left.time === right.time
        && left.value === right.value
        && sameIndicatorOutputMetadata(left.metadata, right.metadata));
}

/** Stateful, patch-producing runtime for one indicator definition. */
export class IndicatorRuntime<
    TInput,
    TParameters extends IndicatorParameters,
> {
    private readonly processor: IIndicatorProcessor<TInput>;
    private readonly outputsValue: readonly IndicatorOutputDefinition[];
    private readonly checkpointInterval: number;
    private readonly snapshotInput: (value: TInput) => Readonly<TInput>;
    private readonly outputOrder = new Map<string, number>();
    private readonly inputsValue: StoredInput<TInput>[] = [];
    private readonly results: Array<readonly StoredOutput[]> = [];
    private readonly contributions = new Map<string, StoredOutput | StoredOutput[]>();
    private readonly committedOutputs = new Map<string, StoredOutput>();
    private readonly previewOutputs = new Map<string, StoredOutput>();
    private readonly previewRemovals = new Set<string>();
    private readonly keysByTarget = new Map<number, string | Set<string>>();
    private readonly checkpoints = new Map<number, RuntimeCheckpoint>();
    private readonly archivedTimes: Time[] = [];
    private basePositionValue = 0;
    private previewInput: StoredInput<TInput> | null = null;
    private revisionValue = 0;

    constructor(readonly options: IndicatorRuntimeOptions<TInput, TParameters>) {
        if (options === null || typeof options !== 'object')
            throw new TypeError('sschart: indicator runtime options are required');
        if (options.definition === null || typeof options.definition !== 'object')
            throw new TypeError('sschart: indicator runtime definition is required');
        const outputs = resolveIndicatorOutputs(options.definition, options.parameters);
        if (!Array.isArray(outputs) || outputs.length === 0)
            throw new TypeError('sschart: indicator runtime definition outputs must not be empty');
        this.outputsValue = Object.freeze(Array.from(outputs));
        this.outputsValue.forEach((output, index) => {
            if (output === null || typeof output !== 'object'
                || typeof output.id !== 'string' || output.id.trim().length === 0) {
                throw new TypeError(`sschart: invalid indicator runtime output at index ${index}`);
            }
            if (this.outputOrder.has(output.id))
                throw new TypeError(`sschart: duplicate indicator runtime output '${output.id}'`);
            this.outputOrder.set(output.id, index);
        });
        if (typeof options.definition.processorFactory !== 'function')
            throw new TypeError('sschart: indicator runtime definition requires processorFactory');
        this.checkpointInterval = positiveInteger(
            options.checkpointInterval,
            256,
            'checkpointInterval',
        );
        this.snapshotInput = options.snapshotInput ?? defaultSnapshot;
        if (typeof this.snapshotInput !== 'function')
            throw new TypeError('sschart: indicator runtime snapshotInput must be a function');
        this.processor = options.definition.processorFactory(options.parameters);
        this.validateProcessor(this.processor);
        this.checkpoints.set(0, this.runtimeCheckpoint());
    }

    get revision(): number { return this.revisionValue; }
    get outputs(): readonly IndicatorOutputDefinition[] { return this.outputsValue; }
    get committedCount(): number { return this.basePositionValue + this.inputsValue.length; }
    get retainedFrom(): number { return this.basePositionValue; }
    get hasPreview(): boolean { return this.previewInput !== null; }

    snapshot(): IndicatorRuntimeSnapshot {
        return Object.freeze({
            revision: this.revisionValue,
            committedInputs: this.committedCount,
            retainedFrom: this.basePositionValue,
            hasPreview: this.previewInput !== null,
            outputPoints: this.currentPoints().length,
            checkpoints: this.checkpoints.size,
        });
    }

    /** Returns only input values retained for correction replay. */
    inputs(): readonly IndicatorRuntimeInput<Readonly<TInput>>[] {
        return Object.freeze(this.inputsValue.map((input) => Object.freeze({ ...input })));
    }

    points(outputId?: string): readonly IndicatorRuntimePoint[] {
        if (outputId !== undefined && !this.outputOrder.has(outputId))
            throw new RangeError(`sschart: unknown indicator runtime output '${outputId}'`);
        const values = this.currentPoints().filter((point) => (
            outputId === undefined || point.outputId === outputId
        ));
        return Object.freeze(values);
    }

    /**
     * Releases committed input values, output history and replay checkpoints.
     * The processor state, absolute indexes, target times and current preview
     * remain valid. The consumer must already own all previously emitted points;
     * corrections before `retainedFrom` and a historical patch-only reset are no
     * longer possible until the runtime is seeded again with `reset()`.
     */
    compactHistory(): IndicatorRuntimeSnapshot {
        const committedCount = this.committedCount;
        if (this.processor.position !== committedCount)
            throw new Error('sschart: indicator runtime processor position is inconsistent');
        if (this.archivedTimes.length !== this.basePositionValue)
            throw new Error('sschart: indicator runtime time history is inconsistent');

        for (const input of this.inputsValue) this.archivedTimes.push(input.time);

        // A compact consumer already owns every drawable historical point, but
        // forward-shifted outputs whose target candle does not exist yet still
        // belong to the runtime. Collapse their contribution stacks to the
        // current value: inputs before the new base can no longer be corrected.
        const pending = new Map<string, StoredOutput>();
        for (const [key, contribution] of this.contributions) {
            const current = Array.isArray(contribution)
                ? contribution[contribution.length - 1]
                : contribution;
            if (current !== undefined && current.targetIndex >= committedCount)
                pending.set(key, current);
        }

        this.basePositionValue = committedCount;
        this.inputsValue.length = 0;
        this.results.length = 0;
        this.contributions.clear();
        this.committedOutputs.clear();
        this.keysByTarget.clear();
        for (const [key, output] of pending) {
            this.contributions.set(key, output);
            if (output.value !== null) this.committedOutputs.set(key, output);
            this.rememberKey(key, output.targetIndex);
        }
        for (const [key, output] of this.previewOutputs)
            this.rememberKey(key, output.targetIndex);
        for (const key of this.previewRemovals) {
            const separator = key.lastIndexOf('\u0000');
            this.rememberKey(key, Number(key.slice(separator + 1)));
        }
        this.checkpoints.clear();
        this.checkpoints.set(committedCount, this.runtimeCheckpoint());
        return this.snapshot();
    }

    /**
     * Rebuilds the processor and returns one full output snapshot while retaining
     * only streaming state. This is the bounded-memory initialization path for a
     * consumer that immediately owns the returned points via a full `setData`.
     */
    resetStreaming(
        inputs: readonly IndicatorRuntimeInput<TInput>[] = [],
        preview?: IndicatorRuntimeInput<TInput>,
    ): readonly IndicatorRuntimePoint[] {
        if (!Array.isArray(inputs))
            throw new TypeError('sschart: indicator runtime reset inputs must be an array');
        const previous = this.captureState();
        const outputs = new Map<string, Map<number, StoredOutput>>();
        for (const outputId of this.outputOrder.keys()) outputs.set(outputId, new Map());

        try {
            this.clearState();
            let previousTime: Time | null = null;
            for (const rawInput of inputs) {
                const input = this.normalizeInput(rawInput);
                if (previousTime !== null && input.time <= previousTime) {
                    throw new RangeError(
                        'sschart: indicator runtime input times must be strictly increasing',
                    );
                }
                const sourceIndex = this.processor.position;
                const result = this.normalizeResult(this.processor.process({
                    index: sourceIndex,
                    time: input.time,
                    value: input.value as TInput,
                    isFinal: true,
                }), sourceIndex, sourceIndex + 1);
                this.applyStreamingResult(outputs, result);
                this.archivedTimes.push(input.time);
                previousTime = input.time;
            }

            this.basePositionValue = this.processor.position;
            this.checkpoints.clear();
            this.checkpoints.set(this.basePositionValue, this.runtimeCheckpoint());

            // Keep only committed outputs that still wait for a target time.
            // The complete drawable snapshot is returned to the caller below.
            for (const output of outputs.values()) {
                for (const stored of output.values()) {
                    if (stored.targetIndex < this.basePositionValue) continue;
                    const key = outputKey(stored.outputId, stored.targetIndex);
                    this.contributions.set(key, stored);
                    this.committedOutputs.set(key, stored);
                    this.rememberKey(key, stored.targetIndex);
                }
            }

            if (preview !== undefined) {
                const input = this.normalizeInput(preview);
                if (previousTime !== null && input.time <= previousTime) {
                    throw new RangeError(
                        'sschart: indicator runtime preview time must follow committed inputs',
                    );
                }
                const sourceIndex = this.processor.position;
                const result = this.normalizeResult(this.processor.process({
                    index: sourceIndex,
                    time: input.time,
                    value: input.value as TInput,
                    isFinal: false,
                }), sourceIndex, sourceIndex);
                this.setPreview(input, result);
                this.applyStreamingResult(outputs, result);
            }

            const points: IndicatorRuntimePoint[] = [];
            for (const outputId of this.outputOrder.keys()) {
                const outputPoints: IndicatorRuntimePoint[] = [];
                let previousTarget = -1;
                let isSorted = true;
                for (const stored of outputs.get(outputId)?.values() ?? []) {
                    const point = this.materializeStored(stored);
                    if (point === null) continue;
                    if (point.targetIndex < previousTarget) isSorted = false;
                    previousTarget = point.targetIndex;
                    outputPoints.push(point);
                }
                if (!isSorted) outputPoints.sort((left, right) => (
                    left.targetIndex - right.targetIndex || left.sourceIndex - right.sourceIndex
                ));
                for (const point of outputPoints) points.push(point);
            }
            this.revisionValue += 1;
            return Object.freeze(points);
        } catch (error) {
            try { this.restoreState(previous); } catch { /* preserve the reset failure */ }
            throw error;
        }
    }

    reset(inputs: readonly IndicatorRuntimeInput<TInput>[] = []): IndicatorRuntimePatch {
        if (!Array.isArray(inputs))
            throw new TypeError('sschart: indicator runtime reset inputs must be an array');
        const normalized = inputs.map((input) => this.normalizeInput(input));
        this.assertIncreasing(normalized);
        const before = this.captureAll();
        const previous = this.captureState();
        try {
            this.clearState();
            for (const input of normalized) this.commitInput(input);
        } catch (error) {
            try { this.restoreState(previous); } catch { /* preserve the reset failure */ }
            throw error;
        }

        const after = this.captureAll();
        return this.patch(
            IndicatorRuntimePatchKind.Reset,
            0,
            this.diff(before, after, true),
        );
    }

    update(input: IndicatorRuntimeInput<TInput>, isFinal = false): IndicatorRuntimePatch {
        if (typeof isFinal !== 'boolean')
            throw new TypeError('sschart: indicator runtime isFinal must be boolean');
        const normalized = this.normalizeInput(input);
        if (this.previewInput !== null) {
            if (normalized.time !== this.previewInput.time) {
                throw new RangeError(
                    'sschart: indicator runtime must finalize the current preview before a new time',
                );
            }
            return this.processTail(normalized, isFinal);
        }

        const lastIndex = this.committedCount - 1;
        const last = this.inputAt(lastIndex);
        const lastTime = last?.time ?? this.timeAt(lastIndex);
        if (lastTime !== null) {
            if (normalized.time < lastTime)
                throw new RangeError('sschart: historical indicator changes require correct()');
            if (normalized.time === lastTime) {
                if (last === undefined) {
                    throw new RangeError(
                        'sschart: indicator tail is no longer retained; seed the runtime with reset()',
                    );
                }
                if (isFinal) return this.correctNormalized(lastIndex, normalized);
                return this.reopenLast(normalized);
            }
        }
        return this.processTail(normalized, isFinal);
    }

    /**
     * Removes the current non-final input and restores the committed output
     * visible underneath it. This is the inverse of update(input, false) and
     * is intentionally patch-producing so a streaming renderer can rewind a
     * derived tail without rebuilding the complete indicator history.
     */
    discardPreview(): IndicatorRuntimePatch {
        const before = this.captureAll();
        const fromIndex = this.committedCount;
        if (this.previewInput !== null) this.clearPreview();
        const after = this.captureAll();
        return this.patch(
            IndicatorRuntimePatchKind.Correction,
            fromIndex,
            this.diff(before, after, false),
        );
    }

    /**
     * Removes exactly one retained committed input and restores processor state
     * from its nearest checkpoint. Call discardPreview() first when a preview is
     * installed. Compacted inputs deliberately cannot be reopened: consumers
     * that need a rewindable tail must retain that tail instead of compacting it.
     */
    truncateTail(): IndicatorRuntimePatch {
        if (this.previewInput !== null) {
            throw new Error(
                'sschart: discard the indicator runtime preview before truncating its tail',
            );
        }
        if (this.committedCount <= this.basePositionValue) {
            throw new RangeError(
                'sschart: indicator runtime tail is no longer retained; seed the runtime with reset()',
            );
        }

        const before = this.captureAll();
        const previous = this.captureState();
        const fromIndex = this.committedCount - 1;
        try {
            this.inputsValue.pop();
            this.replayFrom(fromIndex);
        } catch (error) {
            try { this.restoreState(previous); } catch { /* preserve the rewind failure */ }
            throw error;
        }
        const after = this.captureAll();
        return this.patch(
            IndicatorRuntimePatchKind.Correction,
            fromIndex,
            this.diff(before, after, false),
        );
    }

    correct(index: number, input: IndicatorRuntimeInput<TInput>): IndicatorRuntimePatch {
        return this.correctNormalized(index, this.normalizeInput(input));
    }

    private correctNormalized(index: number, input: StoredInput<TInput>): IndicatorRuntimePatch {
        if (!Number.isInteger(index) || index < this.basePositionValue || index >= this.committedCount)
            throw new RangeError('sschart: indicator correction index is out of range');
        const previousTime = this.timeAt(index - 1);
        if (previousTime !== null && input.time <= previousTime)
            throw new RangeError('sschart: corrected indicator times must remain increasing');
        const nextTime = this.timeAt(index + 1);
        if (index + 1 < this.committedCount && nextTime !== null && input.time >= nextTime)
            throw new RangeError('sschart: corrected indicator times must remain increasing');
        if (index + 1 === this.committedCount && this.previewInput !== null
            && input.time >= this.previewInput.time) {
            throw new RangeError('sschart: corrected indicator times must remain increasing');
        }

        const before = this.captureAll();
        const preview = this.previewInput;
        const retainedIndex = index - this.basePositionValue;
        const previous = this.inputsValue[retainedIndex];
        this.inputsValue[retainedIndex] = input;
        try {
            this.replayFrom(index);
            if (preview !== null) this.installPreview(preview);
        } catch (error) {
            this.inputsValue[retainedIndex] = previous;
            try {
                this.replayFrom(index);
                if (preview !== null) this.installPreview(preview);
            } catch { /* preserve the correction failure */ }
            throw error;
        }
        const after = this.captureAll();
        return this.patch(
            IndicatorRuntimePatchKind.Correction,
            index,
            this.diff(before, after, false),
        );
    }

    private reopenLast(input: StoredInput<TInput>): IndicatorRuntimePatch {
        const index = this.committedCount - 1;
        const before = this.captureAll();
        this.inputsValue.pop();
        this.replayFrom(index);
        this.installPreview(input);
        const after = this.captureAll();
        return this.patch(
            IndicatorRuntimePatchKind.Correction,
            index,
            this.diff(before, after, false),
        );
    }

    private processTail(input: StoredInput<TInput>, isFinal: boolean): IndicatorRuntimePatch {
        const sourceIndex = this.committedCount;
        const result = this.normalizeResult(this.processor.process({
            index: sourceIndex,
            time: input.time,
            value: input.value as TInput,
            isFinal,
        }), sourceIndex, sourceIndex + (isFinal ? 1 : 0));

        const affected = new Set<string>([
            ...this.previewOutputs.keys(),
            ...this.previewRemovals,
            ...result.values.map((value) => outputKey(value.outputId, value.targetIndex)),
            ...this.keysAtTarget(sourceIndex),
        ]);
        const before = this.capture(affected);
        if (isFinal) {
            this.clearPreview();
            this.inputsValue.push(input);
            this.results.push(this.applyCommittedResult(result));
            this.maybeCheckpoint();
        } else {
            this.setPreview(input, result);
        }
        const after = this.capture(affected);
        return this.patch(
            IndicatorRuntimePatchKind.Update,
            sourceIndex,
            this.diff(before, after, true),
        );
    }

    private commitInput(input: StoredInput<TInput>): void {
        const sourceIndex = this.committedCount;
        const result = this.normalizeResult(this.processor.process({
            index: sourceIndex,
            time: input.time,
            value: input.value as TInput,
            isFinal: true,
        }), sourceIndex, sourceIndex + 1);
        this.inputsValue.push(input);
        this.results.push(this.applyCommittedResult(result));
        this.maybeCheckpoint();
    }

    private installPreview(input: StoredInput<TInput>): void {
        const sourceIndex = this.committedCount;
        const result = this.normalizeResult(this.processor.process({
            index: sourceIndex,
            time: input.time,
            value: input.value as TInput,
            isFinal: false,
        }), sourceIndex, sourceIndex);
        this.setPreview(input, result);
    }

    private setPreview(input: StoredInput<TInput>, result: IndicatorProcessResult): void {
        this.clearPreview();
        this.previewInput = input;
        for (const value of result.values) {
            const stored = this.storedOutput(result.sourceIndex, value);
            const key = outputKey(stored.outputId, stored.targetIndex);
            this.rememberKey(key, stored.targetIndex);
            if (stored.value === null) this.previewRemovals.add(key);
            else this.previewOutputs.set(key, stored);
        }
    }

    private clearPreview(): void {
        const previousKeys = new Set([
            ...this.previewOutputs.keys(),
            ...this.previewRemovals,
        ]);
        this.previewInput = null;
        this.previewOutputs.clear();
        this.previewRemovals.clear();
        for (const key of previousKeys) {
            if (!this.contributions.has(key)) this.forgetKey(key);
        }
    }

    private replayFrom(index: number): void {
        this.clearPreview();
        let checkpointPosition = this.basePositionValue;
        for (const position of this.checkpoints.keys()) {
            if (position <= index && position >= checkpointPosition) checkpointPosition = position;
        }
        const checkpoint = this.checkpoints.get(checkpointPosition);
        if (checkpoint === undefined)
            throw new Error('sschart: indicator runtime checkpoint is missing');
        this.processor.restore(checkpoint.processor);
        this.removeResultsFrom(checkpointPosition);
        for (const position of [...this.checkpoints.keys()]) {
            if (position > checkpointPosition) this.checkpoints.delete(position);
        }
        for (let sourceIndex = checkpointPosition; sourceIndex < this.committedCount; sourceIndex += 1) {
            const input = this.inputsValue[sourceIndex - this.basePositionValue];
            const result = this.normalizeResult(this.processor.process({
                index: sourceIndex,
                time: input.time,
                value: input.value as TInput,
                isFinal: true,
            }), sourceIndex, sourceIndex + 1);
            this.results.push(this.applyCommittedResult(result));
            this.maybeCheckpoint();
        }
    }

    private removeResultsFrom(position: number): void {
        const retainedPosition = position - this.basePositionValue;
        if (retainedPosition < 0 || retainedPosition > this.results.length)
            throw new RangeError('sschart: indicator replay position is no longer retained');
        for (let resultIndex = this.results.length - 1; resultIndex >= retainedPosition; resultIndex -= 1) {
            const sourceIndex = this.basePositionValue + resultIndex;
            const values = this.results[resultIndex];
            for (let valueIndex = values.length - 1; valueIndex >= 0; valueIndex -= 1) {
                const value = values[valueIndex];
                const key = outputKey(value.outputId, value.targetIndex);
                const contribution = this.contributions.get(key);
                let removed: StoredOutput | undefined;
                let current: StoredOutput | undefined;
                if (Array.isArray(contribution)) {
                    removed = contribution.pop();
                    if (contribution.length === 1) {
                        current = contribution[0];
                        this.contributions.set(key, current);
                    } else {
                        current = contribution[contribution.length - 1];
                    }
                } else if (contribution !== undefined) {
                    removed = contribution;
                    this.contributions.delete(key);
                }
                if (removed?.sourceIndex !== sourceIndex)
                    throw new Error('sschart: indicator runtime contribution stack is inconsistent');
                if (current === undefined) {
                    this.committedOutputs.delete(key);
                    if (!this.previewOutputs.has(key) && !this.previewRemovals.has(key))
                        this.forgetKey(key);
                } else {
                    if (current.value === null) this.committedOutputs.delete(key);
                    else this.committedOutputs.set(key, current);
                }
            }
        }
        this.results.length = retainedPosition;
    }

    private applyCommittedResult(result: IndicatorProcessResult): readonly StoredOutput[] {
        const storedValues = result.values.map((value) => this.storedOutput(result.sourceIndex, value));
        for (const stored of storedValues) {
            const key = outputKey(stored.outputId, stored.targetIndex);
            const contribution = this.contributions.get(key);
            if (contribution === undefined) this.contributions.set(key, stored);
            else if (Array.isArray(contribution)) contribution.push(stored);
            else this.contributions.set(key, [contribution, stored]);
            this.rememberKey(key, stored.targetIndex);
            if (stored.value === null) this.committedOutputs.delete(key);
            else this.committedOutputs.set(key, stored);
        }
        return storedValues;
    }

    private applyStreamingResult(
        outputs: Map<string, Map<number, StoredOutput>>,
        result: IndicatorProcessResult,
    ): void {
        for (const value of result.values) {
            const output = outputs.get(value.outputId);
            if (output === undefined)
                throw new RangeError(`sschart: unknown indicator runtime output '${value.outputId}'`);
            if (value.value === null) output.delete(value.targetIndex);
            else output.set(value.targetIndex, this.storedOutput(result.sourceIndex, value));
        }
    }

    private storedOutput(sourceIndex: number, value: IndicatorOutputValue): StoredOutput {
        return {
            outputId: value.outputId,
            sourceIndex,
            targetIndex: value.targetIndex,
            value: value.value,
            ...(value.metadata === undefined ? {} : { metadata: value.metadata }),
        };
    }

    private rememberKey(key: string, targetIndex: number): void {
        const keys = this.keysByTarget.get(targetIndex);
        if (keys === undefined) this.keysByTarget.set(targetIndex, key);
        else if (typeof keys === 'string') {
            if (keys !== key) this.keysByTarget.set(targetIndex, new Set([keys, key]));
        } else keys.add(key);
    }

    private forgetKey(key: string): void {
        const separator = key.lastIndexOf('\u0000');
        const targetIndex = Number(key.slice(separator + 1));
        const keys = this.keysByTarget.get(targetIndex);
        if (typeof keys === 'string') {
            if (keys === key) this.keysByTarget.delete(targetIndex);
            return;
        }
        keys?.delete(key);
        if (keys?.size === 1) this.keysByTarget.set(targetIndex, keys.values().next().value as string);
        else if (keys?.size === 0) this.keysByTarget.delete(targetIndex);
    }

    private keysAtTarget(targetIndex: number): readonly string[] {
        const keys = this.keysByTarget.get(targetIndex);
        if (keys === undefined) return [];
        return typeof keys === 'string' ? [keys] : Array.from(keys);
    }

    private maybeCheckpoint(): void {
        const position = this.processor.position;
        if (position % this.checkpointInterval !== 0) return;
        this.checkpoints.set(position, this.runtimeCheckpoint());
    }

    private runtimeCheckpoint(): RuntimeCheckpoint {
        return Object.freeze({
            position: this.processor.position,
            processor: this.processor.checkpoint(),
        });
    }

    private normalizeInput(input: IndicatorRuntimeInput<TInput>): StoredInput<TInput> {
        if (input === null || typeof input !== 'object')
            throw new TypeError('sschart: indicator runtime input must be an object');
        const inputTime = time(input.time);
        const value = this.snapshotInput(input.value);
        return { time: inputTime, value };
    }

    private assertIncreasing(inputs: readonly StoredInput<TInput>[]): void {
        for (let index = 1; index < inputs.length; index += 1) {
            if (inputs[index].time <= inputs[index - 1].time)
                throw new RangeError('sschart: indicator runtime input times must be strictly increasing');
        }
    }

    private validateProcessor(value: IIndicatorProcessor<TInput>): void {
        if (value === null || typeof value !== 'object'
            || typeof value.reset !== 'function'
            || typeof value.process !== 'function'
            || typeof value.checkpoint !== 'function'
            || typeof value.restore !== 'function'
            || value.position !== 0) {
            throw new TypeError(
                'sschart: indicator processor must start at position 0 and implement the processor contract',
            );
        }
    }

    private normalizeResult(
        result: IndicatorProcessResult,
        sourceIndex: number,
        expectedPosition: number,
    ): IndicatorProcessResult {
        if (result === null || typeof result !== 'object'
            || result.sourceIndex !== sourceIndex || !Array.isArray(result.values)
            || typeof result.isFormed !== 'boolean') {
            throw new TypeError('sschart: indicator processor returned an invalid runtime result');
        }
        const seen: Array<{ outputId: string; targetIndex: number }> = [];
        const values: IndicatorOutputValue[] = [];
        for (const value of result.values) {
            if (value === null || typeof value !== 'object')
                throw new TypeError('sschart: indicator processor returned an invalid output value');
            if (!this.outputOrder.has(value.outputId))
                throw new RangeError(`sschart: indicator result references unknown output '${value.outputId}'`);
            if (value.value !== null
                && (typeof value.value !== 'number' || !Number.isFinite(value.value))) {
                throw new TypeError(`sschart: indicator result '${value.outputId}' must be finite or null`);
            }
            if (!Number.isInteger(value.targetIndex) || value.targetIndex < 0)
                throw new RangeError(`sschart: indicator result '${value.outputId}' targetIndex is invalid`);
            if (seen.some((item) => (
                item.outputId === value.outputId && item.targetIndex === value.targetIndex
            ))) {
                throw new TypeError(`sschart: duplicate indicator result '${value.outputId}' at ${value.targetIndex}`);
            }
            seen.push(value);
            const metadata = normalizeIndicatorOutputMetadata(
                value.metadata,
                `indicator result '${value.outputId}' metadata`,
            );
            values.push(Object.freeze({
                outputId: value.outputId,
                value: value.value,
                targetIndex: value.targetIndex,
                ...(metadata === undefined ? {} : { metadata }),
            }));
        }
        if (this.processor.position !== expectedPosition) {
            throw new Error('sschart: indicator processor position is inconsistent');
        }
        return Object.freeze({
            sourceIndex,
            isFormed: result.isFormed,
            values: Object.freeze(values),
        });
    }

    private captureState(): RuntimeState<TInput> {
        return {
            basePosition: this.basePositionValue,
            archivedTimes: [...this.archivedTimes],
            processor: this.processor.checkpoint(),
            inputs: [...this.inputsValue],
            results: [...this.results],
            contributions: new Map([...this.contributions].map(([key, value]) => [
                key,
                Array.isArray(value) ? [...value] : value,
            ])),
            committedOutputs: new Map(this.committedOutputs),
            previewOutputs: new Map(this.previewOutputs),
            previewRemovals: new Set(this.previewRemovals),
            keysByTarget: new Map([...this.keysByTarget].map(([targetIndex, value]) => [
                targetIndex,
                typeof value === 'string' ? value : new Set(value),
            ])),
            checkpoints: new Map(this.checkpoints),
            previewInput: this.previewInput,
        };
    }

    private restoreState(state: RuntimeState<TInput>): void {
        this.processor.restore(state.processor);
        this.basePositionValue = state.basePosition;
        this.archivedTimes.length = 0;
        for (const value of state.archivedTimes) this.archivedTimes.push(value);
        this.inputsValue.length = 0;
        for (const value of state.inputs) this.inputsValue.push(value);
        this.results.length = 0;
        for (const value of state.results) this.results.push(value);
        this.restoreMap(this.contributions, state.contributions);
        this.restoreMap(this.committedOutputs, state.committedOutputs);
        this.restoreMap(this.previewOutputs, state.previewOutputs);
        this.previewRemovals.clear();
        for (const key of state.previewRemovals) this.previewRemovals.add(key);
        this.restoreMap(this.keysByTarget, state.keysByTarget);
        this.restoreMap(this.checkpoints, state.checkpoints);
        this.previewInput = state.previewInput;
    }

    private restoreMap<TKey, TValue>(
        target: Map<TKey, TValue>,
        source: ReadonlyMap<TKey, TValue>,
    ): void {
        target.clear();
        for (const [key, value] of source) target.set(key, value);
    }

    private clearState(): void {
        this.processor.reset();
        this.basePositionValue = 0;
        this.archivedTimes.length = 0;
        this.inputsValue.length = 0;
        this.results.length = 0;
        this.contributions.clear();
        this.committedOutputs.clear();
        this.clearPreview();
        this.keysByTarget.clear();
        this.checkpoints.clear();
        this.checkpoints.set(0, this.runtimeCheckpoint());
    }

    private capture(keys: Iterable<string>): Map<string, IndicatorRuntimePoint | null> {
        const result = new Map<string, IndicatorRuntimePoint | null>();
        for (const key of keys) result.set(key, this.materialize(key));
        return result;
    }

    private captureAll(): Map<string, IndicatorRuntimePoint | null> {
        return this.capture(new Set([
            ...this.committedOutputs.keys(),
            ...this.previewOutputs.keys(),
            ...this.previewRemovals,
        ]));
    }

    private materialize(key: string): IndicatorRuntimePoint | null {
        if (this.previewRemovals.has(key)) return null;
        const stored = this.previewOutputs.get(key) ?? this.committedOutputs.get(key);
        return stored === undefined ? null : this.materializeStored(stored);
    }

    private materializeStored(stored: StoredOutput): IndicatorRuntimePoint | null {
        if (stored.value === null) return null;
        return Object.freeze({
            outputId: stored.outputId,
            sourceIndex: stored.sourceIndex,
            targetIndex: stored.targetIndex,
            time: this.timeAt(stored.targetIndex),
            value: stored.value,
            ...(stored.metadata === undefined ? {} : { metadata: stored.metadata }),
        });
    }

    private timeAt(index: number): Time | null {
        if (index < 0) return null;
        if (index < this.basePositionValue) return this.archivedTimes[index] ?? null;
        const input = this.inputsValue[index - this.basePositionValue];
        if (input !== undefined) return input.time;
        if (index === this.committedCount && this.previewInput !== null)
            return this.previewInput.time;
        return null;
    }

    private inputAt(index: number): StoredInput<TInput> | undefined {
        if (index < this.basePositionValue) return undefined;
        return this.inputsValue[index - this.basePositionValue];
    }

    private currentPoints(): IndicatorRuntimePoint[] {
        const keys = new Set([
            ...this.committedOutputs.keys(),
            ...this.previewOutputs.keys(),
            ...this.previewRemovals,
        ]);
        const points: IndicatorRuntimePoint[] = [];
        for (const key of keys) {
            const point = this.materialize(key);
            if (point !== null) points.push(point);
        }
        points.sort((left, right) => (
            (this.outputOrder.get(left.outputId) ?? Number.MAX_SAFE_INTEGER)
                - (this.outputOrder.get(right.outputId) ?? Number.MAX_SAFE_INTEGER)
            || left.targetIndex - right.targetIndex
            || left.sourceIndex - right.sourceIndex
        ));
        return points;
    }

    private diff(
        before: ReadonlyMap<string, IndicatorRuntimePoint | null>,
        after: ReadonlyMap<string, IndicatorRuntimePoint | null>,
        allowAppend: boolean,
    ): IndicatorRuntimePatchOperation[] {
        const keys = new Set([...before.keys(), ...after.keys()]);
        const operations: IndicatorRuntimePatchOperation[] = [];
        for (const key of keys) {
            const previous = before.get(key) ?? null;
            const next = after.get(key) ?? null;
            if (samePoint(previous, next)) continue;
            if (next === null) {
                if (previous !== null && previous.time !== null) {
                    operations.push(Object.freeze({
                        operation: IndicatorPatchOperation.Remove,
                        outputId: previous.outputId,
                        targetIndex: previous.targetIndex,
                    }));
                }
                continue;
            }
            // Future targets are internal pending state, not drawable chart
            // points. Their first public operation is append when time resolves.
            if (next.time === null) continue;
            const firstDrawable = previous === null || previous.time === null;
            operations.push(Object.freeze({
                operation: firstDrawable && allowAppend
                    ? IndicatorPatchOperation.Append
                    : IndicatorPatchOperation.Replace,
                outputId: next.outputId,
                targetIndex: next.targetIndex,
                point: next,
            }));
        }
        operations.sort((left, right) => (
            (this.outputOrder.get(left.outputId) ?? Number.MAX_SAFE_INTEGER)
                - (this.outputOrder.get(right.outputId) ?? Number.MAX_SAFE_INTEGER)
            || (left.operation === IndicatorPatchOperation.Remove
                && right.operation === IndicatorPatchOperation.Remove
                ? right.targetIndex - left.targetIndex
                : left.targetIndex - right.targetIndex)
            || left.operation.localeCompare(right.operation)
        ));
        return operations;
    }

    private patch(
        kind: IndicatorRuntimePatchKind,
        fromIndex: number,
        operations: IndicatorRuntimePatchOperation[],
    ): IndicatorRuntimePatch {
        this.revisionValue += 1;
        return Object.freeze({
            revision: this.revisionValue,
            kind,
            fromIndex,
            operations: Object.freeze(operations),
        });
    }
}
