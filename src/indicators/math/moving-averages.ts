import { RingBuffer, type RingBufferCheckpoint } from './ring-buffer.js';
import { RollingSum, type RollingWindowCheckpoint } from './rolling-window.js';

type NumericValue = number | null | undefined;

function numeric(value: NumericValue): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function length(value: number): number {
    if (!Number.isInteger(value) || value < 1)
        throw new RangeError('sschart: moving average length must be a positive integer');
    return value;
}

export class SimpleMovingAverage {
    private readonly sum: RollingSum;
    constructor(readonly windowLength: number) {
        this.sum = new RollingSum(length(windowLength));
    }
    get isFormed(): boolean { return this.sum.isFormed; }
    get value(): number | null {
        const value = this.sum.value;
        return value === null ? null : value / this.windowLength;
    }
    push(value: NumericValue): number | null {
        const sum = this.sum.push(value);
        return sum === null ? null : sum / this.windowLength;
    }
    preview(value: NumericValue): number | null {
        const sum = this.sum.preview(value);
        return sum === null ? null : sum / this.windowLength;
    }
    reset(): void { this.sum.reset(); }
    checkpoint(): RollingWindowCheckpoint { return this.sum.checkpoint(); }
    restore(checkpoint: RollingWindowCheckpoint): void { this.sum.restore(checkpoint); }
}

/**
 * StockSharp SMA value semantics: finite samples fill a bounded window, while
 * the partial sum is divided by the full configured length from the first sample.
 * Invalid samples emit null and do not advance the window.
 */
export class PartialSeedSimpleMovingAverage {
    private readonly buffer: RingBuffer<number>;
    private sum = 0;

    constructor(readonly windowLength: number) {
        this.buffer = new RingBuffer(length(windowLength));
    }

    get isFormed(): boolean { return this.buffer.full; }
    get value(): number | null {
        return this.buffer.size === 0 ? null : this.sum / this.windowLength;
    }

    push(value: NumericValue): number | null {
        const incoming = numeric(value);
        if (incoming === null) return null;
        if (this.buffer.full) this.sum -= this.buffer.front()!;
        this.buffer.push(incoming);
        this.sum += incoming;
        return this.sum / this.windowLength;
    }

    preview(value: NumericValue): number | null {
        const incoming = numeric(value);
        if (incoming === null) return null;
        const sum = this.sum - (this.buffer.full ? this.buffer.front()! : 0) + incoming;
        return sum / this.windowLength;
    }

    reset(): void {
        this.buffer.clear();
        this.sum = 0;
    }

    checkpoint(): RingBufferCheckpoint<number> { return this.buffer.checkpoint(); }

    restore(checkpoint: RingBufferCheckpoint<number>): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || !Array.isArray(checkpoint.values)
            || checkpoint.values.length > this.windowLength
            || checkpoint.values.some((value) => numeric(value) === null)) {
            throw new TypeError('sschart: invalid partial-seed simple average checkpoint');
        }
        this.buffer.restore(checkpoint);
        this.sum = checkpoint.values.reduce((sum, value) => sum + value, 0);
    }
}

export interface PartialSeedExponentialMovingAverageCheckpoint {
    readonly count: number;
    readonly seedSum: number;
    readonly formed: boolean;
    readonly previous: number;
}

/** StockSharp EMA values, including partial `seedSum / length` warm-up output. */
export class PartialSeedExponentialMovingAverage {
    private count = 0;
    private seedSum = 0;
    private formed = false;
    private previous = 0;
    private readonly multiplier: number;

    constructor(readonly windowLength: number) {
        length(windowLength);
        this.multiplier = 2 / (windowLength + 1);
    }

    get isFormed(): boolean { return this.formed; }
    get value(): number | null { return this.count === 0 ? null : this.previous; }

