import { RingBuffer, type RingBufferCheckpoint } from './ring-buffer.js';

type NumericValue = number | null | undefined;

function numeric(value: NumericValue): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function length(value: number): number {
    if (!Number.isInteger(value) || value < 1)
        throw new RangeError('sschart: rolling window length must be a positive integer');
    return value;
}

export type RollingWindowCheckpoint = RingBufferCheckpoint<number | null>;

/** Finite-only rolling sum; output is null until the complete window is valid. */
export class RollingSum {
    private readonly buffer: RingBuffer<number | null>;
    private sum = 0;
    private invalid = 0;

    constructor(readonly windowLength: number) {
        this.buffer = new RingBuffer(length(windowLength));
    }

    get isFormed(): boolean { return this.buffer.full && this.invalid === 0; }
    get value(): number | null { return this.isFormed ? this.sum : null; }

    push(value: NumericValue): number | null {
        const incoming = numeric(value);
        if (this.buffer.full) this.remove(this.buffer.front() ?? null);
        this.buffer.push(incoming);
        this.add(incoming);
        return this.value;
    }

    preview(value: NumericValue): number | null {
        const incoming = numeric(value);
        const outgoing = this.buffer.full ? (this.buffer.front() ?? null) : null;
        const nextSize = Math.min(this.windowLength, this.buffer.size + 1);
        const nextInvalid = this.invalid
            - (this.buffer.full && outgoing === null ? 1 : 0)
            + (incoming === null ? 1 : 0);
        const nextSum = this.sum
            - (this.buffer.full && outgoing !== null ? outgoing : 0)
            + (incoming ?? 0);
        return nextSize === this.windowLength && nextInvalid === 0 ? nextSum : null;
    }

    reset(): void {
        this.buffer.clear();
        this.sum = 0;
        this.invalid = 0;
    }

    checkpoint(): RollingWindowCheckpoint { return this.buffer.checkpoint(); }

    restore(checkpoint: RollingWindowCheckpoint): void {
        this.reset();
        this.buffer.restore(checkpoint);
        for (const value of checkpoint.values) this.add(value);
    }

    private add(value: number | null): void {
        if (value === null) this.invalid += 1;
        else this.sum += value;
    }

    private remove(value: number | null): void {
        if (value === null) this.invalid -= 1;
        else this.sum -= value;
    }
}

interface ExtremaEntry {
    readonly index: number;
    readonly value: number;
}

class RollingExtrema {
    private readonly buffer: RingBuffer<number | null>;
    private deque: ExtremaEntry[] = [];
    private dequeHead = 0;
    private invalid = 0;
    private nextIndex = 0;

    constructor(readonly windowLength: number, private readonly minimum: boolean) {
        this.buffer = new RingBuffer(length(windowLength));
    }

    get isFormed(): boolean { return this.buffer.full && this.invalid === 0; }
    get value(): number | null {
        return this.isFormed ? (this.deque[this.dequeHead]?.value ?? null) : null;
    }
    get partialValue(): number | null {
        return this.buffer.size > 0 && this.invalid === 0
            ? (this.deque[this.dequeHead]?.value ?? null)
            : null;
    }

    push(value: NumericValue): number | null {
        const incoming = numeric(value);
        if (this.buffer.full && this.buffer.front() === null) this.invalid -= 1;
        this.buffer.push(incoming);
        if (incoming === null) this.invalid += 1;

        const threshold = this.nextIndex - this.windowLength;
        while (this.dequeHead < this.deque.length
            && this.deque[this.dequeHead].index <= threshold) this.dequeHead += 1;
        if (incoming !== null) {
            while (this.deque.length > this.dequeHead) {
                const last = this.deque[this.deque.length - 1].value;
                if (this.minimum ? last < incoming : last > incoming) break;
                this.deque.pop();
            }
            this.deque.push({ index: this.nextIndex, value: incoming });
        }
        this.nextIndex += 1;
        this.compact();
        return this.value;
    }

    preview(value: NumericValue): number | null {
        return this.previewValue(value, true);
    }

    previewPartial(value: NumericValue): number | null {
        return this.previewValue(value, false);
    }

