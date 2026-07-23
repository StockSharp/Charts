import { IndicatorPatchOperation } from '../../../indicators/indicator-runtime.js';
import type { IndicatorRuntimePoint } from '../../../indicators/indicator-runtime.js';
import type { IndicatorPainterPatchContext } from './indicator-painter.js';

export interface RuntimePatchSeriesMapping {
    readonly outputId: string;
    readonly seriesIndex: number;
    readonly historyId?: string;
    data(point: IndicatorRuntimePoint): any;
}

/** Applies a one-output-per-series patch after validating every affected tail. */
export function applyMappedRuntimePatch(
    context: IndicatorPainterPatchContext,
    series: any[],
    mappings: readonly RuntimePatchSeriesMapping[],
): boolean {
    const byOutput = new Map(mappings.map((mapping) => [mapping.outputId, mapping]));
    if (byOutput.size !== mappings.length) return false;
    const histories = context.entry._runtimeTailHistory
        || (context.entry._runtimeTailHistory = {});
    const grouped = new Map<RuntimePatchSeriesMapping, typeof context.patch.operations>();
    for (const operation of context.patch.operations) {
        const mapping = byOutput.get(operation.outputId);
        if (!mapping || !series[mapping.seriesIndex]) return false;
        const list = grouped.get(mapping) || [];
        grouped.set(mapping, [...list, operation]);
    }

    const nextHistories = new Map<RuntimePatchSeriesMapping, Array<{
        targetIndex: number;
        time: number;
    }>>();
    for (const [mapping, operations] of grouped) {
        const historyId = mapping.historyId || mapping.outputId;
        const history = [...(histories[historyId] || [])];
        for (const operation of operations) {
            const tail = history[history.length - 1] || null;
            const point = operation.point;
            if (operation.operation === IndicatorPatchOperation.Append) {
                if (!point || point.time === null
                    || (tail && (point.targetIndex <= tail.targetIndex || point.time <= tail.time))) {
                    return false;
                }
                history.push({ targetIndex: point.targetIndex, time: point.time });
            } else if (operation.operation === IndicatorPatchOperation.Replace) {
                if (!point || point.time === null || !tail
                    || point.targetIndex !== tail.targetIndex || point.time !== tail.time) {
                    return false;
                }
            } else {
                if (!tail || operation.targetIndex !== tail.targetIndex) return false;
                history.pop();
            }
        }
        const target = series[mapping.seriesIndex];
        if (operations.some((operation) => operation.operation === IndicatorPatchOperation.Remove)) {
            if (typeof target.pop !== 'function') return false;
        }
        if (operations.some((operation) => operation.operation !== IndicatorPatchOperation.Remove)) {
            if (typeof target.update !== 'function') return false;
        }
        nextHistories.set(mapping, history);
    }

    for (const [mapping, operations] of grouped) {
        const target = series[mapping.seriesIndex];
        for (const operation of operations) {
            if (operation.operation === IndicatorPatchOperation.Remove)
                target.pop(1);
            else target.update(mapping.data(operation.point!));
        }
        histories[mapping.historyId || mapping.outputId] = nextHistories.get(mapping) || [];
    }
    return true;
}

export function valuePoint(point: IndicatorRuntimePoint): any {
    return { ...point.metadata, time: point.time, value: point.value };
}
