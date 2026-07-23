import type {
    IPriceLine,
    ISeriesApi,
    PriceLineOptions,
} from '../chart-api.js';
import {
    PrimitiveHitTestLocation,
    PrimitiveHitTestRole,
    PrimitivePaneViewClip,
    PrimitiveZOrder,
    type HitTestContext,
    type IChartPrimitive,
    type IPrimitiveRenderer,
    type PrimitiveAttachedContext,
    type PrimitiveHit,
    type PrimitiveInteractionEvent,
    type PrimitivePaneView,
    type PrimitiveRect,
} from './primitive-api.js';

export interface InternalPriceLine extends IPriceLine {
    readonly stablePrimitiveId: string;
    displayY: number | null;
    labelOffset: number | null;
    raw(): PriceLineOptions;
}

export interface PriceLinePrimitiveEntry {
    readonly series: ISeriesApi<any, any>;
    readonly line: InternalPriceLine;
    readonly formatPrice: (price: number) => string;
}

export interface PriceLinePrimitiveHitData {
    readonly kind: 'price-line';
    readonly part: 'line' | 'label' | 'close-button';
    readonly series: ISeriesApi<any, any>;
    readonly priceLine: IPriceLine;
    readonly entry: PriceLinePrimitiveEntry;
}

interface Rect { x: number; y: number; width: number; height: number }
interface RenderedLine {
    readonly entry: PriceLinePrimitiveEntry;
    readonly lineY: number;
    readonly titleRect: Rect | null;
    readonly priceRect: Rect | null;
    readonly closeRect: Rect | null;
}

export function isPriceLinePrimitiveHitData(value: unknown): value is PriceLinePrimitiveHitData {
    return value !== null && typeof value === 'object'
        && (value as { kind?: unknown }).kind === 'price-line';
}

/** Pane-level aggregator keeps collision avoidance deterministic across all series. */
export class PriceLinesPrimitive implements IChartPrimitive {
    private context: PrimitiveAttachedContext | null = null;
    private rendered: readonly RenderedLine[] = [];
    private plot: PrimitiveRect | null = null;
    private drag: { entry: PriceLinePrimitiveEntry; startPrice: number } | null = null;
    private readonly renderer: IPrimitiveRenderer = { draw: (target) => this.draw(target) };
    private readonly view: PrimitivePaneView = {
        zOrder: () => PrimitiveZOrder.Top,
        clip: () => PrimitivePaneViewClip.Pane,
        renderer: () => this.renderer,
    };

    constructor(
        private readonly entries: () => readonly PriceLinePrimitiveEntry[],
        private readonly font: () => string,
    ) {}

    attached(context: PrimitiveAttachedContext): void { this.context = context; }

    detached(): void {
        this.finishDrag(true);
        this.context = null;
        this.rendered = [];
        this.plot = null;
    }

    updateAllViews(): void {}
    paneViews(): readonly PrimitivePaneView[] { return [this.view]; }
    draggingLine(): IPriceLine | null { return this.drag?.entry.line ?? null; }

    hitTest(point: Readonly<{ x: number; y: number }>, context: HitTestContext): PrimitiveHit | null {
        for (const rendered of [...this.rendered].reverse()) {
            if (rendered.closeRect !== null && contains(rendered.closeRect, point)) {
                return this.hit(rendered.entry, 'close-button', PrimitiveHitTestRole.CloseButton, 'pointer', true);
            }
            if (rendered.titleRect !== null && contains(rendered.titleRect, point)) {
                return this.hitForLine(rendered.entry, 'label');
            }
            if (rendered.priceRect !== null && contains(rendered.priceRect, point)) {
                return this.hitForLine(rendered.entry, 'label');
            }
            if (context.location === PrimitiveHitTestLocation.Pane && this.plot !== null
                && point.x >= this.plot.x && point.x <= this.plot.x + this.plot.width
                && Math.abs(point.y - rendered.lineY) <= 6) {
                return this.hitForLine(rendered.entry, 'line');
            }
        }
        return null;
    }

    onPointerDown(event: PrimitiveInteractionEvent): void {
        const data = event.hit.data;
        if (!isPriceLinePrimitiveHitData(data) || data.part === 'close-button') return;
        const options = data.entry.line.raw();
        if (options.draggable !== true) return;
        this.drag = { entry: data.entry, startPrice: options.price };
        data.entry.line.applyOptions({ anchored: true });
        try { data.entry.series.priceScale().applyOptions({ autoScale: false }); } catch { /* detached */ }
    }

    onPointerMove(event: PrimitiveInteractionEvent): void {
        const drag = this.drag;
        const plot = this.plot;
        if (drag === null || plot === null) return;
        const y = Math.max(plot.y, Math.min(plot.y + plot.height, event.point.y));
        const price = drag.entry.series.coordinateToPrice(y);
        if (price === null || !Number.isFinite(price)) return;
        drag.entry.line.applyOptions({ price, anchored: true });
        const callback = drag.entry.line.raw().onDrag;
        if (callback !== undefined) {
            try { callback(price); } catch { /* host callback */ }
        }
    }

