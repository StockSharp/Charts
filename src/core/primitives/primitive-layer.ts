import { PrimitiveZOrder, type PrimitiveZOrder as PrimitiveZOrderValue } from './primitive-api.js';

const RANK: Readonly<Record<PrimitiveZOrderValue, number>> = Object.freeze({
    [PrimitiveZOrder.Background]: 0,
    [PrimitiveZOrder.Bottom]: 1,
    [PrimitiveZOrder.Normal]: 2,
    [PrimitiveZOrder.Top]: 3,
});

export const primitiveLayerOrder: readonly PrimitiveZOrderValue[] = Object.freeze([
    PrimitiveZOrder.Background,
    PrimitiveZOrder.Bottom,
    PrimitiveZOrder.Normal,
    PrimitiveZOrder.Top,
]);

export function primitiveLayerRank(value: PrimitiveZOrderValue): number {
    const rank = RANK[value];
    if (rank === undefined) throw new Error(`sschart: unsupported primitive z-order '${String(value)}'`);
    return rank;
}

/** Stable layer ordering: attachment order is retained inside the same layer. */
export function sortPrimitiveLayers<T>(
    values: readonly T[],
    zOrder: (value: T) => PrimitiveZOrderValue,
): T[] {
    return values
        .map((value, index) => ({ value, index, rank: primitiveLayerRank(zOrder(value)) }))
        .sort((left, right) => left.rank - right.rank || left.index - right.index)
        .map((entry) => entry.value);
}
