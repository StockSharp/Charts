import type { Time } from '../core/chart-api.js';
import {
    FixedResolutionUnit,
    parseFixedResolution,
} from '../data/aggregation.js';
import {
    TradingSessionKind,
    type ITradingCalendar,
    type TradingSession,
    type TradingSessionKind as TradingSessionKindValue,
} from './trading-calendar.js';

const DAY_SECONDS = 86_400;
const MAX_CALENDAR_AMOUNT = 10_000;
const MAX_SESSION_STEPS = 100_000;
const SESSION_KINDS = new Set<TradingSessionKindValue>(Object.values(TradingSessionKind));
const DEFAULT_SESSION_KINDS = Object.freeze([TradingSessionKind.Regular]);

export const BarClockState = Object.freeze({
    Pending: 'pending',
    Open: 'open',
    Closed: 'closed',
} as const);

export type BarClockState = typeof BarClockState[keyof typeof BarClockState];

export interface BarClockOptions {
    readonly calendar?: ITradingCalendar;
    /** Defaults to regular sessions when a calendar is present. */
    readonly sessionKinds?: readonly TradingSessionKindValue[];
}

export interface TradingBarBounds {
    readonly resolution: string;
    readonly intervalSeconds: number;
    readonly openTime: Time;
    readonly closeTime: Time;
    readonly durationSeconds: number;
    readonly session: TradingSession | null;
}

export interface BarCountdown {
    readonly state: BarClockState;
    readonly now: Time;
    readonly bounds: TradingBarBounds;
    readonly untilOpenSeconds: number;
    readonly elapsedSeconds: number;
    readonly remainingSeconds: number;
    readonly progress: number;
}

/**
 * Resolves the close of a feed bar from its open timestamp. Intraday bars are
 * truncated at their owning session close; D/W bars advance by local trading
 * dates rather than by browser-local midnights.
 */
export function resolveTradingBarBounds(
    barOpenTime: Time,
    resolution: string,
    options: BarClockOptions = {},
): TradingBarBounds | null {
    const openTime = finiteTime(barOpenTime, 'bar open time');
    const parsed = parseFixedResolution(resolution);
    const normalizedResolution = resolution.trim();
    const normalized = normalizeOptions(options);
    if (normalized.calendar === null) {
        const closeTime = safeAdd(openTime, parsed.seconds);
        return bounds(normalizedResolution, parsed.seconds, openTime, closeTime, null);
    }

    if ((parsed.unit === FixedResolutionUnit.Day || parsed.unit === FixedResolutionUnit.Week)
        && parsed.amount > MAX_CALENDAR_AMOUNT) {
        throw new RangeError('sschart: calendar bar resolution amount is too large');
    }
    const session = checkedSession(
        normalized.calendar.sessionAt(openTime, normalized.kinds),
        'sessionAt',
    );
    if (session === null) return null;

    let closeTime: Time | null;
    if (parsed.unit === FixedResolutionUnit.Day) {
        closeTime = dailyClose(normalized.calendar, session, parsed.amount, normalized.kinds);
    } else if (parsed.unit === FixedResolutionUnit.Week) {
        closeTime = weeklyClose(normalized.calendar, session, parsed.amount, normalized.kinds);
    } else {
        closeTime = Math.min(safeAdd(openTime, parsed.seconds), session.closeTime);
    }
    if (closeTime === null || !(closeTime > openTime)) return null;
    return bounds(normalizedResolution, parsed.seconds, openTime, closeTime, session);
}

/** Deterministic countdown snapshot. The caller owns the clock and supplies now. */
export function calculateBarCountdown(
    barOpenTime: Time,
    resolution: string,
    now: Time,
    options: BarClockOptions = {},
): BarCountdown | null {
    const currentTime = finiteTime(now, 'bar clock now');
    const resolved = resolveTradingBarBounds(barOpenTime, resolution, options);
    if (resolved === null) return null;
    const duration = resolved.durationSeconds;
    const untilOpenSeconds = Math.max(0, resolved.openTime - currentTime);
    const elapsedSeconds = Math.min(duration, Math.max(0, currentTime - resolved.openTime));
    const remainingSeconds = Math.max(0, resolved.closeTime - currentTime);
    const state = currentTime < resolved.openTime ? BarClockState.Pending
        : currentTime < resolved.closeTime ? BarClockState.Open
            : BarClockState.Closed;
    return Object.freeze({
        state,
        now: currentTime,
        bounds: resolved,
        untilOpenSeconds,
        elapsedSeconds,
        remainingSeconds,
        progress: duration === 0 ? 1 : elapsedSeconds / duration,
    });
}

