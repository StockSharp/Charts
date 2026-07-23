import type { LineStyleValue } from '../core/chart-api.js';

/** Effective editor-facing appearance of one semantic indicator output. */
export interface IndicatorOutputAppearance {
    readonly color?: string;
    readonly lineWidth?: number;
    readonly lineStyle?: LineStyleValue;
    readonly visible: boolean;
    readonly precision?: number;
}

/** Fields accepted by a live output-style edit. Omitted fields stay unchanged. */
export interface IndicatorOutputStylePatch {
    readonly color?: string;
    /** Null clears an explicit width and returns to the renderer default. */
    readonly lineWidth?: number | null;
    /** Null clears an explicit dash style and returns to the renderer default. */
    readonly lineStyle?: LineStyleValue | null;
    readonly visible?: boolean;
    /** Null clears an explicit precision and returns to the series formatter. */
    readonly precision?: number | null;
}

/** Validates and freezes an editor supplied partial appearance. */
export function normalizeIndicatorOutputStylePatch(value: unknown): IndicatorOutputStylePatch {
    if (!plainObject(value))
        throw new TypeError('sschart: indicator output style patch must be an object');
    const allowed = new Set(['color', 'lineWidth', 'lineStyle', 'visible', 'precision']);
    for (const key of Object.keys(value)) {
        if (!allowed.has(key))
            throw new TypeError(`sschart: indicator output style '${key}' is unsupported`);
    }
    if (value.color !== undefined
        && (typeof value.color !== 'string' || value.color.trim().length === 0)) {
        throw new TypeError('sschart: indicator output color must be non-empty');
    }
    if (value.lineWidth !== undefined && value.lineWidth !== null
        && (typeof value.lineWidth !== 'number'
            || !Number.isFinite(value.lineWidth) || value.lineWidth <= 0)) {
        throw new RangeError('sschart: indicator output lineWidth must be positive');
    }
    if (value.lineStyle !== undefined && value.lineStyle !== null
        && (typeof value.lineStyle !== 'number'
            || !Number.isSafeInteger(value.lineStyle)
            || (value.lineStyle as number) < 0 || (value.lineStyle as number) > 4)) {
        throw new RangeError('sschart: indicator output lineStyle must be between 0 and 4');
    }
    if (value.visible !== undefined && typeof value.visible !== 'boolean')
        throw new TypeError('sschart: indicator output visible must be boolean');
    if (value.precision !== undefined && value.precision !== null
        && (typeof value.precision !== 'number'
            || !Number.isSafeInteger(value.precision)
            || (value.precision as number) < 0 || (value.precision as number) > 12)) {
        throw new RangeError('sschart: indicator output precision must be between 0 and 12');
    }
    return Object.freeze({
        ...(value.color === undefined ? {} : { color: (value.color as string).trim() }),
        ...(value.lineWidth === undefined
            ? {}
            : { lineWidth: value.lineWidth as number | null }),
        ...(value.lineStyle === undefined
            ? {}
            : { lineStyle: value.lineStyle as LineStyleValue | null }),
        ...(value.visible === undefined ? {} : { visible: value.visible as boolean }),
        ...(value.precision === undefined
            ? {}
            : { precision: value.precision as number | null }),
    });
}

function plainObject(value: unknown): value is Readonly<Record<string, unknown>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
