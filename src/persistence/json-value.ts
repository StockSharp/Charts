export type PersistedJsonValue = string | number | boolean | null
    | readonly PersistedJsonValue[]
    | PersistedObject;

export interface PersistedObject {
    readonly [key: string]: PersistedJsonValue;
}

export interface PersistedObjectNormalizationOptions {
    /** Omit undefined object properties. Undefined array items remain invalid. */
    readonly omitUndefined?: boolean;
}

/** Deep-clones JSON data into immutable, prototype-safe library state. */
export function normalizePersistedObject(
    value: unknown,
    path = 'value',
    options: PersistedObjectNormalizationOptions = {},
): PersistedObject {
    if (!plainObject(value))
        throw new TypeError(`sschart: persisted ${path} must be a plain object`);
    if (options.omitUndefined !== undefined && typeof options.omitUndefined !== 'boolean')
        throw new TypeError('sschart: persisted normalization omitUndefined must be boolean');
    return normalizeObject(value, path, new Set<object>(), 0, options.omitUndefined === true);
}

function normalizeValue(
    value: unknown,
    path: string,
    ancestors: Set<object>,
    depth: number,
    omitUndefined: boolean,
): PersistedJsonValue {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            throw new RangeError(`sschart: persisted ${path} number must be finite`);
        return value;
    }
    if (typeof value !== 'object')
        throw new TypeError(`sschart: persisted ${path} must be JSON-safe`);
    if (depth >= 100)
        throw new RangeError(`sschart: persisted ${path} exceeds the maximum nesting depth`);
    if (ancestors.has(value))
        throw new TypeError(`sschart: persisted ${path} cannot contain a cycle`);
    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            return Object.freeze(value.map((item, index) => (
                normalizeValue(item, `${path}[${index}]`, ancestors, depth + 1, omitUndefined)
            )));
        }
        if (!plainObject(value))
            throw new TypeError(`sschart: persisted ${path} must contain only plain objects`);
        return normalizeObject(value, path, ancestors, depth + 1, omitUndefined, true);
    } finally {
        ancestors.delete(value);
    }
}

function normalizeObject(
    value: Readonly<Record<string, unknown>>,
    path: string,
    ancestors: Set<object>,
    depth: number,
    omitUndefined: boolean,
    alreadyTracked = false,
): PersistedObject {
    if (!alreadyTracked) {
        if (ancestors.has(value))
            throw new TypeError(`sschart: persisted ${path} cannot contain a cycle`);
        ancestors.add(value);
    }
    try {
        const result: Record<string, PersistedJsonValue> = {};
        for (const [key, item] of Object.entries(value)) {
            if (item === undefined && omitUndefined) continue;
            if (key.length === 0)
                throw new TypeError(`sschart: persisted ${path} keys cannot be empty`);
            if (key === '__proto__' || key === 'prototype' || key === 'constructor')
                throw new TypeError(`sschart: persisted ${path}.${key} key is reserved`);
            result[key] = normalizeValue(item, `${path}.${key}`, ancestors, depth, omitUndefined);
        }
        return Object.freeze(result);
    } finally {
        if (!alreadyTracked) ancestors.delete(value);
    }
}

function plainObject(value: unknown): value is Readonly<Record<string, unknown>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