    push(value: NumericValue): number | null {
        const next = this.evaluate(value);
        if (next.value === null) return null;
        this.count = next.count;
        this.seedSum = next.seedSum;
        this.formed = next.formed;
        this.previous = next.previous;
        return next.value;
    }

    preview(value: NumericValue): number | null { return this.evaluate(value).value; }

    reset(): void {
        this.count = 0;
        this.seedSum = 0;
        this.formed = false;
        this.previous = 0;
    }

    checkpoint(): PartialSeedExponentialMovingAverageCheckpoint {
        return Object.freeze({
            count: this.count,
            seedSum: this.seedSum,
            formed: this.formed,
            previous: this.previous,
        });
    }

    restore(state: PartialSeedExponentialMovingAverageCheckpoint): void {
        if (state === null || typeof state !== 'object'
            || !Number.isInteger(state.count) || state.count < 0
            || state.count > this.windowLength
            || numeric(state.seedSum) === null
            || typeof state.formed !== 'boolean'
            || state.formed !== (state.count === this.windowLength)
            || numeric(state.previous) === null) {
            throw new TypeError('sschart: invalid partial-seed exponential average checkpoint');
        }
        this.count = state.count;
        this.seedSum = state.seedSum;
        this.formed = state.formed;
        this.previous = state.previous;
    }

    private evaluate(value: NumericValue): PartialSeedExponentialMovingAverageCheckpoint & {
        readonly value: number | null;
    } {
        const incoming = numeric(value);
        if (incoming === null) {
            return {
                count: this.count,
                seedSum: this.seedSum,
                formed: this.formed,
                previous: this.previous,
                value: null,
            };
        }
        if (!this.formed) {
            const count = this.count + 1;
            const seedSum = this.seedSum + incoming;
            const previous = seedSum / this.windowLength;
            return {
                count,
                seedSum,
                formed: count === this.windowLength,
                previous,
                value: previous,
            };
        }
        const previous = (incoming - this.previous) * this.multiplier + this.previous;
        return {
            count: this.count,
            seedSum: this.seedSum,
            formed: true,
            previous,
            value: previous,
        };
    }
}

/** Linear WMA with weights 1..length from oldest to newest in O(1). */
export class LinearWeightedMovingAverage {
    private readonly buffer: RingBuffer<number | null>;
    private sum = 0;
    private weightedSum = 0;
    private invalid = 0;
    private readonly divisor: number;

    constructor(readonly windowLength: number) {
        this.buffer = new RingBuffer(length(windowLength));
        this.divisor = windowLength * (windowLength + 1) / 2;
    }

    get isFormed(): boolean { return this.buffer.full && this.invalid === 0; }
    get value(): number | null {
        return this.isFormed ? this.weightedSum / this.divisor : null;
    }

    push(value: NumericValue): number | null {
        const incoming = numeric(value);
        if (this.buffer.full) {
            const outgoing = this.buffer.front() ?? null;
            this.weightedSum -= this.sum;
            if (outgoing === null) this.invalid -= 1;
            else this.sum -= outgoing;
            this.buffer.push(incoming);
            if (incoming === null) this.invalid += 1;
            else {
                this.sum += incoming;
                this.weightedSum += incoming * this.windowLength;
            }
            return this.value;
        }

        const weight = this.buffer.size + 1;
        this.buffer.push(incoming);
        if (incoming === null) this.invalid += 1;
        else {
            this.sum += incoming;
            this.weightedSum += incoming * weight;
        }
        return this.value;
    }

    preview(value: NumericValue): number | null {
        const incoming = numeric(value);
        const outgoing = this.buffer.full ? (this.buffer.front() ?? null) : null;
        const nextSize = Math.min(this.windowLength, this.buffer.size + 1);
        const nextInvalid = this.invalid
            - (this.buffer.full && outgoing === null ? 1 : 0)
            + (incoming === null ? 1 : 0);
        if (nextSize !== this.windowLength || nextInvalid !== 0) return null;
        const nextWeighted = this.buffer.full
            ? this.weightedSum - this.sum + (incoming ?? 0) * this.windowLength
            : this.weightedSum + (incoming ?? 0) * nextSize;
        return nextWeighted / this.divisor;
    }

