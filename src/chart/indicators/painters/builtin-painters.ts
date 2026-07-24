import { IndicatorPatchOperation } from '../../../indicators/indicator-runtime.js';
import type {
    IndicatorPainter,
    IndicatorPainterContext,
    IndicatorPainterPatchContext,
    IndicatorPaintResult,
} from './indicator-painter.js';
import { registerIndicatorPainter } from './indicator-painter-registry.js';
import { applyMappedRuntimePatch, valuePoint } from './runtime-patch.js';

function setData(series: any[], index: number, data: any[]): void {
    if (series[index]) series[index].setData(data || []);
}

function mergeBand(upper: any[], lower: any[]): any[] {
    const lowerByTime = new Map((lower || []).map(point => [point.time, point.value]));
    const result: any[] = [];
    for (const point of upper || []) {
        const lowerValue = lowerByTime.get(point.time);
        if (!Number.isFinite(point.value) || !Number.isFinite(lowerValue)) continue;
        result.push({
            time: point.time,
            value: (point.value + lowerValue) / 2,
            upper: point.value,
            lower: lowerValue,
        });
    }
    return result;
}

class BandPainter implements IndicatorPainter {
    paint(c: IndicatorPainterContext): IndicatorPaintResult {
        const bandColor = c.nextColor();
        const centerId = this.centerId(c);
        const band = c.addSeries('band', {
            upperColor: bandColor,
            lowerColor: bandColor,
            fillColor: 'rgba(255,255,255,0.08)',
            lineWidth: 1,
            lineStyle: 2,
            lastValueVisible: false,
            title: 'Band',
        }, mergeBand(c.output('upper'), c.output('lower')));
        const series = [band];
        const legendSources: Record<string, { seriesIndex: number; field: string }> = {
            upper: { seriesIndex: 0, field: 'upper' },
            lower: { seriesIndex: 0, field: 'lower' },
        };
        let centerColor = bandColor;
        if (centerId !== null) {
            centerColor = c.nextColor();
            const center = c.addSeries('line', {
                color: centerColor,
                lineWidth: 2,
                title: centerId === 'ma' ? 'MA' : 'Middle',
            }, c.output(centerId));
            series.push(center);
            legendSources[centerId] = { seriesIndex: 1, field: 'value' };
        }
        const outputNames = c.entry.outputNames
            || (centerId === null ? ['upper', 'lower'] : ['upper', centerId, 'lower']);
        return {
            series,
            styleSources: {
                band: 0,
                ...(centerId === null ? {} : { [centerId]: 1 }),
            },
            colors: outputNames.map((id: string) => (
                id === centerId ? centerColor : bandColor
            )),
            legendSources,
        };
    }

    update(c: IndicatorPainterContext, series: any[]): void {
        setData(series, 0, mergeBand(c.output('upper'), c.output('lower')));
        const centerId = this.centerId(c);
        if (centerId !== null) setData(series, 1, c.output(centerId));
    }

