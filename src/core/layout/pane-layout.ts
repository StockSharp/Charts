import { clamp, containsPoint, type Point, type Rect } from '../geometry.js';
import type { PaneState } from '../model/pane-model.js';

export interface PaneLayoutItem {
    id: string;
    height: number;
    minHeight: number;
    order: number;
    state: PaneState;
}

export interface PaneLayoutRect extends Rect {
    paneId: string;
    state: PaneState;
}

export interface PaneSplitter {
    beforePaneId: string;
    afterPaneId: string;
    rect: Rect;
}

export interface PaneLayoutResult {
    panes: readonly PaneLayoutRect[];
    splitters: readonly PaneSplitter[];
}

export class PaneLayout {
    constructor(readonly splitterSize = 5) {}

    compute(width: number, height: number, items: readonly PaneLayoutItem[]): PaneLayoutResult {
        const ordered = items.slice().sort((a, b) => a.order - b.order);
        if (ordered.length === 0 || width <= 0 || height <= 0) return { panes: [], splitters: [] };

        const maximized = ordered.find((item) => item.state === 'maximized');
        if (maximized !== undefined) {
            return {
                panes: [{ paneId: maximized.id, state: maximized.state, x: 0, y: 0, width, height }],
                splitters: [],
            };
        }

        const splitterTotal = this.splitterSize * Math.max(0, ordered.length - 1);
        const available = Math.max(0, height - splitterTotal);
        const sizes = this.distribute(available, ordered);
        const panes: PaneLayoutRect[] = [];
        const splitters: PaneSplitter[] = [];
        let y = 0;
        for (let i = 0; i < ordered.length; i++) {
            const item = ordered[i];
            const paneHeight = i === ordered.length - 1
                ? Math.max(0, height - y)
                : sizes[i];
            panes.push({ paneId: item.id, state: item.state, x: 0, y, width, height: paneHeight });
            y += paneHeight;
            if (i < ordered.length - 1) {
                splitters.push({
                    beforePaneId: item.id,
                    afterPaneId: ordered[i + 1].id,
                    rect: { x: 0, y, width, height: this.splitterSize },
                });
                y += this.splitterSize;
            }
        }
        return { panes, splitters };
    }

    hitTestSplitter(layout: PaneLayoutResult, point: Point): PaneSplitter | null {
        return layout.splitters.find((splitter) => containsPoint(splitter.rect, point)) ?? null;
    }

    resizePair(items: readonly PaneLayoutItem[], splitter: PaneSplitter, delta: number): void {
        const before = items.find((item) => item.id === splitter.beforePaneId);
        const after = items.find((item) => item.id === splitter.afterPaneId);
        if (before === undefined || after === undefined
            || before.state !== 'normal' || after.state !== 'normal') return;
        const total = before.height + after.height;
        const maximumBefore = total - after.minHeight;
        if (maximumBefore < before.minHeight) return;
        const beforeHeight = clamp(before.height + delta, before.minHeight, maximumBefore);
        before.height = beforeHeight;
        after.height = total - beforeHeight;
    }

    private distribute(available: number, items: readonly PaneLayoutItem[]): number[] {
        const sizes = items.map((item) => item.state === 'minimized'
            ? item.minHeight
            : Math.max(item.minHeight, item.height));
        const minimums = items.map((item) => item.minHeight);
        let total = sizes.reduce((sum, size) => sum + size, 0);

        if (total > available) {
            let overflow = total - available;
            let shrinkable = items.map((item, index) => item.state === 'normal' && sizes[index] > minimums[index]);
            while (overflow > 0.01 && shrinkable.some(Boolean)) {
                const capacity = sizes.reduce((sum, size, index) => sum + (shrinkable[index] ? size - minimums[index] : 0), 0);
                if (capacity <= 0) break;
                for (let i = 0; i < sizes.length; i++) {
                    if (!shrinkable[i]) continue;
                    const reduction = Math.min(sizes[i] - minimums[i], overflow * ((sizes[i] - minimums[i]) / capacity));
                    sizes[i] -= reduction;
                }
                total = sizes.reduce((sum, size) => sum + size, 0);
                overflow = total - available;
                shrinkable = shrinkable.map((active, index) => active && sizes[index] > minimums[index] + 0.01);
            }
            if (overflow > 0.01 && total > 0) {
                const ratio = available / total;
                for (let i = 0; i < sizes.length; i++) sizes[i] *= ratio;
            }
        } else if (total < available) {
            const normal = items.map((item, index) => item.state === 'normal' ? index : -1).filter((index) => index >= 0);
            const recipients = normal.length > 0 ? normal : items.map((_, index) => index);
            const extra = available - total;
            const weight = recipients.reduce((sum, index) => sum + Math.max(1, sizes[index]), 0);
            for (const index of recipients) sizes[index] += extra * (Math.max(1, sizes[index]) / weight);
        }

        return sizes;
    }
}
