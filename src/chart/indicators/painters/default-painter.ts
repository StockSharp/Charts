import type { IndicatorPainter, IndicatorPainterContext, IndicatorPaintResult } from './indicator-painter.js';

/** Plain-line fallback. It is deliberately not registered under a catalog name. */
export class DefaultIndicatorPainter implements IndicatorPainter {
    paint(context: IndicatorPainterContext): IndicatorPaintResult {
        const outputs = context.entry.outputNames?.length ? context.entry.outputNames : ['value'];
        const colors: string[] = [];
        const series: any[] = [];

        for (let i = 0; i < outputs.length; i++) {
            const color = context.nextColor();
            colors.push(color);
            const title = outputs.length === 1
                ? (context.settings?.name || context.entry.type)
                : outputs[i];
            const item = context.addSeries('line', {
                color,
                lineWidth: outputs.length === 1 ? 2 : 1,
                title,
            }, context.output(outputs[i]));
            series.push(item);
        }

        if (context.settings?.levels && series[0]?.createPriceLine) {
            for (const level of context.settings.levels) {
                series[0].createPriceLine({
                    price: level,
                    color: 'rgba(107,122,141,0.4)',
                    lineWidth: 1,
                    lineStyle: 2,
                    axisLabelVisible: false,
                });
            }
        }

        return { series, colors };
    }

    update(context: IndicatorPainterContext, series: any[]): void {
        const outputs = context.entry.outputNames?.length ? context.entry.outputNames : ['value'];
        for (let i = 0; i < outputs.length && i < series.length; i++) {
            series[i].setData(context.output(outputs[i]));
        }
    }
}
