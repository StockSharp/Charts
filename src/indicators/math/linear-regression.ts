import { RingBuffer, type RingBufferCheckpoint } from './ring-buffer.js';

type NumericValue = number | null | undefined;

function numeric(value: NumericValue): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export type RollingLinearRegressionCheckpoint = RingBufferCheckpoint<number | null>;

interface RegressionState {
    readonly size: number;
    readonly invalid: number;
    readonly reference: number;
    readonly centeredSum: number;
    readonly centeredSum2: number;
    readonly centeredSumXy: number;
    readonly validSumX: number;
}

/** Least-squares endpoint, forecast, slope and standard error, updated in O(1). */
export class RollingLinearRegression {
    private readonly values: RingBuffer<number | null>;
    private readonly sumX: number;
    private readonly divisor: number;
    private invalid = 0;
    private reference = 0;
    private centeredSum = 0;
    private centeredSum2 = 0;
    private centeredSumXy = 0;
    private validSumX = 0;

    constructor(readonly windowLength: number) {
        if (!Number.isInteger(windowLength) || windowLength < 1) {
            throw new RangeError(
                'sschart: linear regression length must be a positive integer',
            );
        }
        this.values = new RingBuffer<number | null>(windowLength);
        this.sumX = windowLength * (windowLength - 1) / 2;
        const sumX2 = (windowLength - 1) * windowLength * (2 * windowLength - 1) / 6;
        this.divisor = windowLength * sumX2 - this.sumX * this.sumX;
    }

    get isFormed(): boolean { return this.values.full && this.invalid === 0; }
    get value(): number | null {
        return this.endpoint({
            size: this.values.size,
            invalid: this.invalid,
            reference: this.reference,
            centeredSum: this.centeredSum,
            centeredSum2: this.centeredSum2,
            centeredSumXy: this.centeredSumXy,
            validSumX: this.validSumX,
        });
    }
    get nextValue(): number | null {
        return this.next({
            size: this.values.size,
            invalid: this.invalid,
            reference: this.reference,
            centeredSum: this.centeredSum,
            centeredSum2: this.centeredSum2,
            centeredSumXy: this.centeredSumXy,
            validSumX: this.validSumX,
        });
    }
    get slopeValue(): number | null {
        return this.slope({
            size: this.values.size,
            invalid: this.invalid,
            reference: this.reference,
            centeredSum: this.centeredSum,
            centeredSum2: this.centeredSum2,
            centeredSumXy: this.centeredSumXy,
            validSumX: this.validSumX,
        });
    }
    get standardErrorValue(): number | null {
        return this.standardError({
            size: this.values.size,
            invalid: this.invalid,
            reference: this.reference,
            centeredSum: this.centeredSum,
            centeredSum2: this.centeredSum2,
            centeredSumXy: this.centeredSumXy,
            validSumX: this.validSumX,
        });
    }
    get rSquaredValue(): number | null {
        return this.rSquared({
            size: this.values.size,
            invalid: this.invalid,
            reference: this.reference,
            centeredSum: this.centeredSum,
            centeredSum2: this.centeredSum2,
            centeredSumXy: this.centeredSumXy,
            validSumX: this.validSumX,
        });
    }

    push(value: NumericValue): number | null {
        const incoming = numeric(value);
        const next = this.project(incoming);
        this.values.push(incoming);
        this.invalid = next.invalid;
        this.reference = next.reference;
        this.centeredSum = next.centeredSum;
        this.centeredSum2 = next.centeredSum2;
        this.centeredSumXy = next.centeredSumXy;
        this.validSumX = next.validSumX;
        return this.endpoint(next);
    }

    preview(value: NumericValue): number | null {
        return this.endpoint(this.project(numeric(value)));
    }

    previewNext(value: NumericValue): number | null {
        return this.next(this.project(numeric(value)));
    }

    previewSlope(value: NumericValue): number | null {
        return this.slope(this.project(numeric(value)));
    }

    previewStandardError(value: NumericValue): number | null {
        return this.standardError(this.project(numeric(value)));
    }

    previewRSquared(value: NumericValue): number | null {
        return this.rSquared(this.project(numeric(value)));
    }

    reset(): void {
        this.values.clear();
        this.invalid = 0;
        this.reference = 0;
        this.centeredSum = 0;
        this.centeredSum2 = 0;
        this.centeredSumXy = 0;
        this.validSumX = 0;
    }

    checkpoint(): RollingLinearRegressionCheckpoint {
        return this.values.checkpoint();
    }

