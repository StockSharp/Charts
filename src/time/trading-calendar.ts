import type { Time, TimeRange } from '../core/chart-api.js';

/** ISO-8601 weekday: Monday is 1 and Sunday is 7. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Calendar-local date in the strict YYYY-MM-DD form. */
export type LocalDate = string;

export interface LocalTimeOfDay {
    readonly hour: number;
    readonly minute: number;
    readonly second?: number;
}

export const TradingSessionKind = Object.freeze({
    PreMarket: 'pre-market',
    Regular: 'regular',
    PostMarket: 'post-market',
} as const);

export type TradingSessionKind = typeof TradingSessionKind[keyof typeof TradingSessionKind];

/** One local-time session shape, reusable by weekly rules and date overrides. */
export interface TradingSessionTemplate {
    readonly id: string;
    readonly kind: TradingSessionKind;
    readonly open: LocalTimeOfDay;
    readonly close: LocalTimeOfDay;
    /** Explicitly places close on the opening day (0) or the following local day (1). */
    readonly closeDayOffset?: 0 | 1;
}

/** A recurring session whose weekday is the local date on which it opens. */
export interface TradingSessionRule extends TradingSessionTemplate {
    readonly weekdays: readonly IsoWeekday[];
}

/** Replaces every recurring session for one local trading date, e.g. an early close. */
export interface TradingDayOverride {
    readonly date: LocalDate;
    readonly sessions: readonly TradingSessionTemplate[];
}

export interface TradingSchedule {
    readonly id?: string;
    /** IANA timezone, for example America/New_York or Europe/Moscow. */
    readonly timeZone: string;
    readonly sessions: readonly TradingSessionRule[];
    /** Fully closed local trading dates. */
    readonly holidays?: readonly LocalDate[];
    /** Date-specific replacement sessions. */
    readonly overrides?: readonly TradingDayOverride[];
}

/** One concrete half-open UTC interval [openTime, closeTime). */
export interface TradingSession {
    readonly id: string;
    readonly ruleId: string;
    readonly kind: TradingSessionKind;
    readonly tradingDate: LocalDate;
    readonly openTime: Time;
    readonly closeTime: Time;
    readonly isOverride: boolean;
}

/** Immutable calendar boundary used by scale, shading and bar-clock features. */
export interface ITradingCalendar {
    schedule(): TradingSchedule;
    /** Returns sessions intersecting the half-open UTC range [from, to). */
    sessionsInRange(range: TimeRange, kinds?: readonly TradingSessionKind[]): readonly TradingSession[];
    sessionAt(time: Time, kinds?: readonly TradingSessionKind[]): TradingSession | null;
    isTradingTime(time: Time, kinds?: readonly TradingSessionKind[]): boolean;
    nextSession(time: Time, kinds?: readonly TradingSessionKind[]): TradingSession | null;
    previousSession(time: Time, kinds?: readonly TradingSessionKind[]): TradingSession | null;
}