    reset(): void {
        this.buffer.clear();
        this.sum = 0;
        this.weightedSum = 0;
        this.invalid = 0;
    }

    checkpoint(): RollingWindowCheckpoint { return this.buffer.checkpoint(); }

    restore(checkpoint: RollingWindowCheckpoint): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || !Array.isArray(checkpoint.values)
            || checkpoint.values.length > this.windowLength
            || checkpoint.values.some((value) => value !== null && numeric(value) === null)) {
            throw new TypeError('sschart: invalid linear weighted average checkpoint');
        }
        this.reset();
        for (const value of checkpoint.values) this.push(value);
    }
}

/** Fixed newest-to-oldest weights over a bounded window with isolated previews. */
export class FixedWeightedMovingAverage {
    private readonly buffer: RingBuffer<number | null>;
    readonly weights: readonly number[];
    private readonly divisor: number;

    constructor(weights: readonly number[]) {
        if (!Array.isArray(weights) || weights.length === 0
            || weights.some((weight) => typeof weight !== 'number' || !Number.isFinite(weight))) {
            throw new TypeError('sschart: fixed moving average weights must be finite and non-empty');
        }
        const divisor = weights.reduce((sum, weight) => sum + weight, 0);
        if (!Number.isFinite(divisor) || divisor === 0)
            throw new RangeError('sschart: fixed moving average weight sum must be finite and non-zero');
        this.weights = Object.freeze([...weights]);
        this.divisor = divisor;
        this.buffer = new RingBuffer(weights.length);
    }

    get windowLength(): number { return this.weights.length; }
    get isFormed(): boolean { return this.value !== null; }
    get value(): number | null {
        if (!this.buffer.full) return null;
        let weighted = 0;
        for (let index = 0; index < this.windowLength; index += 1) {
            const value = this.buffer.at(this.windowLength - 1 - index) ?? null;
            if (value === null) return null;
            weighted += value * this.weights[index];
        }
        return weighted / this.divisor;
    }

    push(value: NumericValue): number | null {
        this.buffer.push(numeric(value));
        return this.value;
    }

    preview(value: NumericValue): number | null {
        const incoming = numeric(value);
        if (incoming === null || this.buffer.size + (this.buffer.full ? 0 : 1) < this.windowLength)
            return null;
        let weighted = incoming * this.weights[0];
        for (let index = 1; index < this.windowLength; index += 1) {
            const existing = this.buffer.at(this.buffer.size - index) ?? null;
            if (existing === null) return null;
            weighted += existing * this.weights[index];
        }
        return weighted / this.divisor;
    }

    reset(): void { this.buffer.clear(); }
    checkpoint(): RollingWindowCheckpoint { return this.buffer.checkpoint(); }
    restore(checkpoint: RollingWindowCheckpoint): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || !Array.isArray(checkpoint.values)
            || checkpoint.values.length > this.windowLength
            || checkpoint.values.some((value) => value !== null && numeric(value) === null)) {
            throw new TypeError('sschart: invalid fixed weighted average checkpoint');
        }
        this.buffer.restore(checkpoint);
    }
}

export interface SmoothedMovingAverageCheckpoint {
    readonly count: number;
    readonly seedSum: number;
    readonly previous: number;
}

/**
 * StockSharp SMMA: partial seed sum divided by the full length, followed by
 * Wilder recursion. Invalid samples return null without advancing state.
 */
export class SmoothedMovingAverage {
    private count = 0;
    private seedSum = 0;
    private previous = 0;

    constructor(readonly windowLength: number) { length(windowLength); }

    get isFormed(): boolean { return this.count >= this.windowLength; }
    get value(): number | null { return this.count > 0 ? this.previous : null; }