    onPointerUp(event: PrimitiveInteractionEvent): void {
        const data = event.hit.data;
        if (isPriceLinePrimitiveHitData(data) && data.part === 'close-button'
            && Math.hypot(event.totalDelta.x, event.totalDelta.y) <= 4) {
            const callback = data.entry.line.raw().onClose;
            if (callback !== undefined) {
                try { callback(); } catch { /* host callback */ }
            }
        }
        this.finishDrag(false);
    }

    onPointerCancel(): void { this.finishDrag(true); }

    lineRemoved(line: IPriceLine): void {
        if (this.drag?.entry.line === line) this.finishDrag(true);
    }

    private finishDrag(cancelled: boolean): void {
        const drag = this.drag;
        if (drag === null) return;
        this.drag = null;
        if (cancelled) drag.entry.line.applyOptions({ price: drag.startPrice, anchored: false });
        else drag.entry.line.applyOptions({ anchored: false });
        try { drag.entry.series.priceScale().applyOptions({ autoScale: true }); } catch { /* detached */ }
        if (!cancelled) {
            const price = drag.entry.line.raw().price;
            const callback = drag.entry.line.raw().onDragCommit;
            if (callback !== undefined) {
                try { callback(price); } catch { /* host callback */ }
            }
        }
    }

    private hitForLine(entry: PriceLinePrimitiveEntry, part: 'line' | 'label'): PrimitiveHit {
        const draggable = entry.line.raw().draggable === true;
        return this.hit(
            entry,
            part,
            draggable ? PrimitiveHitTestRole.Handle
                : part === 'label' ? PrimitiveHitTestRole.Label : PrimitiveHitTestRole.Body,
            draggable ? 'ns-resize' : 'default',
            draggable,
        );
    }

    private hit(
        entry: PriceLinePrimitiveEntry,
        part: PriceLinePrimitiveHitData['part'],
        role: PrimitiveHit['role'],
        cursor: string,
        consumePointer: boolean,
    ): PrimitiveHit {
        const data: PriceLinePrimitiveHitData = Object.freeze({
            kind: 'price-line', part,
            series: entry.series,
            priceLine: entry.line,
            entry,
        });
        return {
            id: part === 'close-button'
                ? `${entry.line.stablePrimitiveId}:close`
                : entry.line.stablePrimitiveId,
            role,
            cursor,
            zOrder: PrimitiveZOrder.Top,
            data,
            interaction: {
                selectable: false,
                draggable: entry.line.raw().draggable === true && part !== 'close-button',
                consumePointer,
            },
        };
    }

    private draw(target: Parameters<IPrimitiveRenderer['draw']>[0]): void {
        this.plot = target.pane.plot;
        target.useMediaCoordinateSpace(({ context }) => this.drawMedia(context, target.pane.plot));
    }