function bounds(
    resolution: string,
    intervalSeconds: number,
    openTime: Time,
    closeTime: Time,
    session: TradingSession | null,
): TradingBarBounds {
    return Object.freeze({
        resolution,
        intervalSeconds,
        openTime,
        closeTime,
        durationSeconds: closeTime - openTime,
        session: session === null ? null : Object.freeze({ ...session }),
    });
}

function dailyClose(
    calendar: ITradingCalendar,
    first: TradingSession,
    amount: number,
    kinds: readonly TradingSessionKindValue[],
): Time | null {
    let tradingDates = 1;
    let currentDate = first.tradingDate;
    let last = first;
    for (let step = 0; step < MAX_SESSION_STEPS; step += 1) {
        const next = checkedNext(calendar, last, kinds);
        if (next === null) return tradingDates === amount ? last.closeTime : null;
        if (next.tradingDate !== currentDate) {
            if (tradingDates === amount) return last.closeTime;
            tradingDates += 1;
            currentDate = next.tradingDate;
        }
        last = next;
    }
    throw new RangeError('sschart: calendar did not converge while resolving a daily bar');
}

function weeklyClose(
    calendar: ITradingCalendar,
    first: TradingSession,
    amount: number,
    kinds: readonly TradingSessionKindValue[],
): Time | null {
    const firstDate = tradingDateOrdinal(first.tradingDate);
    const isoWeekday = isoWeekdayFromOrdinal(firstDate);
    const exclusiveDate = firstDate - (isoWeekday - 1) + amount * 7;
    let last = first;
    for (let step = 0; step < MAX_SESSION_STEPS; step += 1) {
        const next = checkedNext(calendar, last, kinds);
        if (next === null) return last.closeTime;
        if (tradingDateOrdinal(next.tradingDate) >= exclusiveDate) return last.closeTime;
        last = next;
    }
    throw new RangeError('sschart: calendar did not converge while resolving a weekly bar');
}

function checkedNext(
    calendar: ITradingCalendar,
    current: TradingSession,
    kinds: readonly TradingSessionKindValue[],
): TradingSession | null {
    const next = checkedSession(calendar.nextSession(current.closeTime, kinds), 'nextSession');
    if (next !== null && !(next.closeTime > current.closeTime))
        throw new RangeError('sschart: trading calendar nextSession did not advance');
    return next;
}

function checkedSession(value: TradingSession | null, source: string): TradingSession | null {
    if (value === null) return null;
    if (typeof value !== 'object'
        || !Number.isFinite(value.openTime)
        || !Number.isFinite(value.closeTime)
        || !(value.closeTime > value.openTime)
        || typeof value.tradingDate !== 'string'
        || !SESSION_KINDS.has(value.kind)) {
        throw new TypeError(`sschart: trading calendar ${source} returned an invalid session`);
    }
    tradingDateOrdinal(value.tradingDate);
    return value;
}

function normalizeOptions(options: BarClockOptions): {
    readonly calendar: ITradingCalendar | null;
    readonly kinds: readonly TradingSessionKindValue[];
} {
    if (options === null || typeof options !== 'object')
        throw new TypeError('sschart: bar clock options must be an object');
    const value = options.calendar;
    if (value === undefined) {
        if (options.sessionKinds !== undefined)
            throw new TypeError('sschart: bar clock sessionKinds require a calendar');
        return { calendar: null, kinds: Object.freeze([]) };
    }
    if (value === null || typeof value !== 'object'
        || typeof value.sessionAt !== 'function'
        || typeof value.nextSession !== 'function') {
        throw new TypeError('sschart: bar clock calendar must implement ITradingCalendar');
    }
    const requested = options.sessionKinds ?? DEFAULT_SESSION_KINDS;
    if (!Array.isArray(requested) || requested.length === 0)
        throw new TypeError('sschart: bar clock sessionKinds must be a non-empty array');
    const kinds = [...new Set(requested)];
    if (kinds.some((kind) => !SESSION_KINDS.has(kind)))
        throw new TypeError('sschart: bar clock sessionKinds contains an invalid kind');
    return { calendar: value, kinds: Object.freeze(kinds) };
}

function tradingDateOrdinal(value: string): number {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match === null) throw new TypeError('sschart: trading session date must use YYYY-MM-DD');
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day)
        throw new RangeError('sschart: trading session date is invalid');
    return date.getTime() / (DAY_SECONDS * 1_000);
}

function isoWeekdayFromOrdinal(ordinal: number): number {
    const day = new Date(ordinal * DAY_SECONDS * 1_000).getUTCDay();
    return day === 0 ? 7 : day;
}

function finiteTime(value: Time, name: string): Time {
    if (!Number.isFinite(value)) throw new RangeError(`sschart: ${name} must be finite`);
    return value;
}

function safeAdd(time: Time, seconds: number): Time {
    const result = time + seconds;
    if (!Number.isFinite(result)) throw new RangeError('sschart: bar close time overflowed');
    return result;
}
