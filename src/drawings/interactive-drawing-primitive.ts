import type {
    AutoscaleInfo,
    HitTestContext,
    IChartApi,
    IChartPrimitive,
    IPrimitiveRenderer,
    LogicalRange,
    PrimitiveAttachedContext,
    PrimitiveHit,
    PrimitiveInteractionEvent,
    PrimitivePaneView,
    PrimitiveRect,
    PrimitiveTheme,
} from '../core/chart-api.js';
import {
    PrimitiveHitTestLocation,
    PrimitiveHitTestRole,
    PrimitiveZOrder,
} from '../core/chart-api.js';
import {
    normalizeDrawingInstance,
    type DrawingInstance,
    type DrawingPoint,
} from './drawing-model.js';
import type {
    DrawingPrimitiveBinding,
    DrawingPrimitiveEvents,
} from './drawing-registry.js';

export interface DrawingScreenPoint {
    readonly x: number;
    readonly y: number;
}

export interface DrawingPrimitiveGeometryContext {
    readonly instance: DrawingInstance;
    readonly points: readonly DrawingScreenPoint[];
    readonly plot: PrimitiveRect;
    timeToCoordinate(time: number): number | null;
    priceToCoordinate(price: number): number | null;
}

export interface DrawingPrimitiveDrawContext extends DrawingPrimitiveGeometryContext {
    readonly context: CanvasRenderingContext2D;
    readonly theme: Readonly<PrimitiveTheme>;
    readonly pixelRatio: number;
    readonly selected: boolean;
}

export interface DrawingPrimitiveBodyHit {
    readonly cursor?: string;
}

export interface DrawingPrimitiveVisual {
    draw(context: DrawingPrimitiveDrawContext): void;
    hitTest(
        point: Readonly<DrawingScreenPoint>,
        context: DrawingPrimitiveGeometryContext,
    ): DrawingPrimitiveBodyHit | null;
    autoscaleInfo?(instance: DrawingInstance, range: LogicalRange): AutoscaleInfo | null;
    handleColor?(instance: DrawingInstance): string;
}

export interface DrawingPrimitiveHitData {
    readonly kind: 'drawing';
    readonly primitive: InteractiveDrawingPrimitive;
    readonly part: 'body' | 'point';
    readonly pointIndex: number | null;
}

interface DrawingDrag {
    readonly part: 'body' | 'point';
    readonly pointIndex: number | null;
    readonly origin: DrawingInstance;
    readonly screen: readonly DrawingScreenPoint[];
    previewed: boolean;
}

/** Shared interaction shell for serializable drawing visuals. */
export class InteractiveDrawingPrimitive implements IChartPrimitive {
    private model: DrawingInstance;
    private readonly events: DrawingPrimitiveEvents;
    private readonly visual: DrawingPrimitiveVisual;
    private context: PrimitiveAttachedContext | null = null;
    private plot: PrimitiveRect | null = null;
    private screen: readonly DrawingScreenPoint[] | null = null;
    private drag: DrawingDrag | null = null;
    private selected = false;
    private readonly renderer: IPrimitiveRenderer = { draw: target => this.draw(target) };
    private readonly paneView: PrimitivePaneView = {
        zOrder: () => PrimitiveZOrder.Top,
        renderer: () => this.renderer,
    };
    private readonly interactionListener = (
        snapshot: ReturnType<IChartApi['interactionState']>,
    ): void => {
        const selected = snapshot.selected?.primitive === this;
        if (selected === this.selected) return;
        this.selected = selected;
        this.context?.requestUpdate();
    };

    constructor(
        instance: DrawingInstance,
        events: DrawingPrimitiveEvents,
        visual: DrawingPrimitiveVisual,
    ) {
        this.model = normalizeDrawingInstance(instance);
        if (events === null || typeof events !== 'object'
            || typeof events.preview !== 'function'
            || typeof events.commit !== 'function'
            || typeof events.cancel !== 'function') {
            throw new TypeError('sschart: drawing primitive events are invalid');
        }
        if (visual === null || typeof visual !== 'object'
            || typeof visual.draw !== 'function'
            || typeof visual.hitTest !== 'function') {
            throw new TypeError('sschart: drawing primitive visual is invalid');
        }
        this.events = events;
        this.visual = visual;
    }

    instance(): DrawingInstance { return this.model; }

