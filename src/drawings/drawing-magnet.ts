import type {
    IPaneApi,
    ISeriesApi,
} from '../core/chart-api.js';
import type { TimedSeriesData } from '../series/registry.js';
import type { DrawingPoint } from './drawing-model.js';

export const DrawingMagnetMode = Object.freeze({
    None: 'none',
    Weak: 'weak',
    Strong: 'strong',
} as const);
export type DrawingMagnetMode = typeof DrawingMagnetMode[keyof typeof DrawingMagnetMode];

export interface DrawingMagnetOptions {
    readonly mode?: DrawingMagnetMode;
    /** Maximum vertical distance in CSS pixels for weak snapping. */
    readonly maxDistance?: number;
}

export interface DrawingMagnetSettings {
    readonly mode: DrawingMagnetMode;
    readonly maxDistance: number;
}

export interface DrawingMagnetInput {
    readonly time: number;
    readonly price: number;
    readonly coordinate: Readonly<{ x: number; y: number }>;
    readonly pane: IPaneApi;
    readonly seriesData: ReadonlyMap<ISeriesApi<any, any>, TimedSeriesData>;
}

export interface DrawingMagnetResult {
    readonly point: DrawingPoint;
    readonly snapped: boolean;
    readonly series: ISeriesApi<any, any> | null;
    readonly distance: number | null;
}

/** Resolves drawing anchors against renderer-defined values in screen space. */
export class DrawingMagnet {
    private settings: DrawingMagnetSettings = Object.freeze({
        mode: DrawingMagnetMode.Weak,
        maxDistance: 10,
    });

    constructor(options: DrawingMagnetOptions = {}) { this.applyOptions(options); }

    options(): DrawingMagnetSettings { return this.settings; }

    applyOptions(patch: DrawingMagnetOptions): void {
        if (patch === null || typeof patch !== 'object')
            throw new TypeError('sschart: drawing magnet options must be an object');
        const mode = patch.mode ?? this.settings.mode;
        if (!Object.values(DrawingMagnetMode).includes(mode))
            throw new RangeError(`sschart: unknown drawing magnet mode '${String(mode)}'`);
        const maxDistance = patch.maxDistance ?? this.settings.maxDistance;
        if (!Number.isFinite(maxDistance) || maxDistance < 0)
            throw new RangeError('sschart: drawing magnet maxDistance must be a non-negative number');
        this.settings = Object.freeze({ mode, maxDistance });
    }

    resolve(input: DrawingMagnetInput): DrawingMagnetResult {
        validateInput(input);
        const base = freezePoint(input.time, input.price);
        if (this.settings.mode === DrawingMagnetMode.None)
            return result(base, false, null, null);

        let best: {
            readonly point: DrawingPoint;
            readonly series: ISeriesApi<any, any>;
            readonly distance: number;
        } | null = null;
        for (const series of input.pane.series()) {
            const data = input.seriesData.get(series);
            if (data === undefined) continue;
            for (const price of series.magnetValues(data)) {
                if (!Number.isFinite(price)) continue;
                const coordinate = series.priceToCoordinate(price);
                if (coordinate === null || !Number.isFinite(coordinate)) continue;
                const distance = Math.abs(coordinate - input.coordinate.y);
                if (best !== null && distance >= best.distance) continue;
                best = {
                    point: freezePoint(
                        Number.isFinite(data.time) ? data.time : input.time,
                        price,
                    ),
                    series,
                    distance,
                };
            }
        }
        if (best === null
            || (this.settings.mode === DrawingMagnetMode.Weak
                && best.distance > this.settings.maxDistance)) {
            return result(base, false, null, null);
        }
        return result(best.point, true, best.series, best.distance);
    }
}

function validateInput(input: DrawingMagnetInput): void {
    if (input === null || typeof input !== 'object')
        throw new TypeError('sschart: drawing magnet input must be an object');
    if (!Number.isFinite(input.time) || !Number.isFinite(input.price))
        throw new RangeError('sschart: drawing magnet input time and price must be finite');
    if (input.coordinate === null || typeof input.coordinate !== 'object'
        || !Number.isFinite(input.coordinate.x) || !Number.isFinite(input.coordinate.y)) {
        throw new RangeError('sschart: drawing magnet coordinate must be finite');
    }
    if (input.pane === null || typeof input.pane !== 'object'
        || typeof input.pane.series !== 'function') {
        throw new TypeError('sschart: drawing magnet pane is required');
    }
    if (input.seriesData === null || typeof input.seriesData !== 'object'
        || typeof input.seriesData.get !== 'function') {
        throw new TypeError('sschart: drawing magnet seriesData map is required');
    }
}

function freezePoint(time: number, price: number): DrawingPoint {
    return Object.freeze({ time, price });
}

function result(
    point: DrawingPoint,
    snapped: boolean,
    series: ISeriesApi<any, any> | null,
    distance: number | null,
): DrawingMagnetResult {
    return Object.freeze({ point, snapped, series, distance });
}