    private drawMedia(context: CanvasRenderingContext2D, plot: PrimitiveRect): void {
        const labelHeight = 18;
        const labelSlot = 19;
        const items = this.entries()
            .filter(({ line }) => line.raw().lineVisible !== false && Number.isFinite(line.raw().price))
            .map((entry) => {
                const coordinate = entry.series.priceToCoordinate(entry.line.raw().price);
                if (coordinate === null) return null;
                const lineY = Math.max(plot.y + labelHeight / 2,
                    Math.min(plot.y + plot.height - labelHeight / 2, coordinate));
                return { entry, options: entry.line.raw(), lineY };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);
        if (items.length === 0) {
            this.rendered = [];
            return;
        }

        const order = items.map((_, index) => index)
            .sort((left, right) => items[left].lineY - items[right].lineY);
        const targets = items.map((item) => item.lineY);
        const anchored = items.map((item) => item.options.anchored === true);
        for (let pass = 0; pass < 4; pass++) {
            let touched = false;
            for (let index = 0; index < order.length - 1; index++) {
                const first = order[index];
                const second = order[index + 1];
                const gap = targets[second] - targets[first];
                if (gap >= labelSlot) continue;
                const deficit = labelSlot - gap;
                if (anchored[first] && !anchored[second]) targets[second] += deficit;
                else if (!anchored[first] && anchored[second]) targets[first] -= deficit;
                else { targets[first] -= deficit / 2; targets[second] += deficit / 2; }
                touched = true;
            }
            if (!touched) break;
        }
        const minY = plot.y + labelHeight / 2;
        const maxY = plot.y + plot.height - labelHeight / 2;
        for (let index = 0; index < targets.length; index++)
            targets[index] = Math.max(minY, Math.min(maxY, targets[index]));

        let moving = false;
        for (let index = 0; index < items.length; index++) {
            const line = items[index].entry.line;
            const targetOffset = targets[index] - items[index].lineY;
            if (line.labelOffset === null || anchored[index]) line.labelOffset = targetOffset;
            else {
                const delta = targetOffset - line.labelOffset;
                if (Math.abs(delta) < 0.5) line.labelOffset = targetOffset;
                else { line.labelOffset += delta * 0.28; moving = true; }
            }
            line.displayY = items[index].lineY + line.labelOffset;
        }

        const rendered: RenderedLine[] = [];
        for (const item of items) {
            const { entry, options } = item;
            const displayY = entry.line.displayY as number;
            const lineY = Math.round(item.lineY) + 0.5;
            const color = options.color ?? '#4a9eff';
            const lineWidth = Math.max(1, options.lineWidth ?? 2);
            const labelColor = options.axisLabelColor ?? color;
            const textColor = options.axisLabelTextColor ?? textOn(labelColor);
            const left = entry.series.priceScaleId() === 'left';
            const labels = options.axisLabelVisible ?? true;
            context.font = this.font();
            context.textBaseline = 'middle';
            context.textAlign = 'left';
            const title = labels ? (options.title ?? '') : '';
            const price = labels ? entry.formatPrice(options.price) : '';
            const titleWidth = title ? context.measureText(title).width + 10 : 0;
            const priceWidth = price ? context.measureText(price).width + 10 : 0;
            const plotRight = plot.x + plot.width;
            const titleX = left ? plot.x + 1 : plotRight - titleWidth;
            const priceX = left ? plot.x - priceWidth - 1 : plotRight + 1;
            const lineEnd = left ? plotRight : title ? titleX : plotRight;

            context.strokeStyle = color;
            context.lineWidth = lineWidth;
            context.setLineDash(dashFor(options.lineStyle ?? 0, lineWidth));
            context.beginPath();
            context.moveTo(plot.x, lineY);
            context.lineTo(lineEnd, lineY);
            context.stroke();
            context.setLineDash([]);

            if (labels && Math.abs(displayY - lineY) > 4) {
                context.strokeStyle = labelColor;
                context.lineWidth = 1;
                context.setLineDash([2, 2]);
                context.beginPath();
                const edge = left ? plot.x - 1 : plotRight + 1;
                context.moveTo(edge, Math.max(plot.y + 0.5, Math.min(plot.y + plot.height - 0.5, lineY)));
                context.lineTo(edge, displayY);
                context.stroke();
                context.setLineDash([]);
            }

            let titleRect: Rect | null = null;
            let priceRect: Rect | null = null;
            let closeRect: Rect | null = null;
            if (title) {
                titleRect = { x: titleX, y: displayY - labelHeight / 2, width: titleWidth, height: labelHeight };
                context.fillStyle = labelColor;
                context.fillRect(titleRect.x, titleRect.y, titleRect.width, titleRect.height);
                context.fillStyle = textColor;
                context.fillText(title, titleX + 5, displayY + 1);
            }
            if (options.onClose !== undefined && title) {
                const closeX = left ? titleX + titleWidth : titleX - labelHeight;
                closeRect = { x: closeX, y: displayY - labelHeight / 2, width: labelHeight, height: labelHeight };
                context.fillStyle = labelColor;
                context.fillRect(closeRect.x, closeRect.y, closeRect.width, closeRect.height);
                context.fillStyle = textColor;
                context.textAlign = 'center';
                context.fillText('✕', closeX + labelHeight / 2, displayY + 1);
                context.textAlign = 'left';
            }
            if (price) {
                priceRect = { x: priceX, y: displayY - labelHeight / 2, width: priceWidth, height: labelHeight };
                context.fillStyle = labelColor;
                context.fillRect(priceRect.x, priceRect.y, priceRect.width, priceRect.height);
                context.fillStyle = textColor;
                context.fillText(price, priceX + 5, displayY + 1);
            }
            rendered.push({ entry, lineY: item.lineY, titleRect, priceRect, closeRect });
        }
        this.rendered = Object.freeze(rendered);
        if (moving) this.context?.requestUpdate();
    }
}

function contains(rect: Rect, point: Readonly<{ x: number; y: number }>): boolean {
    return point.x >= rect.x && point.x <= rect.x + rect.width
        && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function dashFor(style: number, width: number): number[] {
    switch (style) {
        case 1: return [width, width];
        case 2: return [width * 3, width * 2];
        case 3: return [width * 6, width * 3];
        case 4: return [width, width * 4];
        default: return [];
    }
}

function textOn(background: string): string {
    const match = /^#?([0-9a-fA-F]{6})$/.exec(background.trim());
    if (match === null) return '#fff';
    const value = parseInt(match[1], 16);
    const luminance = 0.299 * ((value >> 16) & 255)
        + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255);
    return luminance > 150 ? '#111' : '#fff';
}
