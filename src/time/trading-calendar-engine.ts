import type { Time, TimeRange } from '../core/chart-api.js';
import {
    TradingSessionKind,
    type ITradingCalendar,
    type IsoWeekday,
    type LocalDate,
    type LocalTimeOfDay,
    type TradingDayOverride,
    type TradingSchedule,
    type TradingSession,
    type TradingSessionKind as TradingSessionKindValue,
    type TradingSessionRule,
    type TradingSessionTemplate,
} from './trading-calendar.js';

const DAY_SECONDS = 86_400;
const SESSION_CACHE_CAPACITY = 1_024;
const SEARCH_CHUNK_DAYS = 32;
const MAX_SEARCH_DAYS = 366 * 10;
const VALID_KINDS = new Set<TradingSessionKindValue>(Object.values(TradingSessionKind));

interface LocalDateParts {
    readonly year: number;
    readonly month: number;
    readonly day: number;
}

interface LocalDateTimeParts extends LocalDateParts {
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
}

function nonEmpty(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: ${name} must be a non-empty string`);
    return value.trim();
}

function integerInRange(value: unknown, from: number, to: number, name: string): number {
    if (!Number.isInteger(value) || (value as number) < from || (value as number) > to)
        throw new RangeError(`sschart: ${name} must be an integer from ${from} to ${to}`);
    return value as number;
}

function normalizeTime(value: LocalTimeOfDay, name: string): LocalTimeOfDay {
    if (value === null || typeof value !== 'object')
        throw new TypeError(`sschart: ${name} is required`);
    return Object.freeze({
        hour: integerInRange(value.hour, 0, 23, `${name}.hour`),
        minute: integerInRange(value.minute, 0, 59, `${name}.minute`),
        second: integerInRange(value.second ?? 0, 0, 59, `${name}.second`),
    });
}

function secondsOfDay(value: LocalTimeOfDay): number {
    return value.hour * 3_600 + value.minute * 60 + (value.second ?? 0);
}

function normalizeTemplate(value: TradingSessionTemplate, name: string): TradingSessionTemplate {
    if (value === null || typeof value !== 'object')
        throw new TypeError(`sschart: ${name} is required`);
    if (!VALID_KINDS.has(value.kind))
        throw new TypeError(`sschart: ${name}.kind is invalid`);
    const open = normalizeTime(value.open, `${name}.open`);
    const close = normalizeTime(value.close, `${name}.close`);
    const closeDayOffset = integerInRange(value.closeDayOffset ?? 0, 0, 1, `${name}.closeDayOffset`) as 0 | 1;
    const duration = closeDayOffset * DAY_SECONDS + secondsOfDay(close) - secondsOfDay(open);
    if (!(duration > 0 && duration <= DAY_SECONDS))
        throw new RangeError(`sschart: ${name} must have a positive duration of at most 24 hours`);
    return Object.freeze({
        id: nonEmpty(value.id, `${name}.id`),
        kind: value.kind,
        open,
        close,
        closeDayOffset,
    });
}

function normalizeRule(value: TradingSessionRule, index: number): TradingSessionRule {
    const name = `tradingSchedule.sessions[${index}]`;
    const template = normalizeTemplate(value, name);
    if (!Array.isArray(value.weekdays) || value.weekdays.length === 0)
        throw new TypeError(`sschart: ${name}.weekdays must not be empty`);
    const weekdays = [...new Set(value.weekdays.map((weekday) => (
        integerInRange(weekday, 1, 7, `${name}.weekdays`) as IsoWeekday
    )))].sort((left, right) => left - right);
    return Object.freeze({ ...template, weekdays: Object.freeze(weekdays) });
}

function utcDate(parts: LocalDateTimeParts): Date {
    const value = new Date(0);
    value.setUTCFullYear(parts.year, parts.month - 1, parts.day);
    value.setUTCHours(parts.hour, parts.minute, parts.second, 0);
    return value;
}

function localEpoch(parts: LocalDateTimeParts): number {
    return utcDate(parts).getTime() / 1_000;
}

function dateOrdinal(parts: LocalDateParts): number {
    return localEpoch({ ...parts, hour: 0, minute: 0, second: 0 }) / DAY_SECONDS;
}

function dateFromOrdinal(ordinal: number): LocalDateParts {
    const value = new Date(ordinal * DAY_SECONDS * 1_000);
    return {
        year: value.getUTCFullYear(),
        month: value.getUTCMonth() + 1,
        day: value.getUTCDate(),
    };
}

function pad(value: number, width = 2): string {
    return String(value).padStart(width, '0');
}

function formatLocalDate(parts: LocalDateParts): LocalDate {
    return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
}

function parseLocalDate(value: unknown, name: string): LocalDate {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new TypeError(`sschart: ${name} must use YYYY-MM-DD`);
    const [year, month, day] = value.split('-').map(Number);
    const roundTrip = dateFromOrdinal(dateOrdinal({ year, month, day }));
    if (roundTrip.year !== year || roundTrip.month !== month || roundTrip.day !== day)
        throw new RangeError(`sschart: ${name} is not a valid calendar date`);
    return value;
}

function normalizeOverride(value: TradingDayOverride, index: number): TradingDayOverride {
    const name = `tradingSchedule.overrides[${index}]`;
    if (value === null || typeof value !== 'object')
        throw new TypeError(`sschart: ${name} is required`);
    if (!Array.isArray(value.sessions) || value.sessions.length === 0)
        throw new TypeError(`sschart: ${name}.sessions must not be empty`);
    const sessions = value.sessions.map((session, sessionIndex) => (
        normalizeTemplate(session, `${name}.sessions[${sessionIndex}]`)
    ));
    assertUniqueIds(sessions, `${name}.sessions`);
    assertNonOverlapping(sessions, `${name}.sessions`);
    return Object.freeze({
        date: parseLocalDate(value.date, `${name}.date`),
        sessions: Object.freeze(sessions),
    });
}

function assertUniqueIds(values: readonly TradingSessionTemplate[], name: string): void {
    const ids = new Set<string>();
    for (const value of values) {
        if (ids.has(value.id)) throw new TypeError(`sschart: ${name} contains duplicate id ${value.id}`);
        ids.add(value.id);
    }
}

function assertNonOverlapping(values: readonly TradingSessionTemplate[], name: string): void {
    const intervals = values.map((value) => ({
        id: value.id,
        from: secondsOfDay(value.open),
        to: (value.closeDayOffset ?? 0) * DAY_SECONDS + secondsOfDay(value.close),
    })).sort((left, right) => left.from - right.from || left.to - right.to);
    for (let index = 1; index < intervals.length; index += 1) {
        if (intervals[index].from < intervals[index - 1].to)
            throw new RangeError(`sschart: ${name} sessions ${intervals[index - 1].id} and ${intervals[index].id} overlap`);
    }
}

function assertWeeklyNonOverlapping(rules: readonly TradingSessionRule[]): void {
    const intervals: Array<{ id: string; from: number; to: number }> = [];
    for (let week = -1; week <= 1; week += 1) {
        for (const rule of rules) {
            for (const weekday of rule.weekdays) {
                const dayStart = (week * 7 + weekday - 1) * DAY_SECONDS;
                intervals.push({
                    id: rule.id,
                    from: dayStart + secondsOfDay(rule.open),
                    to: dayStart + (rule.closeDayOffset ?? 0) * DAY_SECONDS + secondsOfDay(rule.close),
                });
            }
        }
    }
    intervals.sort((left, right) => left.from - right.from || left.to - right.to);
    for (let index = 1; index < intervals.length; index += 1) {
        if (intervals[index].from < intervals[index - 1].to)
            throw new RangeError(
                `sschart: tradingSchedule sessions ${intervals[index - 1].id} and ${intervals[index].id} overlap`,
            );
    }
}

function normalizeTimeZone(value: unknown): string {
    const requested = nonEmpty(value, 'tradingSchedule.timeZone');
    try {
        return new Intl.DateTimeFormat('en-US', { timeZone: requested }).resolvedOptions().timeZone;
    } catch {
        throw new RangeError(`sschart: invalid IANA timezone ${requested}`);
    }
}

function normalizeSchedule(value: TradingSchedule): TradingSchedule {
    if (value === null || typeof value !== 'object')
        throw new TypeError('sschart: tradingSchedule is required');
    if (!Array.isArray(value.sessions) || value.sessions.length === 0)
        throw new TypeError('sschart: tradingSchedule.sessions must not be empty');
    const sessions = value.sessions.map(normalizeRule);
    assertUniqueIds(sessions, 'tradingSchedule.sessions');
    assertWeeklyNonOverlapping(sessions);

    const holidays = (value.holidays ?? []).map((date, index) => (
        parseLocalDate(date, `tradingSchedule.holidays[${index}]`)
    ));
    if (new Set(holidays).size !== holidays.length)
        throw new TypeError('sschart: tradingSchedule.holidays contains duplicate dates');
    holidays.sort();

    const overrides = (value.overrides ?? []).map(normalizeOverride);
    const overrideDates = new Set<string>();
    for (const override of overrides) {
        if (overrideDates.has(override.date))
            throw new TypeError(`sschart: tradingSchedule.overrides contains duplicate date ${override.date}`);
        if (holidays.includes(override.date))
            throw new TypeError(`sschart: ${override.date} cannot be both a holiday and an override`);
        overrideDates.add(override.date);
    }
    overrides.sort((left, right) => left.date.localeCompare(right.date));

    const normalized: TradingSchedule = {
        timeZone: normalizeTimeZone(value.timeZone),
        sessions: Object.freeze(sessions),
        holidays: Object.freeze(holidays),
        overrides: Object.freeze(overrides),
    };
    if (value.id !== undefined) (normalized as { id?: string }).id = nonEmpty(value.id, 'tradingSchedule.id');
    return Object.freeze(normalized);
}

function normalizeRange(value: TimeRange): TimeRange {
    if (value === null || typeof value !== 'object'
        || !Number.isFinite(value.from) || !Number.isFinite(value.to) || !(value.to > value.from)) {
        throw new RangeError('sschart: trading calendar range must be finite and increasing');
    }
    return value;
}

function normalizeTimeValue(value: Time): Time {
    if (!Number.isFinite(value)) throw new RangeError('sschart: trading calendar time must be finite');
    return value;
}

function normalizeKinds(values: readonly TradingSessionKindValue[] | undefined): ReadonlySet<TradingSessionKindValue> | null {
    if (values === undefined) return null;
    if (!Array.isArray(values)) throw new TypeError('sschart: trading session kinds must be an array');
    const result = new Set<TradingSessionKindValue>();
    for (const value of values) {
        if (!VALID_KINDS.has(value)) throw new TypeError(`sschart: invalid trading session kind ${String(value)}`);
        result.add(value);
    }
    return result;
}

function matchesKinds(session: TradingSession, kinds: ReadonlySet<TradingSessionKindValue> | null): boolean {
    return kinds === null || kinds.has(session.kind);
}

/** IANA/DST-aware materializer for recurring exchange sessions. */
export class TradingCalendar implements ITradingCalendar {
    private readonly scheduleValue: TradingSchedule;
    private readonly formatter: Intl.DateTimeFormat;
    private readonly holidays: ReadonlySet<LocalDate>;
    private readonly overrides: ReadonlyMap<LocalDate, TradingDayOverride>;
    private readonly sessionCache = new Map<LocalDate, readonly TradingSession[]>();
    private readonly offsetCache = new Map<LocalDate, readonly number[]>();

    constructor(schedule: TradingSchedule) {
        this.scheduleValue = normalizeSchedule(schedule);
        this.formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
            timeZone: this.scheduleValue.timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        });
        this.holidays = new Set(this.scheduleValue.holidays);
        this.overrides = new Map(this.scheduleValue.overrides?.map((override) => [override.date, override]));
    }

    schedule(): TradingSchedule {
        return this.scheduleValue;
    }

    sessionsInRange(range: TimeRange, kinds?: readonly TradingSessionKindValue[]): readonly TradingSession[] {
        const normalized = normalizeRange(range);
        const kindSet = normalizeKinds(kinds);
        if (kindSet?.size === 0) return Object.freeze([]);

        const firstDate = this.localDateAt(normalized.from);
        const lastDate = this.localDateAt(normalized.to);
        const firstOrdinal = dateOrdinal(firstDate) - 1;
        const lastOrdinal = dateOrdinal(lastDate);
        const result: TradingSession[] = [];
        for (let ordinal = firstOrdinal; ordinal <= lastOrdinal; ordinal += 1) {
            const date = formatLocalDate(dateFromOrdinal(ordinal));
            for (const session of this.sessionsForDate(date)) {
                if (session.closeTime > normalized.from
                    && session.openTime < normalized.to) {
                    result.push(session);
                }
            }
        }
        result.sort((left, right) => left.openTime - right.openTime
            || left.closeTime - right.closeTime
            || left.id.localeCompare(right.id));
        for (let index = 1; index < result.length; index += 1) {
            if (result[index].openTime < result[index - 1].closeTime) {
                throw new RangeError(
                    `sschart: trading sessions ${result[index - 1].id} and ${result[index].id} overlap in UTC`,
                );
            }
        }
        return Object.freeze(kindSet === null ? result : result.filter((session) => matchesKinds(session, kindSet)));
    }

    sessionAt(time: Time, kinds?: readonly TradingSessionKindValue[]): TradingSession | null {
        const value = normalizeTimeValue(time);
        const kindSet = normalizeKinds(kinds);
        if (kindSet?.size === 0) return null;
        const candidates = this.sessionsInRange({ from: value - DAY_SECONDS * 2, to: value + 1 }, kinds);
        return candidates.find((session) => (
            session.openTime <= value && value < session.closeTime && matchesKinds(session, kindSet)
        )) ?? null;
    }

    isTradingTime(time: Time, kinds?: readonly TradingSessionKindValue[]): boolean {
        return this.sessionAt(time, kinds) !== null;
    }

    nextSession(time: Time, kinds?: readonly TradingSessionKindValue[]): TradingSession | null {
        const value = normalizeTimeValue(time);
        if (normalizeKinds(kinds)?.size === 0) return null;
        for (let days = 0; days < MAX_SEARCH_DAYS; days += SEARCH_CHUNK_DAYS) {
            const from = value + days * DAY_SECONDS;
            const to = value + Math.min(days + SEARCH_CHUNK_DAYS, MAX_SEARCH_DAYS) * DAY_SECONDS;
            const found = this.sessionsInRange({ from, to }, kinds).find((session) => session.openTime >= value);
            if (found !== undefined) return found;
        }
        return null;
    }

    previousSession(time: Time, kinds?: readonly TradingSessionKindValue[]): TradingSession | null {
        const value = normalizeTimeValue(time);
        if (normalizeKinds(kinds)?.size === 0) return null;
        for (let days = 0; days < MAX_SEARCH_DAYS; days += SEARCH_CHUNK_DAYS) {
            const from = value - Math.min(days + SEARCH_CHUNK_DAYS, MAX_SEARCH_DAYS) * DAY_SECONDS;
            const to = value - days * DAY_SECONDS + 1;
            const candidates = this.sessionsInRange({ from, to }, kinds)
                .filter((session) => session.closeTime <= value);
            if (candidates.length > 0) return candidates[candidates.length - 1];
        }
        return null;
    }

    private sessionsForDate(date: LocalDate): readonly TradingSession[] {
        const cached = this.sessionCache.get(date);
        if (cached !== undefined) {
            this.sessionCache.delete(date);
            this.sessionCache.set(date, cached);
            return cached;
        }

        let result: readonly TradingSession[];
        if (this.holidays.has(date)) {
            result = Object.freeze([]);
        } else {
            const override = this.overrides.get(date);
            const dateParts = this.parseDate(date);
            const templates = override?.sessions ?? this.scheduleValue.sessions.filter((rule) => (
                rule.weekdays.includes(this.isoWeekday(dateParts))
            ));
            result = Object.freeze(templates.map((template) => (
                this.materialize(date, dateParts, template, override !== undefined)
            )));
        }

        this.sessionCache.set(date, result);
        if (this.sessionCache.size > SESSION_CACHE_CAPACITY) {
            const oldest = this.sessionCache.keys().next().value as LocalDate | undefined;
            if (oldest !== undefined) this.sessionCache.delete(oldest);
        }
        return result;
    }

    private materialize(
        date: LocalDate,
        dateParts: LocalDateParts,
        template: TradingSessionTemplate,
        isOverride: boolean,
    ): TradingSession {
        const closeDate = dateFromOrdinal(dateOrdinal(dateParts) + (template.closeDayOffset ?? 0));
        const openTime = this.toUtc({
            ...dateParts,
            hour: template.open.hour,
            minute: template.open.minute,
            second: template.open.second ?? 0,
        }, 'earlier');
        const closeTime = this.toUtc({
            ...closeDate,
            hour: template.close.hour,
            minute: template.close.minute,
            second: template.close.second ?? 0,
        }, 'later');
        if (!(closeTime > openTime))
            throw new RangeError(`sschart: trading session ${template.id} on ${date} has no UTC duration`);
        return Object.freeze({
            id: `${date}/${template.id}`,
            ruleId: template.id,
            kind: template.kind,
            tradingDate: date,
            openTime,
            closeTime,
            isOverride,
        });
    }

    private localDateAt(time: Time): LocalDateParts {
        const parts = this.localParts(time);
        return { year: parts.year, month: parts.month, day: parts.day };
    }

    private parseDate(value: LocalDate): LocalDateParts {
        const [year, month, day] = value.split('-').map(Number);
        return { year, month, day };
    }

    private isoWeekday(value: LocalDateParts): IsoWeekday {
        const weekday = new Date(dateOrdinal(value) * DAY_SECONDS * 1_000).getUTCDay();
        return (weekday === 0 ? 7 : weekday) as IsoWeekday;
    }

    private localParts(time: Time): LocalDateTimeParts {
        const values = new Map(this.formatter.formatToParts(new Date(Math.floor(time) * 1_000))
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, Number(part.value)]));
        const result: LocalDateTimeParts = {
            year: values.get('year') as number,
            month: values.get('month') as number,
            day: values.get('day') as number,
            hour: values.get('hour') as number,
            minute: values.get('minute') as number,
            second: values.get('second') as number,
        };
        if (Object.values(result).some((part) => !Number.isInteger(part)))
            throw new RangeError('sschart: Intl returned invalid timezone parts');
        return result;
    }

    private toUtc(value: LocalDateTimeParts, disambiguation: 'earlier' | 'later'): Time {
        const wanted = localEpoch(value);
        const candidates = this.offsetsForDate(value)
            .map((offset) => wanted - offset)
            .filter((candidate) => {
                const actual = this.localParts(candidate);
                return actual.year === value.year
                    && actual.month === value.month
                    && actual.day === value.day
                    && actual.hour === value.hour
                    && actual.minute === value.minute
                    && actual.second === value.second;
            })
            .sort((left, right) => left - right);
        if (candidates.length === 0) {
            throw new RangeError(
                `sschart: ${formatLocalDate(value)} ${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}`
                + ` does not exist in ${this.scheduleValue.timeZone}`,
            );
        }
        return disambiguation === 'earlier' ? candidates[0] : candidates[candidates.length - 1];
    }

    private offsetsForDate(value: LocalDateParts): readonly number[] {
        const date = formatLocalDate(value);
        const cached = this.offsetCache.get(date);
        if (cached !== undefined) {
            this.offsetCache.delete(date);
            this.offsetCache.set(date, cached);
            return cached;
        }

        const localNoon = localEpoch({ ...value, hour: 12, minute: 0, second: 0 });
        const offsets = Object.freeze([...new Set([-36, 0, 36].map((hours) => {
            const sample = localNoon + hours * 3_600;
            return localEpoch(this.localParts(sample)) - sample;
        }))].sort((left, right) => left - right));
        this.offsetCache.set(date, offsets);
        if (this.offsetCache.size > SESSION_CACHE_CAPACITY) {
            const oldest = this.offsetCache.keys().next().value as LocalDate | undefined;
            if (oldest !== undefined) this.offsetCache.delete(oldest);
        }
        return offsets;
    }
}
