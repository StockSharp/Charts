import type {
    IndicatorOutputMetadata,
    IndicatorOutputMetadataValue,
} from './indicator-definition.js';

const reservedKeys = new Set(['time', 'value']);

/** Owns and validates metadata before it crosses a processor/runtime boundary. */
export function normalizeIndicatorOutputMetadata(
    value: IndicatorOutputMetadata | undefined,
    name: string,
): IndicatorOutputMetadata | undefined {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new TypeError(`sschart: ${name} must be a flat object`);

    const entries: Array<[string, IndicatorOutputMetadataValue]> = [];
    for (const [key, item] of Object.entries(value)) {
        if (key.length === 0 || key !== key.trim())
            throw new TypeError(`sschart: ${name} keys must be non-empty trimmed strings`);
        if (reservedKeys.has(key))
            throw new RangeError(`sschart: ${name} key '${key}' is reserved`);
        if (typeof item === 'number') {
            if (!Number.isFinite(item))
                throw new TypeError(`sschart: ${name}.${key} must be finite`);
        } else if (item !== null
            && typeof item !== 'string'
            && typeof item !== 'boolean') {
            throw new TypeError(`sschart: ${name}.${key} must be a primitive value`);
        }
        entries.push([key, item]);
    }
    return Object.freeze(Object.fromEntries(entries));
}

/** Structural equality keeps equal previews from producing redundant patches. */
export function sameIndicatorOutputMetadata(
    left: IndicatorOutputMetadata | undefined,
    right: IndicatorOutputMetadata | undefined,
): boolean {
    if (left === right) return true;
    if (left === undefined || right === undefined) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => (
        Object.prototype.hasOwnProperty.call(right, key) && left[key] === right[key]
    ));
}