    update(instance: DrawingInstance): void {
        const next = normalizeDrawingInstance(instance);
        if (next.id !== this.model.id || next.type !== this.model.type)
            throw new Error('sschart: drawing primitive identity cannot change');
        this.drag = null;
        this.model = next;
        this.refreshScreen();
        this.context?.requestUpdate();
    }

    attached(context: PrimitiveAttachedContext): void {
        this.context = context;
        this.refreshScreen();
        context.chart.subscribeInteractionStateChange(this.interactionListener);
        context.addDisposable(() => {
            context.chart.unsubscribeInteractionStateChange(this.interactionListener);
        });
    }

    detached(): void {
        if (this.drag !== null) {
            this.model = this.drag.origin;
            this.drag = null;
        }
        this.context = null;
        this.plot = null;
        this.screen = null;
        this.selected = false;
    }

    updateAllViews(): void { this.refreshScreen(); }
    paneViews(): readonly PrimitivePaneView[] { return [this.paneView]; }

    autoscaleInfo(range: LogicalRange): AutoscaleInfo | null {
        return this.visual.autoscaleInfo?.(this.model, range) ?? null;
    }

    hitTest(point: Readonly<DrawingScreenPoint>, context: HitTestContext): PrimitiveHit | null {
        if (context.location !== PrimitiveHitTestLocation.Pane || this.plot === null) return null;
        const screen = this.refreshScreen();
        if (screen === null || !contains(this.plot, point)) return null;
        if (this.selected && !this.model.locked) {
            for (let index = screen.length - 1; index >= 0; index--) {
                const candidate = screen[index];
                if (Math.hypot(point.x - candidate.x, point.y - candidate.y) <= 8)
                    return this.hit('point', index, PrimitiveHitTestRole.Handle, 'move');
            }
        }
        const body = this.visual.hitTest(point, {
            instance: this.model,
            points: screen,
            plot: this.plot,
            timeToCoordinate: time => this.context?.timeToCoordinate(time) ?? null,
            priceToCoordinate: price => this.context?.priceToCoordinate(price) ?? null,
        });
        if (body === null) return null;
        return this.hit(
            'body',
            null,
            PrimitiveHitTestRole.Body,
            body.cursor ?? (this.model.locked ? 'pointer' : 'move'),
        );
    }

    onPointerDown(event: PrimitiveInteractionEvent): void {
        if (this.model.locked || this.drag !== null) return;
        const data = event.hit.data;
        if (!isDrawingHit(data) || data.primitive !== this) return;
        const screen = this.refreshScreen();
        if (screen === null) return;
        this.drag = {
            part: data.part,
            pointIndex: data.pointIndex,
            origin: this.model,
            screen,
            previewed: false,
        };
    }

    onPointerMove(event: PrimitiveInteractionEvent): void {
        const drag = this.drag;
        if (drag === null || this.context === null) return;
        let points: readonly DrawingPoint[] | null;
        if (drag.part === 'point') {
            const index = drag.pointIndex;
            const point = this.pointFromCoordinate(event.point.x, event.point.y);
            if (index === null || point === null) return;
            const changed = [...drag.origin.points];
            changed[index] = point;
            points = changed;
        } else {
            const changed: DrawingPoint[] = [];
            for (const point of drag.screen) {
                const translated = this.pointFromCoordinate(
                    point.x + event.totalDelta.x,
                    point.y + event.totalDelta.y,
                );
                if (translated === null) return;
                changed.push(translated);
            }
            points = changed;
        }
        const candidate = withPoints(drag.origin, points);
        if (samePoints(candidate.points, this.model.points)) return;
        this.model = candidate;
        drag.previewed = true;
        this.refreshScreen();
        this.events.preview(candidate);
        this.context.requestUpdate();
    }

    onPointerUp(): void {
        const drag = this.drag;
        if (drag === null) return;
        this.drag = null;
        const final = this.model;
        if (!drag.previewed || samePoints(drag.origin.points, final.points)) {
            this.model = drag.origin;
            if (drag.previewed) this.events.cancel(drag.origin);
            this.refreshScreen();
            this.context?.requestUpdate();
            return;
        }
        this.events.commit(final);
    }

    onPointerCancel(): void { this.cancelDrag(); }

    private cancelDrag(): void {
        const drag = this.drag;
        if (drag === null) return;
        this.drag = null;
        this.model = drag.origin;
        this.refreshScreen();
        if (drag.previewed) this.events.cancel(drag.origin);
        this.context?.requestUpdate();
    }

