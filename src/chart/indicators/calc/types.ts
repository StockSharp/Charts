// Shared shapes for the indicator calc functions.
//
// Every calc in this directory takes the same pair — a candle series and a loosely typed
// parameter bag — and returns either one line of points or a named set of lines. They used to
// declare that only in JSDoc, which the compiler never saw because src/chart was outside the
// type-check project; the same four typedefs were then copy-pasted into ~160 files. Declaring
// them once here is what lets the whole directory be checked without an implicit any.

/** One input bar. `time` is whatever the caller keys bars by — UNIX seconds or an ISO string. */
export interface CandlePoint {
    time: string | number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

/** One output point, aligned 1:1 with the input bar at the same index. */
export interface IndicatorPoint {
    time: string | number;
    value: number | null;
}

/**
 * Parameters as they arrive from the catalog. The key set is indicator-specific and the values
 * are whatever the settings UI produced, so the index signature is deliberately `any`: each calc
 * validates the keys it cares about itself (`Number.isFinite(params.x) ? ... : <default>`).
 * That is an explicit any, not an implicit one — narrowing it to `unknown` would only push a
 * cast into all ~160 calls without making any of them safer.
 */
// `length` is NOT declared explicitly here even though nearly every calc reads it. Declaring it
// as `number | undefined` would break the directory's universal idiom
//     params && Number.isFinite(params.length) ? (params.length | 0) : <default>
// because Number.isFinite is typed `(n: unknown) => boolean` rather than a type guard, so it
// narrows nothing and the `| 0` then trips TS18048. That would force a non-null assertion into
// ~100 files to buy no safety at all. Letting `length` go through the index signature keeps it
// consistent with every other parameter name.
export interface IndicatorParams {
    [key: string]: any;
}

/** A multi-output calc returns one named array per line. */
export type IndicatorLines = Record<string, IndicatorPoint[]>;
