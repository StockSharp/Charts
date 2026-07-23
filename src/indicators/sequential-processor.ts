import type {
    IIndicatorProcessor,
    IndicatorOutputMetadata,
    IndicatorOutputValue,
    IndicatorProcessInput,
    IndicatorProcessResult,
} from './indicator-definition.js';
import { normalizeIndicatorOutputMetadata } from './output-metadata.js';

export interface IndicatorCalculationResult {
    readonly isFormed: boolean;
    readonly values: readonly IndicatorOutputValue[];
}

export interface SequentialIndicatorCheckpoint<TState> {
    readonly version: 1;
    readonly position: number;
    readonly state: TState;
}

function outputId(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0 || value !== value.trim())
        throw new TypeError(`sschart: ${name} must be a non-empty trimmed string`);
    return value;
}

/**
 * Base for processors that consume one logical input at a time. Derived classes
 * receive an explicit commit flag and must use non-mutating kernel previews when
 * it is false.
 */
export abstract class SequentialIndicatorProcessor<TInput, TState>
implements IIndicatorProcessor<TInput> {
    private positionValue = 0;
    private readonly outputIds: ReadonlySet<string>;

    protected constructor(outputIds: readonly string[]) {
        if (!Array.isArray(outputIds) || outputIds.length === 0)
            throw new TypeError('sschart: sequential indicator outputs must not be empty');
        const normalized = outputIds.map((id, index) => outputId(id, `outputIds[${index}]`));
        if (new Set(normalized).size !== normalized.length)
            throw new TypeError('sschart: sequential indicator outputs contain duplicates');
        this.outputIds = new Set(normalized);
    }

    get position(): number { return this.positionValue; }

    process(input: IndicatorProcessInput<TInput>): IndicatorProcessResult {
        this.validateInput(input);
        const calculation = this.calculate(input, input.isFinal);
        const result = this.normalizeResult(calculation, input.index);
        if (input.isFinal) this.positionValue += 1;
        return result;
    }

    reset(): void {
        this.resetState();
        this.positionValue = 0;
    }

    checkpoint(): SequentialIndicatorCheckpoint<TState> {
        return Object.freeze({
            version: 1 as const,
            position: this.positionValue,
            state: this.captureState(),
        });
    }

    restore(checkpoint: SequentialIndicatorCheckpoint<TState>): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || checkpoint.version !== 1
            || !Number.isInteger(checkpoint.position) || checkpoint.position < 0) {
            throw new TypeError('sschart: invalid sequential indicator checkpoint');
        }
        const previousPosition = this.positionValue;
        const previousState = this.captureState();
        try {
            this.restoreState(checkpoint.state);
            this.positionValue = checkpoint.position;
        } catch (error) {
            try { this.restoreState(previousState); } catch { /* preserve the original failure */ }
            this.positionValue = previousPosition;
            throw error;
        }
    }

    protected output(
        outputIdValue: string,
        value: number | null,
        targetIndex = this.positionValue,
        metadata?: IndicatorOutputMetadata,
    ): IndicatorOutputValue {
        return metadata === undefined
            ? { outputId: outputIdValue, value, targetIndex }
            : { outputId: outputIdValue, value, targetIndex, metadata };
    }

    protected abstract calculate(
        input: IndicatorProcessInput<TInput>,
        commit: boolean,
    ): IndicatorCalculationResult;
    protected abstract resetState(): void;
    protected abstract captureState(): TState;
    protected abstract restoreState(state: TState): void;

    private validateInput(input: IndicatorProcessInput<TInput>): void {
        if (input === null || typeof input !== 'object')
            throw new TypeError('sschart: indicator process input must be an object');
        if (!Number.isInteger(input.index) || input.index < 0)
            throw new RangeError('sschart: indicator process index must be a non-negative integer');
        if (input.index !== this.positionValue) {
            throw new RangeError(
                `sschart: indicator expected input index ${this.positionValue}, received ${input.index}`,
            );
        }
        if (typeof input.time !== 'number' || !Number.isFinite(input.time))
            throw new TypeError('sschart: indicator process time must be finite');
        if (typeof input.isFinal !== 'boolean')
            throw new TypeError('sschart: indicator process isFinal must be boolean');
    }

    private normalizeResult(
        value: IndicatorCalculationResult,
        sourceIndex: number,
    ): IndicatorProcessResult {
        if (value === null || typeof value !== 'object')
            throw new TypeError('sschart: indicator processor returned an invalid result');
        if (typeof value.isFormed !== 'boolean')
            throw new TypeError('sschart: indicator result isFormed must be boolean');
        if (!Array.isArray(value.values))
            throw new TypeError('sschart: indicator result values must be an array');

        const values: IndicatorOutputValue[] = [];
        value.values.forEach((item, index) => {
            if (item === null || typeof item !== 'object')
                throw new TypeError(`sschart: indicator result values[${index}] must be an object`);
            const id = outputId(item.outputId, `result values[${index}].outputId`);
            if (!this.outputIds.has(id))
                throw new RangeError(`sschart: indicator result references unknown output '${id}'`);
            if (item.value !== null
                && (typeof item.value !== 'number' || !Number.isFinite(item.value))) {
                throw new TypeError(`sschart: indicator result '${id}' must be finite or null`);
            }
            if (!Number.isInteger(item.targetIndex) || item.targetIndex < 0)
                throw new RangeError(`sschart: indicator result '${id}' targetIndex must be non-negative`);
            if (values.some((existing) => (
                existing.outputId === id && existing.targetIndex === item.targetIndex
            ))) {
                throw new TypeError(`sschart: duplicate indicator result '${id}' at ${item.targetIndex}`);
            }
            const metadata = normalizeIndicatorOutputMetadata(
                item.metadata,
                `indicator result '${id}' metadata`,
            );
            values.push(Object.freeze({
                outputId: id,
                value: item.value,
                targetIndex: item.targetIndex,
                ...(metadata === undefined ? {} : { metadata }),
            }));
        });
        return Object.freeze({
            sourceIndex,
            isFormed: value.isFormed,
            values: Object.freeze(values),
        });
    }
}
