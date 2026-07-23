export interface RealtimeReconnectPolicy {
    readonly enabled?: boolean;
    readonly initialDelayMs?: number;
    readonly maxDelayMs?: number;
    readonly multiplier?: number;
    readonly maxAttempts?: number;
    readonly jitterRatio?: number;
}

export interface ReconnectAttempt {
    readonly attempt: number;
    readonly delayMs: number;
}

export interface RealtimeScheduler {
    setTimeout(callback: () => void, delayMs: number): unknown;
    clearTimeout(handle: unknown): void;
    random(): number;
}

interface NormalizedPolicy {
    readonly enabled: boolean;
    readonly initialDelayMs: number;
    readonly maxDelayMs: number;
    readonly multiplier: number;
    readonly maxAttempts: number;
    readonly jitterRatio: number;
}

/** Deterministic stateful backoff; scheduling remains owned by the controller. */
export class RealtimeReconnectBackoff {
    private readonly policy: NormalizedPolicy;
    private attempts = 0;

    constructor(
        policy: RealtimeReconnectPolicy = {},
        private readonly random: () => number = Math.random,
    ) {
        this.policy = normalizePolicy(policy);
        if (typeof random !== 'function')
            throw new TypeError('sschart: reconnect random source must be a function');
    }

    get attemptCount(): number { return this.attempts; }

    next(): ReconnectAttempt | null {
        if (!this.policy.enabled || this.attempts >= this.policy.maxAttempts) return null;
        const attempt = ++this.attempts;
        const base = Math.min(
            this.policy.maxDelayMs,
            this.policy.initialDelayMs * this.policy.multiplier ** (attempt - 1),
        );
        const sample = this.random();
        if (!Number.isFinite(sample) || sample < 0 || sample > 1)
            throw new RangeError('sschart: reconnect random source must return a value in [0, 1]');
        const jitter = (sample * 2 - 1) * this.policy.jitterRatio;
        const delayMs = Math.max(0, Math.min(this.policy.maxDelayMs, Math.round(base * (1 + jitter))));
        return Object.freeze({ attempt, delayMs });
    }

    reset(): void { this.attempts = 0; }
}

export function defaultRealtimeScheduler(): RealtimeScheduler {
    return Object.freeze({
        setTimeout: (callback: () => void, delayMs: number) => globalThis.setTimeout(callback, delayMs),
        clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as number),
        random: () => Math.random(),
    });
}

function normalizePolicy(value: RealtimeReconnectPolicy): NormalizedPolicy {
    if (value === null || typeof value !== 'object')
        throw new TypeError('sschart: reconnect policy must be an object');
    const enabled = value.enabled ?? true;
    if (typeof enabled !== 'boolean')
        throw new TypeError('sschart: reconnect enabled must be boolean');
    const initialDelayMs = nonNegative(value.initialDelayMs, 1_000, 'initialDelayMs');
    const maxDelayMs = nonNegative(value.maxDelayMs, 30_000, 'maxDelayMs');
    if (maxDelayMs < initialDelayMs)
        throw new RangeError('sschart: reconnect maxDelayMs cannot be below initialDelayMs');
    const multiplier = finite(value.multiplier, 2, 'multiplier');
    if (multiplier < 1)
        throw new RangeError('sschart: reconnect multiplier must be at least 1');
    const maxAttempts = nonNegativeInteger(value.maxAttempts, 8, 'maxAttempts');
    const jitterRatio = finite(value.jitterRatio, 0.2, 'jitterRatio');
    if (jitterRatio < 0 || jitterRatio > 1)
        throw new RangeError('sschart: reconnect jitterRatio must be in [0, 1]');
    return Object.freeze({
        enabled,
        initialDelayMs,
        maxDelayMs,
        multiplier,
        maxAttempts,
        jitterRatio,
    });
}

function nonNegative(value: number | undefined, fallback: number, name: string): number {
    const result = finite(value, fallback, name);
    if (result < 0) throw new RangeError(`sschart: reconnect ${name} must be non-negative`);
    return result;
}

function nonNegativeInteger(value: number | undefined, fallback: number, name: string): number {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value < 0)
        throw new RangeError(`sschart: reconnect ${name} must be a non-negative safe integer`);
    return value;
}

function finite(value: number | undefined, fallback: number, name: string): number {
    if (value === undefined) return fallback;
    if (!Number.isFinite(value))
        throw new RangeError(`sschart: reconnect ${name} must be finite`);
    return value;
}
