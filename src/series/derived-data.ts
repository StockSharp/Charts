export interface OhlcData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface DerivedOhlcData {
    readonly data: readonly OhlcData[];
    readonly boxSize: number;
}

/** A replacement of one contiguous derived tail. */
export interface DerivedOhlcPatch {
    readonly fromIndex: number;
    readonly removed: number;
    readonly data: readonly OhlcData[];
}

function finite(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function evenSpan(source: ReadonlyArray<{ time: number }>, count: number): number[] {
    if (count <= 0) return [];
    const first = source[0].time;
    const last = source[source.length - 1].time;
    const times = new Array<number>(count);
    if (count === 1 || !(last > first)) {
        for (let index = 0; index < count; index++) times[index] = first + index;
        return times;
    }
    for (let index = 0; index < count; index++)
        times[index] = first + index / (count - 1) * (last - first);
    return times;
}

function sourceStep(source: readonly OhlcData[]): number {
    for (let index = 1; index < source.length; index++) {
        const delta = source[index].time - source[index - 1].time;
        if (Number.isFinite(delta) && delta > 0) return delta;
    }
    return 1;
}

function renkoBox(source: readonly OhlcData[], requested?: number): number {
    if (finite(requested, 0) > 0) return requested as number;
    let low = Infinity;
    let high = -Infinity;
    for (const point of source) {
        low = Math.min(low, point.close);
        high = Math.max(high, point.close);
    }
    return ((Number.isFinite(high - low) && high > low) ? high - low : 1) / 40;
}

function pointFigureBox(source: readonly OhlcData[], requested?: number): number {
    if (finite(requested, 0) > 0) return requested as number;
    let low = Infinity;
    let high = -Infinity;
    for (const point of source) {
        low = Math.min(low, point.low);
        high = Math.max(high, point.high);
    }
    return ((Number.isFinite(high - low) && high > low) ? high - low : 1) / 50;
}

function samePoint(left: OhlcData, right: OhlcData): boolean {
    return left.time === right.time
        && left.open === right.open
        && left.high === right.high
        && left.low === right.low
        && left.close === right.close;
}

function changedTail(
    data: readonly OhlcData[],
    fromIndex: number,
    previous: readonly OhlcData[],
): DerivedOhlcPatch | null {
    const next = data.slice(fromIndex);
    if (next.length === previous.length
        && next.every((point, index) => samePoint(point, previous[index]))) {
        return null;
    }
    return Object.freeze({
        fromIndex,
        removed: previous.length,
        data: Object.freeze(next),
    });
}

interface RenkoCheckpoint {
    readonly base: number | null;
    readonly dataLength: number;
}

/**
 * Stateful close-based Renko transform. setData/reset chooses one box size;
 * append and replace-last then touch only the derived tail. The last source
 * candle is transactional, so replacing it never contaminates committed bricks.
 */
export class RenkoDataRuntime {
    private readonly requestedBoxSize?: number;
    private readonly dataValue: OhlcData[] = [];
    private initialTimes: number[] = [];
    private nextStep = 1;
    private base: number | null = null;
    private previewTime: number | null = null;
    private previewCheckpoint: RenkoCheckpoint = { base: null, dataLength: 0 };
    private boxSizeValue = 0;

    constructor(requestedBoxSize?: number) {
        this.requestedBoxSize = requestedBoxSize;
    }

    get data(): readonly OhlcData[] { return this.dataValue; }
    get boxSize(): number { return this.boxSizeValue; }

    reset(source: readonly OhlcData[]): DerivedOhlcData {
        this.dataValue.length = 0;
        this.initialTimes = [];
        this.nextStep = sourceStep(source);
        this.base = null;
        this.previewTime = null;
        this.boxSizeValue = renkoBox(source, this.requestedBoxSize);

        const committed = Math.max(0, source.length - 1);
        for (let index = 0; index < committed; index++) this.process(source[index]);
        this.previewCheckpoint = this.checkpoint();
        if (source.length > 0) {
            const preview = source[source.length - 1];
            this.previewTime = preview.time;
            this.process(preview);
        }
        this.installInitialTimes(source);
        return { data: this.dataValue, boxSize: this.boxSizeValue };
    }

    update(point: OhlcData): DerivedOhlcPatch | null {
        if (this.previewTime !== null && point.time < this.previewTime) return null;
        if (this.previewTime === null || point.time > this.previewTime) {
            this.previewCheckpoint = this.checkpoint();
            this.previewTime = point.time;
            const fromIndex = this.dataValue.length;
            this.process(point);
            return changedTail(this.dataValue, fromIndex, []);
        }

        const fromIndex = this.previewCheckpoint.dataLength;
        const previous = this.dataValue.slice(fromIndex);
        this.restore(this.previewCheckpoint);
        this.process(point);
        return changedTail(this.dataValue, fromIndex, previous);
    }

    private process(point: OhlcData): void {
        if (this.base === null) {
            this.base = point.close;
            return;
        }
        const box = this.boxSizeValue;
        if (!(box > 0)) return;
        let base = this.base;
        while (point.close >= base + box) {
            const low = base;
            const high = base + box;
            this.dataValue.push({
                time: this.timeAt(this.dataValue.length),
                open: low, high, low, close: high,
            });
            base = high;
        }
        while (point.close <= base - box) {
            const high = base;
            const low = base - box;
            this.dataValue.push({
                time: this.timeAt(this.dataValue.length),
                open: high, high, low, close: low,
            });
            base = low;
        }
        this.base = base;
    }

    private checkpoint(): RenkoCheckpoint {
        return { base: this.base, dataLength: this.dataValue.length };
    }

    private restore(checkpoint: RenkoCheckpoint): void {
        this.base = checkpoint.base;
        this.dataValue.length = checkpoint.dataLength;
    }

    private installInitialTimes(source: readonly OhlcData[]): void {
        this.initialTimes = evenSpan(source, this.dataValue.length);
        for (let index = 0; index < this.dataValue.length; index++) {
            this.dataValue[index] = { ...this.dataValue[index], time: this.initialTimes[index] };
        }
        if (this.initialTimes.length > 1) {
            this.nextStep = this.initialTimes[this.initialTimes.length - 1]
                - this.initialTimes[this.initialTimes.length - 2];
        }
    }

    private timeAt(index: number): number {
        const initial = this.initialTimes[index];
        if (initial !== undefined) return initial;
        const previous = this.dataValue[index - 1]?.time;
        return previous === undefined ? 0 : previous + this.nextStep;
    }
}

interface PointFigureCheckpoint {
    readonly initialized: boolean;
    readonly direction: -1 | 0 | 1;
    readonly top: number;
    readonly bottom: number;
    readonly dataLength: number;
    readonly lastPoint: OhlcData | null;
}

/** Stateful close-based Point & Figure transform with a transactional source tail. */
export class PointFigureDataRuntime {
    private readonly requestedBoxSize?: number;
    private readonly reversalValue: number;
    private readonly dataValue: OhlcData[] = [];
    private initialTimes: number[] = [];
    private nextStep = 1;
    private reference = 0;
    private direction: -1 | 0 | 1 = 0;
    private top = 0;
    private bottom = 0;
    private initialized = false;
    private previewTime: number | null = null;
    private previewCheckpoint: PointFigureCheckpoint = {
        initialized: false, direction: 0, top: 0, bottom: 0, dataLength: 0, lastPoint: null,
    };
    private boxSizeValue = 0;

    constructor(requestedBoxSize?: number, requestedReversal?: number) {
        this.requestedBoxSize = requestedBoxSize;
        const reversal = finite(requestedReversal, 2);
        this.reversalValue = reversal > 0 ? reversal : 2;
    }

    get data(): readonly OhlcData[] { return this.dataValue; }
    get boxSize(): number { return this.boxSizeValue; }
    get reversal(): number { return this.reversalValue; }

    reset(source: readonly OhlcData[]): DerivedOhlcData {
        this.dataValue.length = 0;
        this.initialTimes = [];
        this.nextStep = sourceStep(source);
        this.direction = 0;
        this.top = 0;
        this.bottom = 0;
        this.initialized = false;
        this.previewTime = null;
        this.boxSizeValue = pointFigureBox(source, this.requestedBoxSize);

        const first = source[0];
        if (first !== undefined) {
            // A fixed first-price grid has no look-ahead and remains stable as
            // lower prices arrive later in the stream.
            this.reference = first.close;
        }
        const committed = Math.max(0, source.length - 1);
        for (let index = 0; index < committed; index++) this.process(source[index]);
        this.previewCheckpoint = this.checkpoint();
        if (source.length > 0) {
            const preview = source[source.length - 1];
            this.previewTime = preview.time;
            this.process(preview);
        }
        this.installInitialTimes(source);
        this.retimeCheckpoint();
        return { data: this.dataValue, boxSize: this.boxSizeValue };
    }

    update(point: OhlcData): DerivedOhlcPatch | null {
        if (this.previewTime !== null && point.time < this.previewTime) return null;
        if (this.previewTime === null || point.time > this.previewTime) {
            this.previewCheckpoint = this.checkpoint();
            this.previewTime = point.time;
            const fromIndex = Math.max(0, this.dataValue.length - 1);
            const previous = this.dataValue.slice(fromIndex);
            this.process(point);
            return changedTail(this.dataValue, fromIndex, previous);
        }

        const fromIndex = Math.max(0, this.previewCheckpoint.dataLength - 1);
        const previous = this.dataValue.slice(fromIndex);
        this.restore(this.previewCheckpoint);
        this.process(point);
        return changedTail(this.dataValue, fromIndex, previous);
    }

    private process(point: OhlcData): void {
        const close = point.close;
        if (!this.initialized) {
            this.top = close;
            this.bottom = close;
            this.initialized = true;
            return;
        }
        const box = this.boxSizeValue;
        if (!(box > 0)) return;
        if (this.direction >= 0 && close >= this.top + box) {
            this.direction = 1;
            this.top = Math.floor((close - this.reference) / box) * box + this.reference;
            const previous = this.dataValue[this.dataValue.length - 1];
            if (previous === undefined || previous.close < previous.open) {
                this.dataValue.push(this.rising(this.bottom, this.top));
            } else {
                this.dataValue[this.dataValue.length - 1] = {
                    ...previous, high: this.top, close: this.top,
                };
            }
        } else if (this.direction <= 0 && close <= this.bottom - box) {
            this.direction = -1;
            this.bottom = Math.ceil((close - this.reference) / box) * box + this.reference;
            const previous = this.dataValue[this.dataValue.length - 1];
            if (previous === undefined || previous.close > previous.open) {
                this.dataValue.push(this.falling(this.bottom, this.top));
            } else {
                this.dataValue[this.dataValue.length - 1] = {
                    ...previous, low: this.bottom, close: this.bottom,
                };
            }
        } else if (this.direction === 1 && close <= this.top - this.reversalValue * box) {
            this.direction = -1;
            this.bottom = close;
            this.dataValue.push(this.falling(this.bottom, this.top - box));
        } else if (this.direction === -1 && close >= this.bottom + this.reversalValue * box) {
            this.direction = 1;
            this.top = close;
            this.dataValue.push(this.rising(this.bottom + box, this.top));
        }
    }

    private rising(low: number, high: number): OhlcData {
        return {
            time: this.timeAt(this.dataValue.length),
            open: low, high, low, close: high,
        };
    }

    private falling(low: number, high: number): OhlcData {
        return {
            time: this.timeAt(this.dataValue.length),
            open: high, high, low, close: low,
        };
    }

    private checkpoint(): PointFigureCheckpoint {
        const last = this.dataValue[this.dataValue.length - 1];
        return {
            initialized: this.initialized,
            direction: this.direction,
            top: this.top,
            bottom: this.bottom,
            dataLength: this.dataValue.length,
            lastPoint: last === undefined ? null : { ...last },
        };
    }

    private restore(checkpoint: PointFigureCheckpoint): void {
        this.initialized = checkpoint.initialized;
        this.direction = checkpoint.direction;
        this.top = checkpoint.top;
        this.bottom = checkpoint.bottom;
        this.dataValue.length = checkpoint.dataLength;
        if (checkpoint.lastPoint !== null && checkpoint.dataLength > 0) {
            this.dataValue[checkpoint.dataLength - 1] = { ...checkpoint.lastPoint };
        }
    }

    private installInitialTimes(source: readonly OhlcData[]): void {
        this.initialTimes = evenSpan(source, this.dataValue.length);
        for (let index = 0; index < this.dataValue.length; index++) {
            this.dataValue[index] = { ...this.dataValue[index], time: this.initialTimes[index] };
        }
        if (this.initialTimes.length > 1) {
            this.nextStep = this.initialTimes[this.initialTimes.length - 1]
                - this.initialTimes[this.initialTimes.length - 2];
        }
    }

    private retimeCheckpoint(): void {
        const lastIndex = this.previewCheckpoint.dataLength - 1;
        if (lastIndex < 0 || this.previewCheckpoint.lastPoint === null) return;
        this.previewCheckpoint = {
            ...this.previewCheckpoint,
            lastPoint: {
                ...this.previewCheckpoint.lastPoint,
                time: this.initialTimes[lastIndex] ?? this.previewCheckpoint.lastPoint.time,
            },
        };
    }

    private timeAt(index: number): number {
        const initial = this.initialTimes[index];
        if (initial !== undefined) return initial;
        const previous = this.dataValue[index - 1]?.time;
        return previous === undefined ? 0 : previous + this.nextStep;
    }
}

export function prepareRenkoData(
    source: readonly OhlcData[],
    requestedBoxSize?: number,
): DerivedOhlcData {
    return new RenkoDataRuntime(requestedBoxSize).reset(source);
}

export function preparePointFigureData(
    source: readonly OhlcData[],
    requestedBoxSize?: number,
    requestedReversal?: number,
): DerivedOhlcData {
    return new PointFigureDataRuntime(requestedBoxSize, requestedReversal).reset(source);
}