    push(value: NumericValue): number | null {
        const result = this.evaluate(value);
        if (result.value === null) return null;
        this.count = result.count;
        this.seedSum = result.seedSum;
        this.previous = result.previous;
        return result.value;
    }

    preview(value: NumericValue): number | null { return this.evaluate(value).value; }

    reset(): void {
        this.count = 0;
        this.seedSum = 0;
        this.previous = 0;
    }

    checkpoint(): SmoothedMovingAverageCheckpoint {
        return Object.freeze({
            count: this.count,
            seedSum: this.seedSum,
            previous: this.previous,
        });
    }

    restore(checkpoint: SmoothedMovingAverageCheckpoint): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || !Number.isInteger(checkpoint.count)
            || checkpoint.count < 0 || checkpoint.count > this.windowLength
            || typeof checkpoint.seedSum !== 'number' || !Number.isFinite(checkpoint.seedSum)
            || typeof checkpoint.previous !== 'number' || !Number.isFinite(checkpoint.previous)) {
            throw new TypeError('sschart: invalid smoothed moving average checkpoint');
        }
        this.count = checkpoint.count;
        this.seedSum = checkpoint.seedSum;
        this.previous = checkpoint.previous;
    }

    private evaluate(value: NumericValue): SmoothedMovingAverageCheckpoint & {
        readonly value: number | null;
    } {
        const incoming = numeric(value);
        if (incoming === null) {
            return {
                count: this.count,
                seedSum: this.seedSum,
                previous: this.previous,
                value: null,
            };
        }
        if (this.count < this.windowLength) {
            const count = this.count + 1;
            const seedSum = this.seedSum + incoming;
            const previous = seedSum / this.windowLength;
            return { count, seedSum, previous, value: previous };
        }
        const previous = (
            this.previous * (this.windowLength - 1) + incoming
        ) / this.windowLength;
        return {
            count: this.count,
            seedSum: this.seedSum,
            previous,
            value: previous,
        };
    }
}

export interface ExpandingWilderMovingAverageCheckpoint {
    readonly count: number;
    readonly previous: number;
}

/** Wilder average with a growing warm-up divisor capped at the configured length. */
export class ExpandingWilderMovingAverage {
    private count = 0;
    private previous = 0;

    constructor(readonly windowLength: number) { length(windowLength); }

    get isFormed(): boolean { return this.count >= this.windowLength; }
    get value(): number | null { return this.count > 0 ? this.previous : null; }

    push(value: NumericValue): number | null {
        const result = this.evaluate(value);
        if (result.value === null) return null;
        this.count = result.count;
        this.previous = result.previous;
        return result.value;
    }

    preview(value: NumericValue): number | null { return this.evaluate(value).value; }

    reset(): void {
        this.count = 0;
        this.previous = 0;
    }

    checkpoint(): ExpandingWilderMovingAverageCheckpoint {
        return Object.freeze({ count: this.count, previous: this.previous });
    }

    restore(checkpoint: ExpandingWilderMovingAverageCheckpoint): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || !Number.isInteger(checkpoint.count)
            || checkpoint.count < 0 || checkpoint.count > this.windowLength
            || typeof checkpoint.previous !== 'number' || !Number.isFinite(checkpoint.previous)) {
            throw new TypeError('sschart: invalid expanding Wilder checkpoint');
        }
        this.count = checkpoint.count;
        this.previous = checkpoint.previous;
    }

    private evaluate(value: NumericValue): ExpandingWilderMovingAverageCheckpoint & {
        readonly value: number | null;
    } {
        const incoming = numeric(value);
        if (incoming === null) {
            return { count: this.count, previous: this.previous, value: null };
        }
        const count = Math.min(this.windowLength, this.count + 1);
        const previous = (this.previous * (count - 1) + incoming) / count;
        return { count, previous, value: previous };
    }
}

