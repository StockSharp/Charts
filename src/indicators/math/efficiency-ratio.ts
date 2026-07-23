import { RingBuffer, type RingBufferCheckpoint } from './ring-buffer.js';

type NumericValue = number | null | undefined;

function numeric(value: NumericValue): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export type RollingEfficiencyRatioCheckpoint = RingBufferCheckpoint<number | null>;

/** Kaufman efficiency ratio over a fixed sample window with O(1) updates. */
export class RollingEfficiencyRatio {
    private readonly values: RingBuffer<number | null>;
    private volatility = 0;
    private invalid = 0;

    constructor(readonly windowLength: number) {
        if (!Number.isInteger(windowLength) || windowLength < 1) {
            throw new RangeError(
                'sschart: efficiency ratio length must be a positive integer',
            );
        }
        this.values = new RingBuffer(windowLength);
    }

    get isFormed(): boolean { return this.values.full && this.invalid === 0; }

    get value(): number | null {
        if (!this.isFormed) return null;
        const oldest = this.values.front();
        const newest = this.values.back();
        if (oldest === null || oldest === undefined || newest === null || newest === undefined)
            return null;
        const volatility = Math.max(0, this.volatility);
        return volatility === 0 ? 0 : Math.abs(newest - oldest) / volatility;
    }

    push(value: NumericValue): number | null {
        const incoming = numeric(value);
        if (this.values.full) {
            const outgoing = this.values.front();
            if (outgoing === null) this.invalid -= 1;
            if (this.windowLength > 1) {
                const second = this.values.at(1);
                if (outgoing !== null && outgoing !== undefined
                    && second !== null && second !== undefined) {
                    this.volatility -= Math.abs(second - outgoing);
                }
            }
        }
        const previous = this.values.back();
        if (this.windowLength > 1 && previous !== null && previous !== undefined
            && incoming !== null) {
            this.volatility += Math.abs(incoming - previous);
        }
        this.values.push(incoming);
        if (incoming === null) this.invalid += 1;
        return this.value;
    }

    preview(value: NumericValue): number | null {
        const incoming = numeric(value);
        const full = this.values.full;
        const outgoing = full ? this.values.front() : undefined;
        const invalid = this.invalid
            - (full && outgoing === null ? 1 : 0)
            + (incoming === null ? 1 : 0);
        let volatility = this.volatility;
        if (full && this.windowLength > 1) {
            const second = this.values.at(1);
            if (outgoing !== null && outgoing !== undefined
                && second !== null && second !== undefined) {
                volatility -= Math.abs(second - outgoing);
            }
        }
        const previous = this.values.back();
        if (this.windowLength > 1 && previous !== null && previous !== undefined
            && incoming !== null) {
            volatility += Math.abs(incoming - previous);
        }
        const size = Math.min(this.windowLength, this.values.size + 1);
        if (size !== this.windowLength || invalid !== 0 || incoming === null) return null;
        const oldest = full
            ? (this.windowLength === 1 ? incoming : this.values.at(1))
            : (this.values.front() ?? incoming);
        if (oldest === null || oldest === undefined) return null;
        volatility = Math.max(0, volatility);
        return volatility === 0 ? 0 : Math.abs(incoming - oldest) / volatility;
    }

    reset(): void {
        this.values.clear();
        this.volatility = 0;
        this.invalid = 0;
    }

    checkpoint(): RollingEfficiencyRatioCheckpoint { return this.values.checkpoint(); }

    restore(checkpoint: RollingEfficiencyRatioCheckpoint): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || !Array.isArray(checkpoint.values)
            || checkpoint.values.length > this.windowLength
            || checkpoint.values.some((value) => value !== null && numeric(value) === null)) {
            throw new TypeError('sschart: invalid efficiency ratio checkpoint');
        }
        this.reset();
        for (const value of checkpoint.values) this.push(value);
    }
}
