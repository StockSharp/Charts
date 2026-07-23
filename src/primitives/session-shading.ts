import {
    PrimitiveZOrder,
    type IChartPrimitive,
    type IPrimitiveRenderer,
    type PrimitiveAttachedContext,
    type PrimitivePaneView,
    type PrimitiveZOrder as PrimitiveZOrderValue,
    type TimeRange,
} from '../core/chart-api.js';
import {
    TradingSessionKind,
    type ITradingCalendar,
    type TradingSession,
    type TradingSessionKind as TradingSessionKindValue,
} from '../time/trading-calendar.js';

export interface SessionShadingStyle {
    readonly color?: string;
    readonly visible?: boolean;
}

export interface SessionShadingOptions {
    readonly id?: string;
    readonly calendar: ITradingCalendar;
    readonly styles?: Partial<Record<TradingSessionKindValue, SessionShadingStyle>>;
    readonly zOrder?: PrimitiveZOrderValue;
}

export type SessionShadingOptionsPatch = Partial<Omit<SessionShadingOptions, 'id'>>;

export interface ResolvedSessionShadingStyle {
    readonly color: string;
    readonly visible: boolean;
}

export interface ResolvedSessionShadingOptions {
    readonly id: string;
    readonly calendar: ITradingCalendar;
    readonly styles: Readonly<Record<TradingSessionKindValue, ResolvedSessionShadingStyle>>;
    readonly zOrder: PrimitiveZOrderValue;
}

interface SessionShadingModel {
    calendar: ITradingCalendar;
    styles: Readonly<Record<TradingSessionKindValue, ResolvedSessionShadingStyle>>;
    zOrder: PrimitiveZOrderValue;
}

const SESSION_KINDS = Object.freeze([
    TradingSessionKind.PreMarket,
    TradingSessionKind.Regular,
    TradingSessionKind.PostMarket,
] as const);

const DEFAULT_STYLES: Readonly<Record<TradingSessionKindValue, ResolvedSessionShadingStyle>> = Object.freeze({
    [TradingSessionKind.PreMarket]: Object.freeze({ color: 'rgba(41, 98, 255, 0.08)', visible: true }),
    [TradingSessionKind.Regular]: Object.freeze({ color: 'rgba(76, 175, 80, 0.035)', visible: true }),
    [TradingSessionKind.PostMarket]: Object.freeze({ color: 'rgba(156, 39, 176, 0.08)', visible: true }),
});

let nextSessionShadingId = 1;

/** Calendar-backed pane background implemented only through the public primitive API. */
export class SessionShading implements IChartPrimitive {
    private readonly stableId: string;
    private readonly model: SessionShadingModel;
    private context: PrimitiveAttachedContext | null = null;
    private range: TimeRange | null = null;
    private sessions: readonly TradingSession[] = Object.freeze([]);
    private cache: {
        readonly calendar: ITradingCalendar;
        readonly from: number;
        readonly to: number;
        readonly kindsKey: string;
    } | null = null;
    private readonly renderer: IPrimitiveRenderer = { draw: (target) => this.draw(target) };
    private readonly paneView: PrimitivePaneView = {
        zOrder: () => this.model.zOrder,
        renderer: () => this.renderer,
    };

    constructor(options: SessionShadingOptions) {
        if (options === null || typeof options !== 'object')
            throw new TypeError('sschart: session shading options are required');
        this.stableId = normalizeId(options.id);
        this.model = {
            calendar: calendar(options.calendar),
            styles: styles(options.styles, DEFAULT_STYLES),
            zOrder: layer(options.zOrder, PrimitiveZOrder.Background),
        };
    }

    id(): string { return this.stableId; }

    options(): ResolvedSessionShadingOptions {
        return Object.freeze({
            id: this.stableId,
            calendar: this.model.calendar,
            styles: this.model.styles,
            zOrder: this.model.zOrder,
        });
    }

    visibleSessions(): readonly TradingSession[] {
        return this.sessions;
    }

    applyOptions(patch: SessionShadingOptionsPatch): void {
        if (patch === null || typeof patch !== 'object')
            throw new TypeError('sschart: session shading options patch must be an object');
        const next: SessionShadingModel = { ...this.model };
        if (patch.calendar !== undefined) next.calendar = calendar(patch.calendar);
        if (patch.styles !== undefined) next.styles = styles(patch.styles, this.model.styles);
        if (patch.zOrder !== undefined) next.zOrder = layer(patch.zOrder, PrimitiveZOrder.Background);
        Object.assign(this.model, next);
        this.invalidateCache();
        this.refresh();
        this.context?.requestUpdate();
    }

    attached(context: PrimitiveAttachedContext): void {
        this.context = context;
        this.invalidateCache();
        this.refresh();
    }

