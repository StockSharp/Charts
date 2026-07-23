import type { Time } from '../core/chart-api.js';

export const TimeScaleLabelKind = Object.freeze({
    Tick: 'tick',
    Crosshair: 'crosshair',
} as const);

export type TimeScaleLabelKind = typeof TimeScaleLabelKind[keyof typeof TimeScaleLabelKind];

export interface TimeScaleFormatContext {
    readonly kind: TimeScaleLabelKind;
    readonly locale: string;
    readonly timeZone: string;
    readonly timeVisible: boolean;
    readonly secondsVisible: boolean;
    readonly tickStep: number | null;
}

export type TimeScaleFormatter = (time: Time, context: TimeScaleFormatContext) => string;

export interface TimeAxisFormatterOptions {
    readonly locale?: string;
    readonly timeZone?: string;
    readonly timeVisible?: boolean;
    readonly secondsVisible?: boolean;
    readonly formatter?: TimeScaleFormatter;
}

interface LocalDateParts {
    readonly year: number;
    readonly month: number;
    readonly day: number;
}

const DEFAULT_LOCALE = 'en-GB';
const DEFAULT_TIME_ZONE = 'UTC';

function normalizeLocale(value: string | undefined): string {
    const locale = value?.trim() || DEFAULT_LOCALE;
    try {
        return new Intl.DateTimeFormat(locale).resolvedOptions().locale;
    } catch {
        throw new RangeError(`sschart: invalid timeScale locale ${locale}`);
    }
}

function normalizeTimeZone(value: string | undefined): string {
    const timeZone = value?.trim() || DEFAULT_TIME_ZONE;
    try {
        return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone;
    } catch {
        throw new RangeError(`sschart: invalid timeScale IANA timezone ${timeZone}`);
    }
}

function validTime(value: Time): Date {
    if (!Number.isFinite(value)) throw new RangeError('sschart: time formatter value must be finite');
    const date = new Date(value * 1_000);
    if (!Number.isFinite(date.getTime())) throw new RangeError('sschart: time formatter value is outside Date range');
    return date;
}

/** Cached Intl formatter shared by time-axis ticks and crosshair labels. */
export class TimeAxisFormatter {
    readonly locale: string;
    readonly timeZone: string;
    private readonly timeVisible: boolean;
    private readonly secondsVisible: boolean;
    private readonly custom: TimeScaleFormatter | undefined;
    private readonly formatters = new Map<string, Intl.DateTimeFormat>();
    private readonly partsFormatter: Intl.DateTimeFormat;

    constructor(options: TimeAxisFormatterOptions = {}) {
        if (options === null || typeof options !== 'object')
            throw new TypeError('sschart: time axis formatter options must be an object');
        if (options.formatter !== undefined && typeof options.formatter !== 'function')
            throw new TypeError('sschart: time axis formatter callback must be a function');
        this.locale = normalizeLocale(options.locale);
        this.timeZone = normalizeTimeZone(options.timeZone);
        this.timeVisible = options.timeVisible === true;
        this.secondsVisible = options.secondsVisible === true;
        this.custom = options.formatter;
        this.partsFormatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
            timeZone: this.timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    }

    formatCrosshair(time: Time): string {
        validTime(time);
        const custom = this.tryCustom(time, TimeScaleLabelKind.Crosshair, null);
        if (custom !== null) return custom;
        const options: Intl.DateTimeFormatOptions = {
            timeZone: this.timeZone,
            year: '2-digit',
            month: 'short',
            day: 'numeric',
        };
        if (this.timeVisible) {
            options.hour = '2-digit';
            options.minute = '2-digit';
            options.hourCycle = 'h23';
            if (this.secondsVisible) options.second = '2-digit';
        }
        return this.format('crosshair', options, time);
    }

    formatTick(time: Time, step: number): string {
        validTime(time);
        if (!Number.isFinite(step) || !(step > 0))
            throw new RangeError('sschart: time tick step must be positive and finite');
        const custom = this.tryCustom(time, TimeScaleLabelKind.Tick, step);
        if (custom !== null) return custom;
        const parts = this.localDateParts(time);
        if (step >= 15_552_000) {
            return this.format('year', { timeZone: this.timeZone, year: 'numeric' }, time);
        }
        if (step >= 2_592_000) {
            return parts.month === 1
                ? this.format('year', { timeZone: this.timeZone, year: 'numeric' }, time)
                : this.format('month', { timeZone: this.timeZone, month: 'short' }, time);
        }
        if (step >= 86_400) {
            return parts.day <= step / 86_400
                ? this.format('month', { timeZone: this.timeZone, month: 'short' }, time)
                : this.format('day', { timeZone: this.timeZone, day: 'numeric' }, time);
        }
        return this.format('time', {
            timeZone: this.timeZone,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
            ...(this.secondsVisible && step < 60 ? { second: '2-digit' } : {}),
        }, time);
    }

    private tryCustom(time: Time, kind: TimeScaleLabelKind, tickStep: number | null): string | null {
        if (this.custom === undefined) return null;
        const context: TimeScaleFormatContext = Object.freeze({
            kind,
            locale: this.locale,
            timeZone: this.timeZone,
            timeVisible: this.timeVisible,
            secondsVisible: this.secondsVisible,
            tickStep,
        });
        try {
            const value = this.custom(time, context);
            return typeof value === 'string' ? value : null;
        } catch {
            return null;
        }
    }

    private format(key: string, options: Intl.DateTimeFormatOptions, time: Time): string {
        let formatter = this.formatters.get(key);
        if (formatter === undefined) {
            formatter = new Intl.DateTimeFormat(this.locale, options);
            this.formatters.set(key, formatter);
        }
        return formatter.format(validTime(time));
    }

    private localDateParts(time: Time): LocalDateParts {
        const values = new Map(this.partsFormatter.formatToParts(validTime(time))
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, Number(part.value)]));
        return {
            year: values.get('year') as number,
            month: values.get('month') as number,
            day: values.get('day') as number,
        };
    }
}