    applyPatch(c: IndicatorPainterPatchContext, series: any[]): boolean {
        const centerId = this.centerId(c);
        const boundaryIds = new Set(['upper', 'lower']);
        if (c.patch.operations.some((operation) => (
            !boundaryIds.has(operation.outputId) && operation.outputId !== centerId
        ))) return false;
        const center = centerId === null
            ? []
            : c.patch.operations.filter((operation) => operation.outputId === centerId);
        const operations: any[] = [...center];
        const histories = c.entry._runtimeTailHistory || (c.entry._runtimeTailHistory = {});
        if (!histories.band) {
            const lowerTimes = new Map((histories.lower || []).map((point: any) => [
                point.targetIndex,
                point.time,
            ]));
            histories.band = (histories.upper || []).filter((point: any) => (
                lowerTimes.get(point.targetIndex) === point.time
            ));
        }
        const projectedHistory = [...histories.band];
        const targets = [...new Set(c.patch.operations
            .filter((operation) => boundaryIds.has(operation.outputId))
            .map((operation) => operation.targetIndex))];
        const upperPoints = c.points('upper');
        const lowerPoints = c.points('lower');
        for (const targetIndex of targets) {
            const upperPoint = upperPoints.find((point) => point.targetIndex === targetIndex);
            const lowerPoint = lowerPoints.find((point) => point.targetIndex === targetIndex);
            const tail = projectedHistory[projectedHistory.length - 1] || null;
            if (!upperPoint || !lowerPoint || upperPoint.time === null
                || upperPoint.time !== lowerPoint.time
                || upperPoint.sourceIndex !== lowerPoint.sourceIndex) {
                if (tail?.targetIndex === targetIndex) {
                    operations.push({
                        operation: IndicatorPatchOperation.Remove,
                        outputId: 'band',
                        targetIndex,
                    });
                    projectedHistory.pop();
                } else if (tail && targetIndex < tail.targetIndex) return false;
                continue;
            }
            if (tail && targetIndex < tail.targetIndex) return false;
            const operation = tail?.targetIndex === targetIndex
                ? IndicatorPatchOperation.Replace
                : IndicatorPatchOperation.Append;
            operations.push({
                operation,
                outputId: 'band',
                targetIndex,
                point: {
                    outputId: 'band',
                    sourceIndex: upperPoint.sourceIndex,
                    targetIndex,
                    time: upperPoint.time,
                    value: (upperPoint.value + lowerPoint.value) / 2,
                    upper: upperPoint.value,
                    lower: lowerPoint.value,
                },
            });
            if (operation === IndicatorPatchOperation.Append) {
                projectedHistory.push({ targetIndex, time: upperPoint.time });
            }
        }
        const mappings: any[] = [
            {
                outputId: 'band',
                seriesIndex: 0,
                data: (point: any) => ({
                    time: point.time,
                    value: point.value,
                    upper: point.upper,
                    lower: point.lower,
                }),
            },
        ];
        if (centerId !== null) {
            mappings.push({ outputId: centerId, seriesIndex: 1, data: valuePoint });
        }
        return applyMappedRuntimePatch({
            ...c,
            patch: { ...c.patch, operations },
        }, series, mappings);
    }

    private centerId(c: IndicatorPainterContext | IndicatorPainterPatchContext): string | null {
        const outputs = c.entry.outputNames || [];
        return outputs.find((id: string) => id !== 'upper' && id !== 'lower') || null;
    }
}

class MacdHistogramPainter implements IndicatorPainter {
    constructor(private readonly primary: 'macd' | 'ppo') {}

    paint(c: IndicatorPainterContext): IndicatorPaintResult {
        const primaryColor = c.nextColor();
        const signalColor = c.nextColor();
        const histogramColor = c.nextColor();
        const histogram = c.addSeries('histogram', {
            color: histogramColor,
            title: 'Histogram',
            priceScaleId: 'right',
        }, c.output('histogram'));
        const primary = c.addSeries('line', {
            color: primaryColor,
            lineWidth: 2,
            title: c.settings?.name || this.primary.toUpperCase(),
        }, c.output(this.primary));
        const signal = c.addSeries('line', { color: signalColor, lineWidth: 1, title: 'Signal' }, c.output('signal'));
        return {
            series: [histogram, primary, signal],
            styleSources: { histogram: 0, [this.primary]: 1, signal: 2 },
            colors: [primaryColor, signalColor, histogramColor],
            legendSources: {
                [this.primary]: { seriesIndex: 1, field: 'value' },
                signal: { seriesIndex: 2, field: 'value' },
                histogram: { seriesIndex: 0, field: 'value' },
            },
        };
    }

    update(c: IndicatorPainterContext, series: any[]): void {
        setData(series, 0, c.output('histogram'));
        setData(series, 1, c.output(this.primary));
        setData(series, 2, c.output('signal'));
    }

    applyPatch(c: IndicatorPainterPatchContext, series: any[]): boolean {
        return applyMappedRuntimePatch(c, series, [
            { outputId: 'histogram', seriesIndex: 0, data: valuePoint },
            { outputId: this.primary, seriesIndex: 1, data: valuePoint },
            { outputId: 'signal', seriesIndex: 2, data: valuePoint },
        ]);
    }
}

type LineSpec = { key: string; title?: string; color?: string; width?: number; style?: number };

class LinesPainter implements IndicatorPainter {
    constructor(private readonly specs?: LineSpec[]) {}