export interface SeededMovingAverageCheckpoint {
    readonly count: number;
    readonly seedSum: number;
    readonly seedValid: boolean;
    readonly formed: boolean;
    readonly previous: number;
    readonly poisoned: boolean;
}

abstract class SeededMovingAverage {
    private count = 0;
    private seedSum = 0;
    private seedValid = true;
    private formed = false;
    private previous = 0;
    private poisoned = false;

    constructor(readonly windowLength: number, private readonly poisonAfterGap: boolean) {
        length(windowLength);
    }

    get isFormed(): boolean { return this.formed && !this.poisoned; }
    get value(): number | null { return this.isFormed ? this.previous : null; }

    push(value: NumericValue): number | null {
        const result = this.evaluate(value);
        this.count = result.count;
        this.seedSum = result.seedSum;
        this.seedValid = result.seedValid;
        this.formed = result.formed;
        this.previous = result.previous;
        this.poisoned = result.poisoned;
        return result.value;
    }

    preview(value: NumericValue): number | null { return this.evaluate(value).value; }

    reset(): void {
        this.count = 0;
        this.seedSum = 0;
        this.seedValid = true;
        this.formed = false;
        this.previous = 0;
        this.poisoned = false;
    }

    checkpoint(): SeededMovingAverageCheckpoint {
        return Object.freeze({
            count: this.count,
            seedSum: this.seedSum,
            seedValid: this.seedValid,
            formed: this.formed,
            previous: this.previous,
            poisoned: this.poisoned,
        });
    }

    restore(checkpoint: SeededMovingAverageCheckpoint): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || !Number.isInteger(checkpoint.count) || checkpoint.count < 0
            || typeof checkpoint.seedSum !== 'number' || !Number.isFinite(checkpoint.seedSum)
            || typeof checkpoint.seedValid !== 'boolean'
            || typeof checkpoint.formed !== 'boolean'
            || typeof checkpoint.previous !== 'number' || !Number.isFinite(checkpoint.previous)
            || typeof checkpoint.poisoned !== 'boolean') {
            throw new TypeError('sschart: invalid moving average checkpoint');
        }
        this.count = checkpoint.count;
        this.seedSum = checkpoint.seedSum;
        this.seedValid = checkpoint.seedValid;
        this.formed = checkpoint.formed;
        this.previous = checkpoint.previous;
        this.poisoned = checkpoint.poisoned;
    }

    protected abstract next(previous: number, value: number): number;

    private evaluate(value: NumericValue): SeededMovingAverageCheckpoint & { readonly value: number | null } {
        const incoming = numeric(value);
        let count = this.count;
        let seedSum = this.seedSum;
        let seedValid = this.seedValid;
        let formed = this.formed;
        let previous = this.previous;
        let poisoned = this.poisoned;
        let output: number | null = null;

        if (poisoned) {
            count += 1;
        } else if (!formed) {
            count += 1;
            if (incoming === null) seedValid = false;
            else seedSum += incoming;
            if (count >= this.windowLength) {
                if (seedValid) {
                    previous = seedSum / this.windowLength;
                    formed = true;
                    output = previous;
                } else {
                    poisoned = true;
                }
            }
        } else if (incoming === null) {
            if (this.poisonAfterGap) poisoned = true;
        } else {
            previous = this.next(previous, incoming);
            output = previous;
        }

        return { count, seedSum, seedValid, formed, previous, poisoned, value: output };
    }
}

export class ExponentialMovingAverage extends SeededMovingAverage {
    private readonly multiplier: number;
    constructor(windowLength: number) {
        super(windowLength, false);
        this.multiplier = 2 / (windowLength + 1);
    }
    protected next(previous: number, value: number): number {
        return (value - previous) * this.multiplier + previous;
    }
}

export class WilderMovingAverage extends SeededMovingAverage {
    constructor(windowLength: number) { super(windowLength, true); }
    protected next(previous: number, value: number): number {
        return (previous * (this.windowLength - 1) + value) / this.windowLength;
    }
}
