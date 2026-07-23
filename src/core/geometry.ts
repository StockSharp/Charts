export interface Point {
    x: number;
    y: number;
}

export interface Size {
    width: number;
    height: number;
}

export interface Rect extends Point, Size {}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function containsPoint(rect: Rect, point: Point): boolean {
    return point.x >= rect.x && point.x <= rect.x + rect.width
        && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function insetRect(rect: Rect, left: number, top: number, right: number, bottom: number): Rect {
    return {
        x: rect.x + left,
        y: rect.y + top,
        width: Math.max(0, rect.width - left - right),
        height: Math.max(0, rect.height - top - bottom),
    };
}