    private previewValue(value: NumericValue, requireFull: boolean): number | null {
        const incoming = numeric(value);
        const outgoing = this.buffer.full ? (this.buffer.front() ?? null) : null;
        const nextSize = Math.min(this.windowLength, this.buffer.size + 1);
        const nextInvalid = this.invalid
            - (this.buffer.full && outgoing === null ? 1 : 0)
            + (incoming === null ? 1 : 0);
        if ((requireFull && nextSize !== this.windowLength) || nextInvalid !== 0) return null;

        const threshold = this.nextIndex - this.windowLength;
        let candidate = this.dequeHead;
        while (candidate < this.deque.length && this.deque[candidate].index <= threshold)
            candidate += 1;
        const current = this.deque[candidate]?.value;
        if (incoming === null) return current ?? null;
        if (current === undefined) return incoming;
        return this.minimum ? Math.min(current, incoming) : Math.max(current, incoming);
    }

    reset(): void {
        this.buffer.clear();
        this.deque = [];
        this.dequeHead = 0;
        this.invalid = 0;
        this.nextIndex = 0;
    }

    checkpoint(): RollingWindowCheckpoint { return this.buffer.checkpoint(); }

    restore(checkpoint: RollingWindowCheckpoint): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || !Array.isArray(checkpoint.values)
            || checkpoint.values.length > this.windowLength) {
            throw new TypeError('sschart: invalid rolling extrema checkpoint');
        }
        this.reset();
        for (const value of checkpoint.values) this.push(value);
    }

    private compact(): void {
        if (this.dequeHead < 1_024 || this.dequeHead * 2 < this.deque.length) return;
        this.deque = this.deque.slice(this.dequeHead);
        this.dequeHead = 0;
    }
}

export class RollingMinimum {
    private readonly extrema: RollingExtrema;
    constructor(readonly windowLength: number) {
        this.extrema = new RollingExtrema(windowLength, true);
    }
    get isFormed(): boolean { return this.extrema.isFormed; }
    get value(): number | null { return this.extrema.value; }
    get partialValue(): number | null { return this.extrema.partialValue; }
    push(value: NumericValue): number | null { return this.extrema.push(value); }
    preview(value: NumericValue): number | null { return this.extrema.preview(value); }
    previewPartial(value: NumericValue): number | null {
        return this.extrema.previewPartial(value);
    }
    reset(): void { this.extrema.reset(); }
    checkpoint(): RollingWindowCheckpoint { return this.extrema.checkpoint(); }
    restore(checkpoint: RollingWindowCheckpoint): void { this.extrema.restore(checkpoint); }
}

export class RollingMaximum {
    private readonly extrema: RollingExtrema;
    constructor(readonly windowLength: number) {
        this.extrema = new RollingExtrema(windowLength, false);
    }
    get isFormed(): boolean { return this.extrema.isFormed; }
    get value(): number | null { return this.extrema.value; }
    get partialValue(): number | null { return this.extrema.partialValue; }
    push(value: NumericValue): number | null { return this.extrema.push(value); }
    preview(value: NumericValue): number | null { return this.extrema.preview(value); }
    previewPartial(value: NumericValue): number | null {
        return this.extrema.previewPartial(value);
    }
    reset(): void { this.extrema.reset(); }
    checkpoint(): RollingWindowCheckpoint { return this.extrema.checkpoint(); }
    restore(checkpoint: RollingWindowCheckpoint): void { this.extrema.restore(checkpoint); }
}

interface VarianceState {
    count: number;
    mean: number;
    m2: number;
}

function addVariance(state: VarianceState, value: number): void {
    state.count += 1;
    const delta = value - state.mean;
    state.mean += delta / state.count;
    state.m2 += delta * (value - state.mean);
}

function removeVariance(state: VarianceState, value: number): void {
    if (state.count <= 1) {
        state.count = 0;
        state.mean = 0;
        state.m2 = 0;
        return;
    }
    const oldCount = state.count;
    const oldMean = state.mean;
    state.count -= 1;
    state.mean = (oldMean * oldCount - value) / state.count;
    state.m2 -= (value - oldMean) * (value - state.mean);
    if (state.m2 < 0 && state.m2 > -Number.EPSILON * 128) state.m2 = 0;
}

export class RollingVariance {
    private readonly buffer: RingBuffer<number | null>;
    private readonly state: VarianceState = { count: 0, mean: 0, m2: 0 };

    constructor(readonly windowLength: number, readonly sample = false) {
        this.buffer = new RingBuffer(length(windowLength));
        if (typeof sample !== 'boolean')
            throw new TypeError('sschart: rolling variance sample option must be boolean');
    }

