import type {
    ISeriesApi,
    ISeriesMarkersPlugin,
    SeriesMarker,
    TimedSeriesData,
} from '../chart-api.js';
import { SeriesStore } from '../model/series-store.js';
import {
    PrimitiveZOrder,
    type IChartPrimitive,
    type IPrimitiveRenderer,
    type PrimitiveAttachedContext,
    type PrimitivePaneView,
    type PrimitiveRect,
} from './primitive-api.js';

export interface SeriesMarkersPrimitiveOptions {
    readonly series: ISeriesApi<any, any>;
    readonly pointAtTime: (time: number) => TimedSeriesData | null;
    readonly priceValue: (point: TimedSeriesData) => number | null;
}

/** Marker storage and rendering live together behind the legacy plugin adapter. */
export class SeriesMarkersPrimitive implements IChartPrimitive, ISeriesMarkersPlugin {
    private readonly store = new SeriesStore<SeriesMarker>();
    private context: PrimitiveAttachedContext | null = null;
    private readonly renderer: IPrimitiveRenderer = { draw: (target) => this.draw(target) };
    private readonly view: PrimitivePaneView = {
        zOrder: () => PrimitiveZOrder.Normal,
        renderer: () => this.renderer,
    };

    constructor(private readonly options: SeriesMarkersPrimitiveOptions) {}

    attached(context: PrimitiveAttachedContext): void { this.context = context; }
    detached(): void { this.context = null; }
    updateAllViews(): void {}
    paneViews(): readonly PrimitivePaneView[] { return [this.view]; }

    setMarkers(markers: SeriesMarker[]): void {
        this.store.replace(markers);
        this.context?.requestUpdate();
    }

    markers(): readonly SeriesMarker[] { return this.store.snapshot(); }

    private draw(target: Parameters<IPrimitiveRenderer['draw']>[0]): void {
        const context = this.context;
        if (context === null || this.store.length === 0) return;
        target.useMediaCoordinateSpace(({ context: canvas }) => {
            this.drawMedia(canvas, target.pane.plot, context);
        });
    }

    private drawMedia(
        canvas: CanvasRenderingContext2D,
        plot: PrimitiveRect,
        context: PrimitiveAttachedContext,
    ): void {
        canvas.font = `10px ${context.theme().fontFamily}`;
        for (const marker of this.store.values) {
            const x = context.timeToCoordinate(marker.time);
            if (x === null || x < plot.x || x > plot.x + plot.width) continue;
            const point = this.options.pointAtTime(marker.time);
            if (point === null) continue;
            const candidate = point as TimedSeriesData & {
                high?: number;
                low?: number;
            };
            const anchor = marker.position === 'aboveBar' && Number.isFinite(candidate.high)
                ? candidate.high as number
                : marker.position === 'belowBar' && Number.isFinite(candidate.low)
                    ? candidate.low as number
                    : this.options.priceValue(point);
            if (anchor === null || !Number.isFinite(anchor)) continue;
            const baseY = this.options.series.priceToCoordinate(anchor);
            if (baseY === null) continue;
            const direction = marker.position === 'aboveBar' ? -1 : 1;
            const y = baseY + direction * 14;
            canvas.fillStyle = marker.color;
            canvas.strokeStyle = marker.color;
            const pointerDirection = marker.shape === 'arrowUp' ? -1 : 1;
            if (marker.shape === 'arrowUp' || marker.shape === 'arrowDown') {
                const tip = y + pointerDirection * 6;
                const headBase = y + pointerDirection;
                const tail = y - pointerDirection * 5;
                canvas.beginPath();
                canvas.moveTo(x, tip);
                canvas.lineTo(x - 6, headBase);
                canvas.lineTo(x - 2, headBase);
                canvas.lineTo(x - 2, tail);
                canvas.lineTo(x + 2, tail);
                canvas.lineTo(x + 2, headBase);
                canvas.lineTo(x + 6, headBase);
                canvas.closePath();
                canvas.fill();
            } else if (marker.shape === 'circle') {
                canvas.beginPath();
                canvas.arc(x, y, 4, 0, Math.PI * 2);
                canvas.fill();
            } else {
                canvas.fillRect(x - 4, y - 4, 8, 8);
            }
            if (marker.text !== undefined && marker.text.length > 0) {
                const tailY = y - pointerDirection * 5;
                canvas.textAlign = 'center';
                canvas.textBaseline = marker.position === 'aboveBar' ? 'bottom' : 'top';
                canvas.fillText(
                    marker.text,
                    x,
                    tailY + (marker.position === 'aboveBar' ? -3 : 3),
                );
            }
        }
    }
}
