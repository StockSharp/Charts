export interface PriceScaleMargins {
    top: number;
    bottom: number;
}

export interface PriceRange {
    min: number;
    max: number;
    mode: number;
    baseValue: number;
    baseValues: ReadonlyMap<object, number>;
}

/** Mutable state of one named price scale inside one pane. */
export class PriceScaleModel {
    margins: PriceScaleMargins = { top: 0, bottom: 0 };
    mode = 0;
    frozenRange: PriceRange | null = null;

    constructor(readonly id: string) {}

    setMargins(margins: Partial<PriceScaleMargins>): void {
        this.margins = {
            top: Math.min(0.9, Math.max(0, margins.top ?? this.margins.top)),
            bottom: Math.min(0.9, Math.max(0, margins.bottom ?? this.margins.bottom)),
        };
        this.frozenRange = null;
    }

    setMode(mode: number): void {
        if (!Number.isInteger(mode) || mode < 0 || mode > 3)
            throw new RangeError(`sschart: unsupported price scale mode '${mode}'`);
        this.mode = mode;
        this.frozenRange = null;
    }
}
