import type {
    AutoscaleInfo,
    HitTestContext,
    IChartPrimitive,
    IPrimitiveRenderer,
    LogicalRange,
    PrimitiveAttachedContext,
    PrimitiveAxisView,
    PrimitiveHit,
    PrimitivePaneView,
    PrimitiveRect,
} from '../../../src/index.js';

interface ExternalRangeOptions {
    readonly id: string;
    readonly low: number;
    readonly high: number;
    readonly color?: string;
}

interface ExternalRangeStats {
    readonly attached: number;
    readonly detached: number;
    readonly cleaned: number;
    readonly updates: number;
    readonly draws: number;
}

/**
 * Deliberately lives outside src/core and imports only the package root. It is
 * a consumer fixture, not a privileged built-in implementation.
 */
class ExternalRangePrimitive implements IChartPrimitive {
    private context: PrimitiveAttachedContext | null = null;
    private plot: PrimitiveRect | null = null;
    private low: number;
    private high: number;
    private lowY: number | null = null;
    private highY: number | null = null;
    private attachCount = 0;
    private detachCount = 0;
    private cleanupCount = 0;
    private updateCount = 0;
    private drawCount = 0;
    private readonly renderer: IPrimitiveRenderer = { draw: (target) => {
        this.plot = target.pane.plot;
        this.refreshCoordinates();
        if (this.lowY === null || this.highY === null) return;
        const top = Math.min(this.lowY, this.highY);
        const height = Math.abs(this.highY - this.lowY);
        target.useMediaCoordinateSpace(({ context }) => {
            context.fillStyle = this.options.color ?? 'rgba(0, 200, 255, 0.22)';
            context.fillRect(target.pane.plot.x, top, target.pane.plot.width, Math.max(1, height));
            this.drawCount++;
        });
    } };
    private readonly paneView: PrimitivePaneView = {
        zOrder: () => 'normal',
        renderer: () => this.renderer,
    };
    private readonly lowAxisView: PrimitiveAxisView = {
        coordinate: () => this.lowY,
        text: () => `LOW ${this.low.toFixed(2)}`,
        backgroundColor: () => '#007c91',
        textColor: () => '#ffffff',
    };
    private readonly highAxisView: PrimitiveAxisView = {
        coordinate: () => this.highY,
        text: () => `HIGH ${this.high.toFixed(2)}`,
        backgroundColor: () => '#007c91',
        textColor: () => '#ffffff',
    };

    constructor(private readonly options: ExternalRangeOptions) {
        if (options.id.trim().length === 0) throw new Error('external primitive id is required');
        this.low = finite(options.low);
        this.high = finite(options.high);
    }

    attached(context: PrimitiveAttachedContext): void {
        this.context = context;
        this.attachCount++;
        context.addDisposable(() => { this.cleanupCount++; });
        this.refreshCoordinates();
    }

    detached(): void {
        this.detachCount++;
        this.context = null;
        this.plot = null;
        this.lowY = null;
        this.highY = null;
    }

    updateAllViews(): void {
        this.updateCount++;
        this.refreshCoordinates();
    }

    paneViews(): readonly PrimitivePaneView[] { return [this.paneView]; }
    priceAxisViews(): readonly PrimitiveAxisView[] { return [this.lowAxisView, this.highAxisView]; }

    autoscaleInfo(_range: LogicalRange): AutoscaleInfo {
        return {
            priceRange: { min: Math.min(this.low, this.high), max: Math.max(this.low, this.high) },
            margins: { above: 4, below: 4 },
        };
    }

    hitTest(point: Readonly<{ x: number; y: number }>, context: HitTestContext): PrimitiveHit | null {
        if (context.location !== 'pane' || this.plot === null
            || this.lowY === null || this.highY === null) return null;
        const top = Math.min(this.lowY, this.highY);
        const bottom = Math.max(this.lowY, this.highY);
        if (point.x < this.plot.x || point.x > this.plot.x + this.plot.width
            || point.y < top || point.y > bottom) return null;
        return {
            id: this.options.id,
            role: 'body',
            cursor: 'pointer',
            zOrder: 'normal',
            data: { source: 'external-package-consumer' },
            interaction: { selectable: true, consumePointer: true },
        };
    }

    setRange(low: number, high: number): void {
        this.low = finite(low);
        this.high = finite(high);
        this.refreshCoordinates();
        this.context?.requestUpdate();
    }

    stats(): ExternalRangeStats {
        return Object.freeze({
            attached: this.attachCount,
            detached: this.detachCount,
            cleaned: this.cleanupCount,
            updates: this.updateCount,
            draws: this.drawCount,
        });
    }

    private refreshCoordinates(): void {
        this.lowY = this.context?.priceToCoordinate(this.low) ?? null;
        this.highY = this.context?.priceToCoordinate(this.high) ?? null;
    }
}

function finite(value: number): number {
    if (!Number.isFinite(value)) throw new Error('external primitive range must be finite');
    return value;
}

declare global {
    interface Window {
        ExternalRangePrimitive: typeof ExternalRangePrimitive;
    }
}

window.ExternalRangePrimitive = ExternalRangePrimitive;
