import { RingBuffer, type RingBufferCheckpoint } from './ring-buffer.js';

type NumericValue = number | null | undefined;

function numeric(value: NumericValue): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Bounded typical-price CCI window with an isolated replace-last preview. */
export class CommodityChannelIndexKernel {
    private readonly values: RingBuffer<number | null>;

    constructor(readonly windowLength: number) {
        if (!Number.isInteger(windowLength) || windowLength < 1)
            throw new RangeError('sschart: CCI window length must be a positive integer');
        this.values = new RingBuffer(windowLength);
    }

    push(value: NumericValue): number | null {
        const incoming = numeric(value);
        const result = this.evaluate(incoming);
        this.values.push(incoming);
        return result;
    }

    preview(value: NumericValue): number | null {
        return this.evaluate(numeric(value));
    }

    reset(): void { this.values.clear(); }
    checkpoint(): RingBufferCheckpoint<number | null> { return this.values.checkpoint(); }

    restore(checkpoint: RingBufferCheckpoint<number | null>): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || !Array.isArray(checkpoint.values)
            || checkpoint.values.length > this.windowLength
            || checkpoint.values.some((value) => value !== null && numeric(value) === null)) {
            throw new TypeError('sschart: invalid CCI window checkpoint');
        }
        this.values.restore(checkpoint);
    }

    private evaluate(incoming: number | null): number | null {
        const window = this.values.toArray();
        if (window.length === this.windowLength) window.shift();
        window.push(incoming);
        if (window.length !== this.windowLength || window.some((value) => value === null))
            return null;

        let sum = 0;
        for (const value of window) sum += value!;
        const average = sum / this.windowLength;
        let deviation = 0;
        for (const value of window) deviation += Math.abs(value! - average);
        deviation /= this.windowLength;
        return deviation === 0
            ? 0
            : (incoming! - average) / (0.015 * deviation);
    }
}
