import type {
    BitmapCoordinatesRenderingScope,
    CanvasRenderTarget,
    MediaCoordinatesRenderingScope,
    PrimitivePaneGeometry,
    PrimitiveSize,
} from '../primitives/primitive-api.js';

/** Canvas adapter that restores transform/style/clip state after every scope. */
export class CanvasRenderTarget2D implements CanvasRenderTarget {
    readonly pane: PrimitivePaneGeometry;
    private readonly mediaSize: PrimitiveSize;
    private readonly bitmapSize: PrimitiveSize;

    constructor(
        private readonly context: CanvasRenderingContext2D,
        width: number,
        height: number,
        private readonly pixelRatio: number,
        pane: PrimitivePaneGeometry,
    ) {
        this.mediaSize = Object.freeze({ width, height });
        this.bitmapSize = Object.freeze({
            width: Math.round(width * pixelRatio),
            height: Math.round(height * pixelRatio),
        });
        this.pane = freezePane(pane);
    }

    useMediaCoordinateSpace<T>(consumer: (scope: MediaCoordinatesRenderingScope) => T): T {
        this.context.save();
        this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
        try {
            return consumer(Object.freeze({
                context: this.context,
                mediaSize: this.mediaSize,
            }));
        } finally {
            this.context.restore();
        }
    }

    useBitmapCoordinateSpace<T>(consumer: (scope: BitmapCoordinatesRenderingScope) => T): T {
        this.context.save();
        this.context.setTransform(1, 0, 0, 1, 0, 0);
        try {
            return consumer(Object.freeze({
                context: this.context,
                mediaSize: this.mediaSize,
                bitmapSize: this.bitmapSize,
                horizontalPixelRatio: this.pixelRatio,
                verticalPixelRatio: this.pixelRatio,
            }));
        } finally {
            this.context.restore();
        }
    }
}

function freezePane(pane: PrimitivePaneGeometry): PrimitivePaneGeometry {
    const plot = Object.freeze({ ...pane.plot });
    return Object.freeze({ ...pane, plot });
}