    get isFormed(): boolean {
        return this.buffer.full && this.state.count === this.windowLength
            && (!this.sample || this.windowLength > 1);
    }
    get value(): number | null {
        if (!this.isFormed) return null;
        const denominator = this.state.count - (this.sample ? 1 : 0);
        return Math.max(0, this.state.m2 / denominator);
    }

    push(value: NumericValue): number | null {
        const incoming = numeric(value);
        if (this.buffer.full) {
            const outgoing = this.buffer.front();
            if (outgoing !== null && outgoing !== undefined) removeVariance(this.state, outgoing);
        }
        this.buffer.push(incoming);
        if (incoming !== null) addVariance(this.state, incoming);
        return this.value;
    }

    preview(value: NumericValue): number | null {
        const incoming = numeric(value);
        const next: VarianceState = { ...this.state };
        if (this.buffer.full) {
            const outgoing = this.buffer.front();
            if (outgoing !== null && outgoing !== undefined) removeVariance(next, outgoing);
        }
        if (incoming !== null) addVariance(next, incoming);
        const nextSize = Math.min(this.windowLength, this.buffer.size + 1);
        if (nextSize !== this.windowLength || next.count !== this.windowLength
            || (this.sample && this.windowLength <= 1)) return null;
        return Math.max(0, next.m2 / (next.count - (this.sample ? 1 : 0)));
    }

    reset(): void {
        this.buffer.clear();
        this.state.count = 0;
        this.state.mean = 0;
        this.state.m2 = 0;
    }

    checkpoint(): RollingWindowCheckpoint { return this.buffer.checkpoint(); }

    restore(checkpoint: RollingWindowCheckpoint): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || !Array.isArray(checkpoint.values)
            || checkpoint.values.length > this.windowLength) {
            throw new TypeError('sschart: invalid rolling variance checkpoint');
        }
        this.reset();
        for (const value of checkpoint.values) this.push(value);
    }
}

export class RollingStandardDeviation {
    private readonly variance: RollingVariance;
    constructor(readonly windowLength: number, readonly sample = false) {
        this.variance = new RollingVariance(windowLength, sample);
    }
    get isFormed(): boolean { return this.variance.isFormed; }
    get value(): number | null {
        const value = this.variance.value;
        return value === null ? null : Math.sqrt(value);
    }
    push(value: NumericValue): number | null {
        const variance = this.variance.push(value);
        return variance === null ? null : Math.sqrt(variance);
    }
    preview(value: NumericValue): number | null {
        const variance = this.variance.preview(value);
        return variance === null ? null : Math.sqrt(variance);
    }
    reset(): void { this.variance.reset(); }
    checkpoint(): RollingWindowCheckpoint { return this.variance.checkpoint(); }
    restore(checkpoint: RollingWindowCheckpoint): void { this.variance.restore(checkpoint); }
}

/** Mean absolute deviation from the mean of a complete finite rolling window. */
export class RollingMeanDeviation {
    private readonly buffer: RingBuffer<number | null>;
    private sum = 0;
    private invalid = 0;

    constructor(readonly windowLength: number) {
        this.buffer = new RingBuffer(length(windowLength));
    }

    get isFormed(): boolean { return this.buffer.full && this.invalid === 0; }
    get value(): number | null {
        return this.isFormed
            ? this.deviation(this.sum, (index) => this.buffer.at(index) ?? null)
            : null;
    }

    push(value: NumericValue): number | null {
        const incoming = numeric(value);
        if (this.buffer.full) this.remove(this.buffer.front() ?? null);
        this.buffer.push(incoming);
        this.add(incoming);
        return this.value;
    }

    preview(value: NumericValue): number | null {
        const incoming = numeric(value);
        const evicts = this.buffer.full;
        const outgoing = evicts ? (this.buffer.front() ?? null) : null;
        const nextSize = Math.min(this.windowLength, this.buffer.size + 1);
        const nextInvalid = this.invalid
            - (evicts && outgoing === null ? 1 : 0)
            + (incoming === null ? 1 : 0);
        if (nextSize !== this.windowLength || nextInvalid !== 0) return null;

        const nextSum = this.sum
            - (evicts && outgoing !== null ? outgoing : 0)
            + (incoming ?? 0);
        const retained = evicts ? this.windowLength - 1 : this.buffer.size;
        return this.deviation(nextSum, (index) => (
            index < retained
                ? (this.buffer.at(index + (evicts ? 1 : 0)) ?? null)
                : incoming
        ));
    }

