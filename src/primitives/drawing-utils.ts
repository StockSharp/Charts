import type { LineStyleValue } from '../core/chart-api.js';

export function lineDash(style: LineStyleValue, width: number): readonly number[] {
    switch (style) {
        case 1: return [width, width];
        case 2: return [width * 3, width * 2];
        case 3: return [width * 6, width * 3];
        case 4: return [width, width * 4];
        default: return [];
    }
}

export function alignStroke(coordinate: number, width: number, pixelRatio: number): number {
    const bitmapWidth = Math.max(1, Math.round(width * pixelRatio));
    return (Math.round(coordinate * pixelRatio) + (bitmapWidth % 2) / 2) / pixelRatio;
}

export function readableTextColor(background: string): string {
    const match = /^#?([0-9a-fA-F]{6})$/.exec(background.trim());
    if (match === null) return '#ffffff';
    const value = Number.parseInt(match[1], 16);
    const luminance = 0.299 * ((value >> 16) & 255)
        + 0.587 * ((value >> 8) & 255)
        + 0.114 * (value & 255);
    return luminance > 150 ? '#111111' : '#ffffff';
}

export function concisePrice(price: number): string {
    if (Number.isInteger(price)) return String(price);
    return price.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
}

export function pointSegmentDistance(
    point: Readonly<{ x: number; y: number }>,
    first: Readonly<{ x: number; y: number }>,
    second: Readonly<{ x: number; y: number }>,
): number {
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return Math.hypot(point.x - first.x, point.y - first.y);
    const projection = Math.max(0, Math.min(1,
        ((point.x - first.x) * dx + (point.y - first.y) * dy) / lengthSquared,
    ));
    return Math.hypot(
        point.x - (first.x + projection * dx),
        point.y - (first.y + projection * dy),
    );
}
