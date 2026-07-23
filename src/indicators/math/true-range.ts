import type { IndicatorCandle } from '../indicator-definition.js';
import {
    ExpandingWilderMovingAverage,
    WilderMovingAverage,
    type ExpandingWilderMovingAverageCheckpoint,
    type SeededMovingAverageCheckpoint,
} from './moving-averages.js';

function numeric(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export interface TrueRangeCheckpoint {
    readonly hasPrevious: boolean;
    readonly previousClose: number | null;
}

export class TrueRange {
    private hasPrevious = false;
    private previousClose: number | null = null;

    push(candle: Readonly<IndicatorCandle>): number | null {
        const result = this.calculate(candle);
        this.hasPrevious = true;
        this.previousClose = numeric(candle?.close);
        return result;
    }

    preview(candle: Readonly<IndicatorCandle>): number | null {
        return this.calculate(candle);
    }

    reset(): void {
        this.hasPrevious = false;
        this.previousClose = null;
    }

    checkpoint(): TrueRangeCheckpoint {
        return Object.freeze({
            hasPrevious: this.hasPrevious,
            previousClose: this.previousClose,
        });
    }

    restore(checkpoint: TrueRangeCheckpoint): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || typeof checkpoint.hasPrevious !== 'boolean'
            || (checkpoint.previousClose !== null
                && (typeof checkpoint.previousClose !== 'number'
                    || !Number.isFinite(checkpoint.previousClose)))) {
            throw new TypeError('sschart: invalid true range checkpoint');
        }
        this.hasPrevious = checkpoint.hasPrevious;
        this.previousClose = checkpoint.previousClose;
    }

    private calculate(candle: Readonly<IndicatorCandle>): number | null {
        if (candle === null || typeof candle !== 'object') return null;
        const high = numeric(candle.high);
        const low = numeric(candle.low);
        if (high === null || low === null) return null;
        if (!this.hasPrevious) return high - low;
        if (this.previousClose === null) return null;
        return Math.max(
            high - low,
            Math.abs(this.previousClose - high),
            Math.abs(this.previousClose - low),
        );
    }
}

export interface AverageTrueRangeCheckpoint {
    readonly trueRange: TrueRangeCheckpoint;
    readonly average: SeededMovingAverageCheckpoint;
}

export class AverageTrueRange {
    private readonly trueRange = new TrueRange();
    private readonly average: WilderMovingAverage;

    constructor(readonly windowLength: number) {
        this.average = new WilderMovingAverage(windowLength);
    }

    get isFormed(): boolean { return this.average.isFormed; }
    get value(): number | null { return this.average.value; }

    push(candle: Readonly<IndicatorCandle>): number | null {
        return this.average.push(this.trueRange.push(candle));
    }

    preview(candle: Readonly<IndicatorCandle>): number | null {
        return this.average.preview(this.trueRange.preview(candle));
    }

    reset(): void {
        this.trueRange.reset();
        this.average.reset();
    }

    checkpoint(): AverageTrueRangeCheckpoint {
        return Object.freeze({
            trueRange: this.trueRange.checkpoint(),
            average: this.average.checkpoint(),
        });
    }

    restore(checkpoint: AverageTrueRangeCheckpoint): void {
        if (checkpoint === null || typeof checkpoint !== 'object')
            throw new TypeError('sschart: invalid average true range checkpoint');
        const range = new TrueRange();
        const average = new WilderMovingAverage(this.windowLength);
        range.restore(checkpoint.trueRange);
        average.restore(checkpoint.average);
        this.trueRange.restore(range.checkpoint());
        this.average.restore(average.checkpoint());
    }
}

export interface ExpandingAverageTrueRangeCheckpoint {
    readonly previousClose: number | null;
    readonly average: ExpandingWilderMovingAverageCheckpoint;
}

/**
 * StockSharp-style ATR with a growing warm-up divisor. Invalid high/low samples
 * neither advance the average nor replace the previous valid candle close.
 */
export class ExpandingAverageTrueRange {
    private previousClose: number | null = null;
    private readonly average: ExpandingWilderMovingAverage;

    constructor(readonly windowLength: number) {
        this.average = new ExpandingWilderMovingAverage(windowLength);
    }

    get isFormed(): boolean { return this.average.isFormed; }
    get value(): number | null { return this.average.value; }

    push(candle: Readonly<IndicatorCandle>): number | null {
        const trueRange = this.trueRange(candle);
        const value = this.average.push(trueRange);
        if (trueRange !== null) {
            const close = numeric(candle?.close);
            if (close !== null) this.previousClose = close;
        }
        return value;
    }

    preview(candle: Readonly<IndicatorCandle>): number | null {
        return this.average.preview(this.trueRange(candle));
    }

    reset(): void {
        this.previousClose = null;
        this.average.reset();
    }

    checkpoint(): ExpandingAverageTrueRangeCheckpoint {
        return Object.freeze({
            previousClose: this.previousClose,
            average: this.average.checkpoint(),
        });
    }

    restore(checkpoint: ExpandingAverageTrueRangeCheckpoint): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || (checkpoint.previousClose !== null
                && numeric(checkpoint.previousClose) === null)) {
            throw new TypeError('sschart: invalid expanding average true range checkpoint');
        }
        this.average.restore(checkpoint.average);
        this.previousClose = checkpoint.previousClose;
    }

    private trueRange(candle: Readonly<IndicatorCandle>): number | null {
        if (candle === null || typeof candle !== 'object') return null;
        const high = numeric(candle.high);
        const low = numeric(candle.low);
        if (high === null || low === null) return null;
        if (this.previousClose === null) return high - low;
        return Math.max(
            high - low,
            Math.abs(high - this.previousClose),
            Math.abs(low - this.previousClose),
        );
    }
}