    reset(): void {
        this.buffer.clear();
        this.sum = 0;
        this.invalid = 0;
    }

    checkpoint(): RollingWindowCheckpoint { return this.buffer.checkpoint(); }

    restore(checkpoint: RollingWindowCheckpoint): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || !Array.isArray(checkpoint.values)
            || checkpoint.values.length > this.windowLength
            || checkpoint.values.some((value) => (
                value !== null && (typeof value !== 'number' || !Number.isFinite(value))
            ))) {
            throw new TypeError('sschart: invalid rolling mean deviation checkpoint');
        }
        this.reset();
        for (const value of checkpoint.values) this.push(value);
    }

    private deviation(sum: number, valueAt: (index: number) => number | null): number {
        const mean = sum / this.windowLength;
        let absolute = 0;
        for (let index = 0; index < this.windowLength; index += 1)
            absolute += Math.abs((valueAt(index) as number) - mean);
        return absolute / this.windowLength;
    }

    private add(value: number | null): void {
        if (value === null) this.invalid += 1;
        else this.sum += value;
    }

    private remove(value: number | null): void {
        if (value === null) this.invalid -= 1;
        else this.sum -= value;
    }
}

/** Median of a complete finite rolling window, backed by FIFO and sorted views. */
export class RollingMedian {
    private readonly buffer: RingBuffer<number | null>;
    private sorted: number[] = [];

    constructor(readonly windowLength: number) {
        this.buffer = new RingBuffer(length(windowLength));
    }

    get isFormed(): boolean {
        return this.buffer.full && this.sorted.length === this.windowLength;
    }
    get value(): number | null { return this.isFormed ? this.median(this.sorted) : null; }

    push(value: NumericValue): number | null {
        const incoming = numeric(value);
        if (this.buffer.full) {
            const outgoing = this.buffer.front() ?? null;
            if (outgoing !== null) this.remove(outgoing, this.sorted);
        }
        this.buffer.push(incoming);
        if (incoming !== null) this.insert(incoming, this.sorted);
        return this.value;
    }

    preview(value: NumericValue): number | null {
        const incoming = numeric(value);
        const evicts = this.buffer.full;
        const outgoing = evicts ? (this.buffer.front() ?? null) : null;
        const nextSize = Math.min(this.windowLength, this.buffer.size + 1);
        const nextValid = this.sorted.length
            - (evicts && outgoing !== null ? 1 : 0)
            + (incoming === null ? 0 : 1);
        if (nextSize !== this.windowLength || nextValid !== this.windowLength) return null;

        const sorted = this.sorted.slice();
        if (evicts && outgoing !== null) this.remove(outgoing, sorted);
        this.insert(incoming as number, sorted);
        return this.median(sorted);
    }

    reset(): void {
        this.buffer.clear();
        this.sorted = [];
    }

    checkpoint(): RollingWindowCheckpoint { return this.buffer.checkpoint(); }

    restore(checkpoint: RollingWindowCheckpoint): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || !Array.isArray(checkpoint.values)
            || checkpoint.values.length > this.windowLength
            || checkpoint.values.some((value) => (
                value !== null && (typeof value !== 'number' || !Number.isFinite(value))
            ))) {
            throw new TypeError('sschart: invalid rolling median checkpoint');
        }
        this.reset();
        for (const value of checkpoint.values) this.push(value);
    }

    private lowerBound(value: number, values: readonly number[]): number {
        let low = 0;
        let high = values.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if ((values[middle] as number) < value) low = middle + 1;
            else high = middle;
        }
        return low;
    }

    private insert(value: number, values: number[]): void {
        values.splice(this.lowerBound(value, values), 0, value);
    }

    private remove(value: number, values: number[]): void {
        const index = this.lowerBound(value, values);
        if (values[index] !== value)
            throw new TypeError('sschart: inconsistent rolling median state');
        values.splice(index, 1);
    }

    private median(values: readonly number[]): number {
        const middle = values.length >>> 1;
        return (values.length & 1) === 1
            ? (values[middle] as number)
            : ((values[middle - 1] as number) + (values[middle] as number)) / 2;
    }
}
