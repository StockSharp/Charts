import {
    PrimitiveHitTestRole,
    type IChartPrimitive,
    type PrimitiveHit,
    type PrimitiveInteractionOptions,
    type PrimitiveHitTestRole as PrimitiveHitTestRoleValue,
    type PrimitiveZOrder,
} from '../primitives/primitive-api.js';
import { primitiveLayerRank } from '../primitives/primitive-layer.js';

export interface HitTestCandidate {
    readonly primitive: IChartPrimitive;
    readonly attachmentOrder: number;
    readonly zOrder: PrimitiveZOrder;
    readonly test: () => PrimitiveHit | null;
}

export interface PrimitiveHitTestResult {
    readonly primitive: IChartPrimitive;
    readonly id: string;
    readonly role: PrimitiveHitTestRoleValue;
    readonly cursor: string;
    readonly zOrder: PrimitiveZOrder;
    readonly data: unknown;
    readonly interaction: Readonly<Required<PrimitiveInteractionOptions>>;
}

interface RankedHit extends PrimitiveHitTestResult {
    readonly rank: number;
    readonly attachmentOrder: number;
}

const ROLES = new Set<PrimitiveHitTestRoleValue>(Object.values(PrimitiveHitTestRole));

/** Resolves one hit in exact reverse paint order. */
export class HitTestEngine {
    hitTest(candidates: readonly HitTestCandidate[]): PrimitiveHitTestResult | null {
        const hits: RankedHit[] = [];
        for (const candidate of candidates) {
            let hit: PrimitiveHit | null;
            try { hit = candidate.test(); } catch { continue; }
            if (hit === null || typeof hit.id !== 'string' || hit.id.length === 0
                || !ROLES.has(hit.role)) continue;
            const zOrder = hit.zOrder ?? candidate.zOrder;
            let rank: number;
            try { rank = primitiveLayerRank(zOrder); } catch { continue; }
            hits.push({
                primitive: candidate.primitive,
                id: hit.id,
                role: hit.role,
                cursor: validCursor(hit.cursor) ?? defaultCursor(hit.role),
                zOrder,
                data: hit.data,
                interaction: normalizeInteraction(hit.interaction),
                rank,
                attachmentOrder: candidate.attachmentOrder,
            });
        }
        hits.sort((left, right) =>
            right.rank - left.rank || right.attachmentOrder - left.attachmentOrder);
        const first = hits[0];
        if (first === undefined) return null;
        const { rank: _rank, attachmentOrder: _order, ...result } = first;
        return Object.freeze(result);
    }
}

function normalizeInteraction(
    interaction: PrimitiveInteractionOptions | undefined,
): Readonly<Required<PrimitiveInteractionOptions>> {
    const draggable = interaction?.draggable === true;
    const selectable = interaction?.selectable === true || draggable;
    return Object.freeze({
        selectable,
        draggable,
        consumePointer: interaction?.consumePointer === true || selectable || draggable,
    });
}

function validCursor(cursor: string | undefined): string | null {
    if (cursor === undefined) return null;
    const normalized = cursor.trim();
    return normalized.length === 0 ? null : normalized;
}

function defaultCursor(role: PrimitiveHitTestRoleValue): string {
    return role === PrimitiveHitTestRole.Body ? 'move' : 'pointer';
}
