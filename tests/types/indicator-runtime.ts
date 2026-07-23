import {
    IndicatorRuntime,
    type IndicatorCandle,
    type IndicatorDefinition,
    type IndicatorParameters,
    type IndicatorRuntimePatch,
    type IndicatorOutputDefinition,
    type IndicatorRuntimePoint,
    type IndicatorRuntimeSnapshot,
} from '../../src/index.js';

declare const definition: IndicatorDefinition<IndicatorCandle, IndicatorParameters>;
const runtime = new IndicatorRuntime({ definition, parameters: {}, checkpointInterval: 128 });
const patch: IndicatorRuntimePatch = runtime.update({
    time: 1,
    value: { time: 1, open: 1, high: 2, low: 0, close: 1 },
}, false);
const outputs: readonly IndicatorOutputDefinition[] = runtime.outputs;
const points: readonly IndicatorRuntimePoint[] = runtime.points();
const metadataUp: string | number | boolean | null | undefined = points[0].metadata?.up;
const snapshot: IndicatorRuntimeSnapshot = runtime.snapshot();
const retainedFrom: number = runtime.retainedFrom;
const compacted: IndicatorRuntimeSnapshot = runtime.compactHistory();
const seeded: readonly IndicatorRuntimePoint[] = runtime.resetStreaming([], {
    time: 1,
    value: { time: 1, open: 1, high: 2, low: 0, close: 1 },
});
void patch;
void outputs;
void points;
void metadataUp;
void snapshot;
void retainedFrom;
void compacted;
void seeded;