    private hit(
        part: DrawingPrimitiveHitData['part'],
        pointIndex: number | null,
        role: PrimitiveHit['role'],
        cursor: string,
    ): PrimitiveHit {
        const data: DrawingPrimitiveHitData = Object.freeze({
            kind: 'drawing',
            primitive: this,
            part,
            pointIndex,
        });
        return {
            id: pointIndex === null ? this.model.id : `${this.model.id}:point:${pointIndex}`,
            role,
            cursor,
            zOrder: PrimitiveZOrder.Top,
            data,
            interaction: {
                selectable: true,
                draggable: !this.model.locked,
                consumePointer: true,
            },
        };
    }

    private pointFromCoordinate(x: number, y: number): DrawingPoint | null {
        const context = this.context;
        if (context === null) return null;
        const time = context.coordinateToTime(x);
        const price = context.coordinateToPrice(y);
        if (time === null || price === null || !Number.isFinite(time) || !Number.isFinite(price))
            return null;
        return Object.freeze({ time, price });
    }

    private refreshScreen(): readonly DrawingScreenPoint[] | null {
        const context = this.context;
        if (context === null) return this.screen = null;
        const screen: DrawingScreenPoint[] = [];
        for (const point of this.model.points) {
            const x = context.timeToCoordinate(point.time);
            const y = context.priceToCoordinate(point.price);
            if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y))
                return this.screen = null;
            screen.push(Object.freeze({ x, y }));
        }
        return this.screen = Object.freeze(screen);
    }

    private draw(target: Parameters<IPrimitiveRenderer['draw']>[0]): void {
        this.plot = target.pane.plot;
        const screen = this.refreshScreen();
        const context = this.context;
        if (screen === null || context === null) return;
        target.useMediaCoordinateSpace(({ context: canvas }) => {
            const geometry: DrawingPrimitiveDrawContext = {
                context: canvas,
                instance: this.model,
                points: screen,
                plot: target.pane.plot,
                theme: context.theme(),
                pixelRatio: context.pixelRatio(),
                selected: this.selected,
                timeToCoordinate: time => context.timeToCoordinate(time),
                priceToCoordinate: price => context.priceToCoordinate(price),
            };
            this.visual.draw(geometry);
            if (this.selected && !this.model.locked) this.drawHandles(geometry);
        });
    }

    private drawHandles(context: DrawingPrimitiveDrawContext): void {
        const color = this.visual.handleColor?.(this.model) ?? optionColor(this.model);
        context.context.fillStyle = context.theme.backgroundColor;
        context.context.strokeStyle = color;
        context.context.lineWidth = 2;
        context.context.setLineDash([]);
        for (const point of context.points) {
            context.context.beginPath();
            context.context.arc(point.x, point.y, 5, 0, Math.PI * 2);
            context.context.fill();
            context.context.stroke();
        }
    }
}

export function createInteractiveDrawingBinding(
    instance: DrawingInstance,
    events: DrawingPrimitiveEvents,
    visual: DrawingPrimitiveVisual,
): DrawingPrimitiveBinding {
    const primitive = new InteractiveDrawingPrimitive(instance, events, visual);
    return Object.freeze({
        primitive,
        update: (next: DrawingInstance) => primitive.update(next),
    });
}

function isDrawingHit(value: unknown): value is DrawingPrimitiveHitData {
    return value !== null && typeof value === 'object'
        && (value as { kind?: unknown }).kind === 'drawing';
}

function withPoints(instance: DrawingInstance, points: readonly DrawingPoint[]): DrawingInstance {
    return Object.freeze({
        ...instance,
        points: Object.freeze(points.map(point => Object.freeze({
            time: point.time,
            price: point.price,
        }))),
    });
}

function samePoints(left: readonly DrawingPoint[], right: readonly DrawingPoint[]): boolean {
    return left.length === right.length && left.every((point, index) => (
        point.time === right[index].time && point.price === right[index].price
    ));
}

function contains(rect: PrimitiveRect, point: Readonly<DrawingScreenPoint>): boolean {
    return point.x >= rect.x && point.x <= rect.x + rect.width
        && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function optionColor(instance: DrawingInstance): string {
    const color = instance.options.color;
    return typeof color === 'string' && color.trim().length > 0 ? color : '#2962ff';
}
