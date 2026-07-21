import type { IndicatorPainter, IndicatorPainterContext, IndicatorPaintResult } from './indicator-painter.js';
import { registerIndicatorPainter } from './indicator-painter-registry.js';

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
        const middleColor = c.nextColor();
        const band = c.addSeries('band', {
            upperColor: bandColor,
            lowerColor: bandColor,
            fillColor: 'rgba(255,255,255,0.08)',
            lineWidth: 1,
            lineStyle: 2,
            lastValueVisible: false,
            title: 'Band',
        }, mergeBand(c.output('upper'), c.output('lower')));
        const middle = c.addSeries('line', { color: middleColor, lineWidth: 2, title: 'Middle' }, c.output('middle'));
        return { series: [band, middle], colors: [bandColor, middleColor, bandColor] };
    }

    update(c: IndicatorPainterContext, series: any[]): void {
        setData(series, 0, mergeBand(c.output('upper'), c.output('lower')));
        setData(series, 1, c.output('middle'));
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
        return { series: [histogram, primary, signal], colors: [primaryColor, signalColor, histogramColor] };
    }

    update(c: IndicatorPainterContext, series: any[]): void {
        setData(series, 0, c.output('histogram'));
        setData(series, 1, c.output(this.primary));
        setData(series, 2, c.output('signal'));
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
        return { series, colors };
    }

    update(c: IndicatorPainterContext, series: any[]): void {
        const specs: LineSpec[] = this.specs || (c.entry.outputNames || ['value']).map((key: string) => ({ key }));
        specs.forEach((spec, i) => setData(series, i, c.output(spec.key)));
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
            colors: [
                this.tenkanColor,
                this.kijunColor,
                this.senkouAColor,
                this.senkouBColor,
                this.chikouColor,
            ],
        };
    }

    update(c: IndicatorPainterContext, series: any[]): void {
        setData(series, 0, c.output('tenkan'));
        setData(series, 1, c.output('kijun'));
        setData(series, 2, c.output('chikou'));
        setData(series, 3, mergeBand(c.output('senkouA'), c.output('senkouB')));
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
        return { series: [series], colors: [color] };
    }

    update(c: IndicatorPainterContext, series: any[]): void {
        setData(series, 0, c.output('value'));
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
        return { series: [up, down], colors: [upColor, downColor] };
    }

    update(c: IndicatorPainterContext, series: any[]): void {
        setData(series, 0, c.output('up'));
        setData(series, 1, c.output('down'));
    }
}

class GatorPainter implements IndicatorPainter {
    paint(c: IndicatorPainterContext): IndicatorPaintResult {
        const upperColor = '#00c853';
        const lowerColor = '#ff3d57';
        const upper = c.addSeries('histogram', { color: upperColor, title: 'Upper', priceScaleId: 'right' }, c.output('upper'));
        const lower = c.addSeries('histogram', { color: lowerColor, title: 'Lower', priceScaleId: 'right' }, c.output('lower'));
        return { series: [upper, lower], colors: [upperColor, lowerColor] };
    }

    update(c: IndicatorPainterContext, series: any[]): void {
        setData(series, 0, c.output('upper'));
        setData(series, 1, c.output('lower'));
    }
}

class VolumePainter implements IndicatorPainter {
    paint(c: IndicatorPainterContext): IndicatorPaintResult {
        const color = '#4a9eff';
        const series = c.addSeries('histogram', {
            color,
            title: 'Volume',
            priceFormat: { type: 'volume' },
            priceScaleId: 'right',
        }, this.colored(c.output('value')));
        return { series: [series], colors: [color] };
    }

    update(c: IndicatorPainterContext, series: any[]): void {
        setData(series, 0, this.colored(c.output('value')));
    }

    private colored(data: any[]): any[] {
        return (data || []).map(point => ({
            ...point,
            color: point.color || (point.up === false ? '#ff3d57' : '#00c853'),
        }));
    }
}

// Names below are persisted in catalog.json and form the stable public lookup API.
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
registerIndicatorPainter('volume', () => new VolumePainter());
registerIndicatorPainter('dual-line', () => new LinesPainter());