    restore(checkpoint: RollingLinearRegressionCheckpoint): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || !Array.isArray(checkpoint.values)
            || checkpoint.values.length > this.windowLength
            || checkpoint.values.some((value) => (
                value !== null && (typeof value !== 'number' || !Number.isFinite(value))
            ))) {
            throw new TypeError('sschart: invalid linear regression checkpoint');
        }
        this.reset();
        for (const value of checkpoint.values) this.push(value);
    }

    private project(incoming: number | null): RegressionState {
        const reference = incoming ?? this.reference;
        const referenceDelta = this.reference - reference;
        const validCount = this.values.size - this.invalid;
        let centeredSum = this.centeredSum + validCount * referenceDelta;
        let centeredSum2 = this.centeredSum2
            + 2 * referenceDelta * this.centeredSum
            + validCount * referenceDelta * referenceDelta;
        let centeredSumXy = this.centeredSumXy
            + referenceDelta * this.validSumX;
        let validSumX = this.validSumX;
        if (!this.values.full) {
            if (incoming !== null) {
                const centered = incoming - reference;
                centeredSum += centered;
                centeredSum2 += centered * centered;
                centeredSumXy += this.values.size * centered;
                validSumX += this.values.size;
            }
            return {
                size: this.values.size + 1,
                invalid: this.invalid + (incoming === null ? 1 : 0),
                reference,
                centeredSum,
                centeredSum2,
                centeredSumXy,
                validSumX,
            };
        }

        const outgoing = this.values.front() ?? null;
        let remainingValid = validCount;
        if (outgoing !== null) {
            const centered = outgoing - reference;
            centeredSum -= centered;
            centeredSum2 -= centered * centered;
            remainingValid -= 1;
        }
        // Every retained sample moves from x to x - 1 when the window rolls.
        centeredSumXy -= centeredSum;
        validSumX -= remainingValid;
        if (incoming !== null) {
            const centered = incoming - reference;
            centeredSum += centered;
            centeredSum2 += centered * centered;
            centeredSumXy += (this.windowLength - 1) * centered;
            validSumX += this.windowLength - 1;
        }
        return {
            size: this.windowLength,
            invalid: this.invalid
                - (outgoing === null ? 1 : 0)
                + (incoming === null ? 1 : 0),
            reference,
            centeredSum,
            centeredSum2,
            centeredSumXy,
            validSumX,
        };
    }

    private endpoint(state: RegressionState): number | null {
        if (state.size !== this.windowLength || state.invalid !== 0) return null;
        const slope = this.divisor === 0 ? 0 : this.slope(state);
        if (slope === null) return null;
        const intercept = state.reference + (
            state.centeredSum - slope * this.sumX
        ) / this.windowLength;
        const value = slope * (this.windowLength - 1) + intercept;
        return Number.isFinite(value) ? value : null;
    }

    private next(state: RegressionState): number | null {
        const slope = this.slope(state);
        if (slope === null) return null;
        const intercept = state.reference + (
            state.centeredSum - slope * this.sumX
        ) / this.windowLength;
        const value = slope * this.windowLength + intercept;
        return Number.isFinite(value) ? value : null;
    }

    private slope(state: RegressionState): number | null {
        if (state.size !== this.windowLength || state.invalid !== 0 || this.divisor === 0)
            return null;
        const value = (
            this.windowLength * state.centeredSumXy
                - this.sumX * state.centeredSum
        ) / this.divisor;
        return Number.isFinite(value) ? value : null;
    }

    private standardError(state: RegressionState): number | null {
        if (state.size !== this.windowLength || state.invalid !== 0
            || this.windowLength < 2) {
            return null;
        }
        if (this.windowLength === 2) return 0;
        const slope = this.slope(state);
        if (slope === null) return null;
        const intercept = (
            state.centeredSum - slope * this.sumX
        ) / this.windowLength;
        // The residual is evaluated around the newest valid value rather than
        // absolute prices, avoiding catastrophic cancellation for tight price ranges.
        const squaredError = Math.max(
            0,
            state.centeredSum2
                - slope * state.centeredSumXy
                - intercept * state.centeredSum,
        );
        const value = Math.sqrt(squaredError / (this.windowLength - 2));
        return Number.isFinite(value) ? value : null;
    }

    private rSquared(state: RegressionState): number | null {
        if (state.size !== this.windowLength || state.invalid !== 0) return null;
        const total = Math.max(
            0,
            state.centeredSum2
                - state.centeredSum * state.centeredSum / this.windowLength,
        );
        if (total === 0 || this.divisor === 0) return 0;

        const centeredXy = state.centeredSumXy
            - this.sumX * state.centeredSum / this.windowLength;
        const slope = this.slope(state);
        if (slope === null) return null;
        const value = slope * centeredXy / total;
        if (!Number.isFinite(value)) return null;
        // Exact least squares is bounded to [0, 1]; clamp only floating-point
        // residue around those boundaries.
        return Math.max(0, Math.min(1, value));
    }
}