    paint(c: IndicatorPainterContext): IndicatorPaintResult {
        const specs: LineSpec[] = this.specs || (c.entry.outputNames || ['value']).map((key: string) => ({ key }));
        const colorByKey = new Map<string, string>();
        const series = specs.map((spec, i) => {
            const color = spec.color || c.nextColor();
            colorByKey.set(spec.key, color);
            return c.addSeries('line', {
                color,
                lineWidth: spec.width ?? (i === 0 ? 2 : 1),
                lineStyle: spec.style ?? 0,
                title: spec.title || spec.key,
            }, c.output(spec.key));
        });

        if (c.settings?.levels && series[0]?.createPriceLine) {
            for (const level of c.settings.levels) {
                series[0].createPriceLine({ price: level, color: 'rgba(107,122,141,0.4)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
            }
        }

        const colors = (c.entry.outputNames || specs.map(s => s.key))
            .map((name: string) => colorByKey.get(name) || '#d0d6de');
        return {
            series,
            styleSources: Object.fromEntries(specs.map((spec, index) => [spec.key, index])),
            colors,
            legendSources: Object.fromEntries(specs.map((spec, index) => [
                spec.key,
                { seriesIndex: index, field: 'value' },
            ])),
        };
    }

    update(c: IndicatorPainterContext, series: any[]): void {
        const specs: LineSpec[] = this.specs || (c.entry.outputNames || ['value']).map((key: string) => ({ key }));
        specs.forEach((spec, i) => setData(series, i, c.output(spec.key)));
    }

    applyPatch(c: IndicatorPainterPatchContext, series: any[]): boolean {
        const specs: LineSpec[] = this.specs
            || (c.entry.outputNames || ['value']).map((key: string) => ({ key }));
        return applyMappedRuntimePatch(c, series, specs.map((spec, seriesIndex) => ({
            outputId: spec.key,
            seriesIndex,
            data: valuePoint,
        })));
    }
}

class IchimokuPainter implements IndicatorPainter {
    private readonly tenkanColor = '#FF6347';
    private readonly kijunColor = '#1E90FF';
    private readonly senkouAColor = '#32CD32';
    private readonly senkouBColor = '#FF1493';
    private readonly chikouColor = '#EE82EE';

    paint(c: IndicatorPainterContext): IndicatorPaintResult {
        const tenkan = c.addSeries('line', {
            color: this.tenkanColor,
            lineWidth: 1,
            title: 'Tenkan',
        }, c.output('tenkan'));
        const kijun = c.addSeries('line', {
            color: this.kijunColor,
            lineWidth: 1,
            title: 'Kijun',
        }, c.output('kijun'));
        const chikou = c.addSeries('line', {
            color: this.chikouColor,
            lineWidth: 1,
            lineStyle: 2,
            title: 'Chikou',
        }, c.output('chikou'));
        const senkou = c.addSeries('band', {
            upperColor: this.senkouAColor,
            lowerColor: this.senkouBColor,
            positiveFillColor: 'rgba(50,205,50,0.18)',
            negativeFillColor: 'rgba(255,61,87,0.18)',
            lineWidth: 1,
            lastValueVisible: false,
            title: 'Senkou cloud',
        }, mergeBand(c.output('senkouA'), c.output('senkouB')));

        return {
            series: [tenkan, kijun, chikou, senkou],
            styleSources: { tenkan: 0, kijun: 1, chikou: 2, cloud: 3 },
            colors: [
                this.tenkanColor,
                this.kijunColor,
                this.senkouAColor,
                this.senkouBColor,
                this.chikouColor,
            ],
            legendSources: {
                tenkan: { seriesIndex: 0, field: 'value' },
                kijun: { seriesIndex: 1, field: 'value' },
                senkouA: { seriesIndex: 3, field: 'upper' },
                senkouB: { seriesIndex: 3, field: 'lower' },
                chikou: { seriesIndex: 2, field: 'value' },
            },
        };
    }

    update(c: IndicatorPainterContext, series: any[]): void {
        setData(series, 0, c.output('tenkan'));
        setData(series, 1, c.output('kijun'));
        setData(series, 2, c.output('chikou'));
        setData(series, 3, mergeBand(c.output('senkouA'), c.output('senkouB')));
    }

    applyPatch(c: IndicatorPainterPatchContext, series: any[]): boolean {
        const lineIds = new Set(['tenkan', 'kijun', 'chikou']);
        const cloudIds = new Set(['senkouA', 'senkouB']);
        if (c.patch.operations.some((operation) => (
            !lineIds.has(operation.outputId) && !cloudIds.has(operation.outputId)
        ))) return false;

        const histories = c.entry._runtimeTailHistory
            || (c.entry._runtimeTailHistory = {});
        if (!histories.ichimokuBand) {
            const lower = new Map((histories.senkouB || []).map((point: any) => [
                point.targetIndex,
                point.time,
            ]));
            histories.ichimokuBand = (histories.senkouA || []).filter((point: any) => (
                lower.get(point.targetIndex) === point.time
            ));
        }

        const operations: any[] = c.patch.operations.filter((operation) => (
            lineIds.has(operation.outputId)
        ));
        const targets = [...new Set(c.patch.operations
            .filter((operation) => cloudIds.has(operation.outputId))
            .map((operation) => operation.targetIndex))];
        const upperPoints = c.points('senkouA');
        const lowerPoints = c.points('senkouB');
        for (const targetIndex of targets) {
            const upper = upperPoints.find((point) => point.targetIndex === targetIndex);
            const lower = lowerPoints.find((point) => point.targetIndex === targetIndex);
            const history = histories.ichimokuBand as Array<{
                targetIndex: number;
                time: number;
            }>;
            const tail = history[history.length - 1] || null;
            if (!upper || !lower || upper.time === null || upper.time !== lower.time) {
                if (tail?.targetIndex === targetIndex) {
                    operations.push({
                        operation: IndicatorPatchOperation.Remove,
                        outputId: 'ichimokuBand',
                        targetIndex,
                    });
                } else if (tail && targetIndex < tail.targetIndex) return false;
                continue;
            }
            if (tail && targetIndex < tail.targetIndex) return false;
            operations.push({
                operation: tail?.targetIndex === targetIndex
                    ? IndicatorPatchOperation.Replace
                    : IndicatorPatchOperation.Append,
                outputId: 'ichimokuBand',
                targetIndex,
                point: {
                    outputId: 'ichimokuBand',
                    sourceIndex: Math.max(upper.sourceIndex, lower.sourceIndex),
                    targetIndex,
                    time: upper.time,
                    value: (upper.value + lower.value) / 2,
                    upper: upper.value,
                    lower: lower.value,
                },
            });
        }

        return applyMappedRuntimePatch({
            ...c,
            patch: { ...c.patch, operations },
        }, series, [
            { outputId: 'tenkan', seriesIndex: 0, data: valuePoint },
            { outputId: 'kijun', seriesIndex: 1, data: valuePoint },
            { outputId: 'chikou', seriesIndex: 2, data: valuePoint },
            {
                outputId: 'ichimokuBand',
                seriesIndex: 3,
                data: (point: any) => ({
                    time: point.time,
                    value: point.value,
                    upper: point.upper,
                    lower: point.lower,
                }),
            },
        ]);
    }
}

class DotsPainter implements IndicatorPainter {
    paint(c: IndicatorPainterContext): IndicatorPaintResult {
        const color = c.nextColor();
        const series = c.addSeries('line', {
            color,
            lineWidth: 0,
            lineVisible: false,
            title: c.settings?.name || c.entry.type,
            crosshairMarkerRadius: 4,
            pointMarkersVisible: true,
            pointMarkersRadius: 4,
        }, c.output('value'));
        return {
            series: [series], colors: [color],
            styleSources: { value: 0 },
            legendSources: { value: { seriesIndex: 0, field: 'value' } },
        };
    }

    update(c: IndicatorPainterContext, series: any[]): void {
        setData(series, 0, c.output('value'));
    }

    applyPatch(c: IndicatorPainterPatchContext, series: any[]): boolean {
        return applyMappedRuntimePatch(c, series, [
            { outputId: 'value', seriesIndex: 0, data: valuePoint },
        ]);
    }
}

class FractalsPainter implements IndicatorPainter {
    paint(c: IndicatorPainterContext): IndicatorPaintResult {
        const upColor = '#32CD32';
        const downColor = '#FF3D57';
        const options = (color: string, title: string) => ({
            color, title, lineWidth: 0, lineVisible: false,
            pointMarkersVisible: true, pointMarkersRadius: 4, crosshairMarkerRadius: 4,
        });
        const up = c.addSeries('line', options(upColor, 'Fractal Up'), c.output('up'));
        const down = c.addSeries('line', options(downColor, 'Fractal Down'), c.output('down'));
        return {
            series: [up, down], colors: [upColor, downColor],
            styleSources: { up: 0, down: 1 },
            legendSources: {
                up: { seriesIndex: 0, field: 'value' },
                down: { seriesIndex: 1, field: 'value' },
            },
        };
    }

    update(c: IndicatorPainterContext, series: any[]): void {
        setData(series, 0, c.output('up'));
        setData(series, 1, c.output('down'));
    }

    applyPatch(c: IndicatorPainterPatchContext, series: any[]): boolean {
        return applyMappedRuntimePatch(c, series, [
            { outputId: 'up', seriesIndex: 0, data: valuePoint },
            { outputId: 'down', seriesIndex: 1, data: valuePoint },
        ]);
    }
}

class GatorPainter implements IndicatorPainter {
    paint(c: IndicatorPainterContext): IndicatorPaintResult {
        const upperColor = '#00c853';
        const lowerColor = '#ff3d57';
        const upper = c.addSeries('histogram', { color: upperColor, title: 'Upper', priceScaleId: 'right' }, c.output('upper'));
        const lower = c.addSeries('histogram', { color: lowerColor, title: 'Lower', priceScaleId: 'right' }, c.output('lower'));
        return {
            series: [upper, lower], colors: [upperColor, lowerColor],
            styleSources: { upper: 0, lower: 1 },
            legendSources: {
                upper: { seriesIndex: 0, field: 'value' },
                lower: { seriesIndex: 1, field: 'value' },
            },
        };
    }

    update(c: IndicatorPainterContext, series: any[]): void {
        setData(series, 0, c.output('upper'));
        setData(series, 1, c.output('lower'));
    }

    applyPatch(c: IndicatorPainterPatchContext, series: any[]): boolean {
        return applyMappedRuntimePatch(c, series, [
            { outputId: 'upper', seriesIndex: 0, data: valuePoint },
            { outputId: 'lower', seriesIndex: 1, data: valuePoint },
        ]);
    }
}

class DirectionalHistogramPainter implements IndicatorPainter {
    constructor(private readonly volumeFormat = false) {}

    paint(c: IndicatorPainterContext): IndicatorPaintResult {
        const color = '#4a9eff';
        const series = c.addSeries('histogram', {
            color,
            title: c.settings?.name || c.entry.type,
            ...(this.volumeFormat ? { priceFormat: { type: 'volume' } } : {}),
            priceScaleId: 'right',
        }, this.colored(c.output('value')));
        return {
            series: [series], colors: [color],
            styleSources: { value: 0 },
            legendSources: { value: { seriesIndex: 0, field: 'value' } },
        };
    }

    update(c: IndicatorPainterContext, series: any[]): void {
        setData(series, 0, this.colored(c.output('value')));
    }

    applyPatch(c: IndicatorPainterPatchContext, series: any[]): boolean {
        return applyMappedRuntimePatch(c, series, [{
            outputId: 'value',
            seriesIndex: 0,
            data: point => this.coloredPoint(valuePoint(point)),
        }]);
    }

    private colored(data: any[]): any[] {
        return (data || []).map(point => this.coloredPoint(point));
    }

    private coloredPoint(point: any): any {
        return {
            ...point,
            color: point.color || (point.up === false ? '#ff3d57' : '#00c853'),
        };
    }
}

// Names below are persisted in catalog.json and form the stable public lookup API.
// Registration is an explicit call (not a bare-import side effect) so it survives
// bundler tree-shaking regardless of the package's `sideEffects` declaration.
let builtInPaintersRegistered = false;

/** Registers every built-in indicator painter once; safe to call repeatedly. */
export function registerBuiltInIndicatorPainters(): void {
    if (builtInPaintersRegistered) return;
    builtInPaintersRegistered = true;

    registerIndicatorPainter('band', () => new BandPainter());
    registerIndicatorPainter('macd-histogram', () => new MacdHistogramPainter('macd'));
    registerIndicatorPainter('ppo-histogram', () => new MacdHistogramPainter('ppo'));
    registerIndicatorPainter('stochastic', () => new LinesPainter([
        { key: 'k', title: 'K', width: 2 },
        { key: 'd', title: 'D', style: 2 },
    ]));
    registerIndicatorPainter('adx', () => new LinesPainter([
        { key: 'plusDI', title: '+DI' },
        { key: 'minusDI', title: '-DI' },
        { key: 'adx', title: 'ADX', width: 2 },
    ]));
    registerIndicatorPainter('alligator', () => new LinesPainter([
        { key: 'jaw', title: 'Jaw', color: '#1E90FF' },
        { key: 'teeth', title: 'Teeth', color: '#FF0000' },
        { key: 'lips', title: 'Lips', color: '#32CD32' },
    ]));
    registerIndicatorPainter('ichimoku', () => new IchimokuPainter());
    registerIndicatorPainter('dots', () => new DotsPainter());
    registerIndicatorPainter('fractals', () => new FractalsPainter());
    registerIndicatorPainter('gator', () => new GatorPainter());
    registerIndicatorPainter('volume', () => new DirectionalHistogramPainter(true));
    registerIndicatorPainter('directional-histogram', () => new DirectionalHistogramPainter());
    registerIndicatorPainter('dual-line', () => new LinesPainter());
}