    detached(): void {
        this.context = null;
        this.range = null;
        this.sessions = Object.freeze([]);
        this.invalidateCache();
    }

    updateAllViews(): void { this.refresh(); }
    paneViews(): readonly PrimitivePaneView[] { return [this.paneView]; }

    private refresh(): void {
        const context = this.context;
        const range = context?.chart.timeScale().getVisibleRange() ?? null;
        this.range = range === null ? null : Object.freeze({ ...range });
        if (context === null || range === null) {
            this.sessions = Object.freeze([]);
            return;
        }
        const kinds = SESSION_KINDS.filter((kind) => this.model.styles[kind].visible);
        const kindsKey = kinds.join('\u0000');
        const cache = this.cache;
        if (cache !== null
            && cache.calendar === this.model.calendar
            && cache.from === range.from
            && cache.to === range.to
            && cache.kindsKey === kindsKey) {
            return;
        }
        this.sessions = Object.freeze(this.model.calendar.sessionsInRange(range, kinds)
            .map((session) => Object.freeze({ ...session })));
        this.cache = {
            calendar: this.model.calendar,
            from: range.from,
            to: range.to,
            kindsKey,
        };
    }

    private invalidateCache(): void { this.cache = null; }

    private draw(target: Parameters<IPrimitiveRenderer['draw']>[0]): void {
        const context = this.context;
        const range = this.range;
        if (context === null || range === null || this.sessions.length === 0) return;
        target.useMediaCoordinateSpace(({ context: canvas }) => {
            const plot = target.pane.plot;
            for (const session of this.sessions) {
                const style = this.model.styles[session.kind];
                if (!style.visible) continue;
                const from = Math.max(range.from, session.openTime);
                const to = Math.min(range.to, session.closeTime);
                const first = context.timeToCoordinate(from);
                const last = context.timeToCoordinate(to);
                if (first === null || last === null || !Number.isFinite(first) || !Number.isFinite(last)) continue;
                const left = Math.max(plot.x, Math.min(first, last));
                const right = Math.min(plot.x + plot.width, Math.max(first, last));
                if (!(right > left)) continue;
                canvas.fillStyle = style.color;
                canvas.fillRect(left, plot.y, right - left, plot.height);
            }
        });
    }
}

function normalizeId(value: string | undefined): string {
    if (value === undefined) return `session-shading-${nextSessionShadingId++}`;
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError('sschart: session shading id must be a non-empty string');
    return value.trim();
}

function calendar(value: ITradingCalendar): ITradingCalendar {
    if (value === null || typeof value !== 'object'
        || typeof value.schedule !== 'function'
        || typeof value.sessionsInRange !== 'function'
        || typeof value.sessionAt !== 'function'
        || typeof value.isTradingTime !== 'function'
        || typeof value.nextSession !== 'function'
        || typeof value.previousSession !== 'function') {
        throw new TypeError('sschart: session shading calendar must implement ITradingCalendar');
    }
    return value;
}

function color(value: string | undefined, fallback: string, name: string): string {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: session shading ${name} must be a non-empty string`);
    return value.trim();
}

function visible(value: boolean | undefined, fallback: boolean, name: string): boolean {
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean')
        throw new TypeError(`sschart: session shading ${name} must be boolean`);
    return value;
}

function styles(
    value: Partial<Record<TradingSessionKindValue, SessionShadingStyle>> | undefined,
    base: Readonly<Record<TradingSessionKindValue, ResolvedSessionShadingStyle>>,
): Readonly<Record<TradingSessionKindValue, ResolvedSessionShadingStyle>> {
    if (value === undefined) return base;
    if (value === null || typeof value !== 'object')
        throw new TypeError('sschart: session shading styles must be an object');
    for (const key of Object.keys(value)) {
        if (!(SESSION_KINDS as readonly string[]).includes(key))
            throw new TypeError(`sschart: session shading style kind ${key} is invalid`);
    }
    const result = {} as Record<TradingSessionKindValue, ResolvedSessionShadingStyle>;
    for (const kind of SESSION_KINDS) {
        const current = base[kind];
        const patch = value[kind];
        if (patch !== undefined && (patch === null || typeof patch !== 'object'))
            throw new TypeError(`sschart: session shading ${kind} style must be an object`);
        result[kind] = Object.freeze({
            color: color(patch?.color, current.color, `${kind}.color`),
            visible: visible(patch?.visible, current.visible, `${kind}.visible`),
        });
    }
    return Object.freeze(result);
}

function layer(
    value: PrimitiveZOrderValue | undefined,
    fallback: PrimitiveZOrderValue,
): PrimitiveZOrderValue {
    if (value === undefined) return fallback;
    if (!Object.values(PrimitiveZOrder).includes(value))
        throw new RangeError('sschart: session shading z-order is invalid');
    return value;
}
