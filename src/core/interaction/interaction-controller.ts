import type {
    IChartPrimitive,
    PrimitiveHitTestRole,
} from '../primitives/primitive-api.js';

export const InteractionState = Object.freeze({
    Idle: 'idle',
    Hover: 'hover',
    Drawing: 'drawing',
    Selected: 'selected',
    DraggingBody: 'dragging-body',
    DraggingHandle: 'dragging-handle',
    Panning: 'panning',
    Scaling: 'scaling',
} as const);
export type InteractionState = typeof InteractionState[keyof typeof InteractionState];

export interface InteractionObjectRef {
    readonly primitive: IChartPrimitive;
    readonly id: string;
    readonly role: PrimitiveHitTestRole;
}

export interface InteractionStateSnapshot {
    readonly state: InteractionState;
    readonly hovered: InteractionObjectRef | null;
    readonly selected: InteractionObjectRef | null;
}

export interface InteractionPoint {
    readonly x: number;
    readonly y: number;
}

export type InteractionPressTarget =
    | {
        readonly kind: 'primitive';
        readonly object: InteractionObjectRef;
        readonly selectable: boolean;
        readonly draggable: boolean;
    }
    | { readonly kind: 'pane' }
    | { readonly kind: 'scale' }
    | { readonly kind: 'legacy-line'; readonly objectId: string };

export interface InteractionMovement {
    readonly point: InteractionPoint;
    readonly startPoint: InteractionPoint;
    readonly delta: InteractionPoint;
    readonly totalDelta: InteractionPoint;
    readonly state: InteractionState;
    readonly started: boolean;
}

interface ActivePress {
    readonly target: InteractionPressTarget;
    readonly start: InteractionPoint;
    last: InteractionPoint;
}

export class InteractionController {
    private state: InteractionState = InteractionState.Idle;
    private hovered: InteractionObjectRef | null = null;
    private selected: InteractionObjectRef | null = null;
    private press: ActivePress | null = null;

    constructor(
        private readonly changed: (snapshot: InteractionStateSnapshot) => void = () => {},
        private readonly dragThreshold = 4,
    ) {}

    snapshot(): InteractionStateSnapshot {
        return Object.freeze({
            state: this.state,
            hovered: this.hovered === null ? null : Object.freeze({ ...this.hovered }),
            selected: this.selected === null ? null : Object.freeze({ ...this.selected }),
        });
    }

    get hasActivePress(): boolean { return this.press !== null; }

    hover(object: InteractionObjectRef | null): void {
        if (sameObject(this.hovered, object)) return;
        this.hovered = object;
        if (this.press === null && this.state !== InteractionState.Drawing) {
            this.setState(this.selected !== null
                ? InteractionState.Selected
                : object === null ? InteractionState.Idle : InteractionState.Hover, true);
            return;
        }
        this.emit();
    }

    pointerDown(point: InteractionPoint, target: InteractionPressTarget): void {
        this.press = { target, start: freezePoint(point), last: freezePoint(point) };
        if (target.kind === 'primitive') {
            this.hovered = target.object;
            if (target.selectable) this.selected = target.object;
            this.setState(target.selectable ? InteractionState.Selected : InteractionState.Hover, true);
        } else if (target.kind === 'scale') {
            this.selected = null;
            this.setState(InteractionState.Scaling, true);
        } else if (target.kind === 'legacy-line') {
            this.selected = null;
            this.setState(InteractionState.DraggingHandle, true);
        } else {
            this.selected = null;
            this.setState(this.hovered === null ? InteractionState.Idle : InteractionState.Hover, true);
        }
    }

    pointerMove(point: InteractionPoint): InteractionMovement | null {
        const press = this.press;
        if (press === null) return null;
        const current = freezePoint(point);
        const delta = freezePoint({ x: current.x - press.last.x, y: current.y - press.last.y });
        const totalDelta = freezePoint({ x: current.x - press.start.x, y: current.y - press.start.y });
        press.last = current;
        const previous = this.state;
        if (Math.hypot(totalDelta.x, totalDelta.y) > this.dragThreshold) {
            if (press.target.kind === 'pane') this.setState(InteractionState.Panning);
            else if (press.target.kind === 'primitive' && press.target.draggable) {
                this.setState(press.target.object.role === 'handle'
                    ? InteractionState.DraggingHandle
                    : InteractionState.DraggingBody);
            }
        }
        return Object.freeze({
            point: current,
            startPoint: press.start,
            delta,
            totalDelta,
            state: this.state,
            started: previous !== this.state,
        });
    }

    pointerUp(point: InteractionPoint): InteractionMovement | null {
        const movement = this.pointerMove(point);
        const target = this.press?.target ?? null;
        this.press = null;
        if (target?.kind === 'primitive' && target.selectable) {
            this.selected = target.object;
            this.setState(InteractionState.Selected, true);
        } else if (target?.kind === 'legacy-line') {
            this.setState(this.hovered === null ? InteractionState.Idle : InteractionState.Hover, true);
        } else if (this.selected !== null) {
            this.setState(InteractionState.Selected, true);
        } else {
            this.setState(this.hovered === null ? InteractionState.Idle : InteractionState.Hover, true);
        }
        return movement;
    }

    cancel(): void {
        this.press = null;
        this.setState(this.selected !== null
            ? InteractionState.Selected
            : this.hovered === null ? InteractionState.Idle : InteractionState.Hover);
    }

    beginDrawing(): void {
        this.press = null;
        this.selected = null;
        this.setState(InteractionState.Drawing);
    }

    finishDrawing(selected: InteractionObjectRef | null = null): void {
        this.press = null;
        this.selected = selected;
        this.setState(selected === null
            ? this.hovered === null ? InteractionState.Idle : InteractionState.Hover
            : InteractionState.Selected, true);
    }

    clearSelection(): void {
        if (this.selected === null) return;
        this.selected = null;
        if (this.press === null) this.setState(this.hovered === null
            ? InteractionState.Idle
            : InteractionState.Hover);
    }

    forgetPrimitive(primitive: IChartPrimitive): void {
        let changed = false;
        if (this.hovered?.primitive === primitive) { this.hovered = null; changed = true; }
        if (this.selected?.primitive === primitive) { this.selected = null; changed = true; }
        if (this.press?.target.kind === 'primitive'
            && this.press.target.object.primitive === primitive) {
            this.press = null;
            changed = true;
        }
        if (!changed) return;
        this.setState(this.selected !== null
            ? InteractionState.Selected
            : this.hovered === null ? InteractionState.Idle : InteractionState.Hover, true);
    }

    private setState(next: InteractionState, force = false): void {
        if (this.state === next) {
            if (force) this.emit();
            return;
        }
        this.state = next;
        this.emit();
    }

    private emit(): void { this.changed(this.snapshot()); }
}

function freezePoint(point: InteractionPoint): InteractionPoint {
    return Object.freeze({ x: point.x, y: point.y });
}

function sameObject(left: InteractionObjectRef | null, right: InteractionObjectRef | null): boolean {
    return left === right || (left !== null && right !== null
        && left.primitive === right.primitive && left.id === right.id && left.role === right.role);
}
