import { PriceScaleModel } from '../scale/price-scale.js';

export type PaneState = 'normal' | 'minimized' | 'maximized';

export interface PaneOptions {
    id?: string;
    height?: number;
    minHeight?: number;
    order?: number;
    state?: PaneState;
}

export class PaneModel<TSeries> {
    readonly id: string;
    height: number;
    minHeight: number;
    order: number;
    state: PaneState;
    priceZoom = 1;
    readonly series: TSeries[] = [];
    private readonly scales = new Map<string, PriceScaleModel>();

    constructor(options: Required<PaneOptions>) {
        this.id = options.id;
        this.height = options.height;
        this.minHeight = options.minHeight;
        this.order = options.order;
        this.state = options.state;
    }

    applyOptions(options: Omit<PaneOptions, 'id'>): void {
        if (options.height !== undefined && Number.isFinite(options.height))
            this.height = Math.max(0, options.height);
        if (options.minHeight !== undefined && Number.isFinite(options.minHeight))
            this.minHeight = Math.max(0, options.minHeight);
        if (options.order !== undefined && Number.isFinite(options.order)) this.order = options.order;
        if (options.state !== undefined) this.state = options.state;
    }

    addSeries(series: TSeries): void {
        if (!this.series.includes(series)) this.series.push(series);
    }

    removeSeries(series: TSeries): boolean {
        const index = this.series.indexOf(series);
        if (index < 0) return false;
        this.series.splice(index, 1);
        return true;
    }

    priceScale(id = 'right'): PriceScaleModel {
        let scale = this.scales.get(id);
        if (scale === undefined) {
            scale = new PriceScaleModel(id);
            this.scales.set(id, scale);
        }
        return scale;
    }

    priceScaleIds(): readonly string[] { return Object.freeze([...this.scales.keys()]); }
}
