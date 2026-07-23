import type { Time } from '../core/chart-api.js';

export type DrawingJsonValue = string | number | boolean | null
    | readonly DrawingJsonValue[]
    | { readonly [key: string]: DrawingJsonValue };

export type DrawingOptions = Readonly<Record<string, DrawingJsonValue>>;

export interface DrawingPoint {
    readonly time: Time;
    readonly price: number;
}

/** Pure persisted drawing state. It deliberately contains no runtime objects. */
export interface DrawingInstance<TOptions extends DrawingOptions = DrawingOptions> {
    readonly id: string;
    readonly type: string;
    readonly paneId: string;
    readonly points: readonly DrawingPoint[];
    readonly options: TOptions;
    readonly visible: boolean;
    readonly locked: boolean;
    readonly zOrder: number;
}

export function normalizeDrawingInstance<TOptions extends DrawingOptions = DrawingOptions>(
    value: DrawingInstance<TOptions>,
): DrawingInstance<TOptions> {
    if (value === null || typeof value !== 'object')
        throw new TypeError('sschart: drawing instance must be an object');
    const id = identifier(value.id, 'id');
    const type = identifier(value.type, 'type');
    const paneId = identifier(value.paneId, 'paneId');
    if (!Array.isArray(value.points))
        throw new TypeError('sschart: drawing points must be an array');
    const points = Object.freeze(value.points.map((item, index) => point(item, index)));
    const options = normalizeDrawingOptions(value.options) as TOptions;
    if (typeof value.visible !== 'boolean')
        throw new TypeError('sschart: drawing visible must be boolean');
    if (typeof value.locked !== 'boolean')
        throw new TypeError('sschart: drawing locked must be boolean');
    if (!Number.isSafeInteger(value.zOrder))
        throw new RangeError('sschart: drawing zOrder must be a safe integer');
    return Object.freeze({
        id,
        type,
        paneId,
        points,
        options,
        visible: value.visible,
        locked: value.locked,
        zOrder: value.zOrder,
    });
}

export function normalizeDrawingOptions(value: DrawingOptions): DrawingOptions {
    if (!plainObject(value))
        throw new TypeError('sschart: drawing options must be a plain object');
    return cloneObject(value, 'options', new Set<object>());
}

function point(value: DrawingPoint, index: number): DrawingPoint {
    if (value === null || typeof value !== 'object')
        throw new TypeError(`sschart: drawing point ${index} must be an object`);
    if (typeof value.time !== 'number' || !Number.isFinite(value.time))
        throw new RangeError(`sschart: drawing point ${index} time must be finite`);
    if (typeof value.price !== 'number' || !Number.isFinite(value.price))
        throw new RangeError(`sschart: drawing point ${index} price must be finite`);
    return Object.freeze({ time: value.time, price: value.price });
}

function identifier(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: drawing ${name} must be a non-empty string`);
    return value.trim();
}

function cloneJson(
    value: DrawingJsonValue,
    path: string,
    ancestors: Set<object>,
): DrawingJsonValue {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            throw new RangeError(`sschart: drawing ${path} number must be finite`);
        return value;
    }
    if (typeof value !== 'object')
        throw new TypeError(`sschart: drawing ${path} must be JSON-safe`);
    if (Array.isArray(value)) {
        if (ancestors.has(value))
            throw new TypeError(`sschart: drawing ${path} cannot contain a cycle`);
        ancestors.add(value);
        try {
            return Object.freeze(value.map((item, index) => (
                cloneJson(item, `${path}[${index}]`, ancestors)
            )));
        } finally {
            ancestors.delete(value);
        }
    }
    if (!plainObject(value))
        throw new TypeError(`sschart: drawing ${path} must contain only plain objects`);
    return cloneObject(value, path, ancestors);
}

function cloneObject(
    value: Readonly<Record<string, DrawingJsonValue>>,
    path: string,
    ancestors: Set<object>,
): DrawingOptions {
    if (ancestors.has(value))
        throw new TypeError(`sschart: drawing ${path} cannot contain a cycle`);
    ancestors.add(value);
    try {
        const result: Record<string, DrawingJsonValue> = {};
        for (const [key, item] of Object.entries(value)) {
            if (key.length === 0)
                throw new TypeError(`sschart: drawing ${path} option keys cannot be empty`);
            if (key === '__proto__' || key === 'prototype' || key === 'constructor')
                throw new TypeError(`sschart: drawing ${path}.${key} option key is reserved`);
            result[key] = cloneJson(item, `${path}.${key}`, ancestors);
        }
        return Object.freeze(result);
    } finally {
        ancestors.delete(value);
    }
}

function plainObject(value: unknown): value is Readonly<Record<string, DrawingJsonValue>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
