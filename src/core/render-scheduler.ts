import type { IDisposable } from './disposable.js';

export const RenderDirty = {
    None: 0,
    Layout: 1 << 0,
    Base: 1 << 1,
    Axes: 1 << 2,
    Overlay: 1 << 3,
    All: (1 << 4) - 1,
} as const;

export type RenderDirtyFlags = number;

export interface AnimationFrameDriver {
    request(callback: FrameRequestCallback): number;
    cancel(handle: number): void;
}

const browserFrameDriver: AnimationFrameDriver = {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => cancelAnimationFrame(handle),
};

/** Coalesces invalidations and hands one immutable dirty mask to each frame. */
export class RenderScheduler implements IDisposable {
    private dirty: RenderDirtyFlags = RenderDirty.None;
    private frame: number | null = null;
    private disposed = false;

    constructor(
        private readonly render: (dirty: RenderDirtyFlags) => void,
        private readonly frames: AnimationFrameDriver = browserFrameDriver,
    ) {}

    get pendingDirty(): RenderDirtyFlags { return this.dirty; }
    get hasPendingFrame(): boolean { return this.frame !== null; }

    invalidate(dirty: RenderDirtyFlags): void {
        if (this.disposed || dirty === RenderDirty.None) return;
        this.dirty |= dirty;
        if (this.frame === null) this.frame = this.frames.request(() => this.flush());
    }

    /** Re-queues a paused browser frame while retaining its dirty mask. */
    reschedule(): void {
        if (this.disposed || this.dirty === RenderDirty.None) return;
        if (this.frame !== null) this.frames.cancel(this.frame);
        this.frame = this.frames.request(() => this.flush());
    }

    private flush(): void {
        if (this.disposed) return;
        this.frame = null;
        const dirty = this.dirty;
        this.dirty = RenderDirty.None;
        if (dirty !== RenderDirty.None) this.render(dirty);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        if (this.frame !== null) this.frames.cancel(this.frame);
        this.frame = null;
        this.dirty = RenderDirty.None;
    }
}
