import type {
    IChartApi,
    IPaneApi,
    ISeriesApi,
} from '../core/chart-api.js';
import type { ICommandStack } from '../core/interaction/command-stack.js';
import type { PaneState } from '../core/model/pane-model.js';

export interface PaneControllerOptions {
    readonly chart: IChartApi;
    /** Defaults to the chart's shared command stack. */
    readonly commands?: ICommandStack;
}

export interface PaneControllerSnapshot {
    readonly id: string;
    readonly height: number;
    readonly minHeight: number;
    readonly order: number;
    readonly state: PaneState;
}

export type PaneControllerListener = (
    panes: readonly PaneControllerSnapshot[],
) => void;

/** Undoable pane sizing, ordering and visibility state without recreating pane contents. */
export class PaneController {
    private readonly chart: IChartApi;
    private readonly commands: ICommandStack;
    private readonly listeners = new Set<PaneControllerListener>();
    private disposed = false;

    constructor(options: PaneControllerOptions) {
        if (options === null || typeof options !== 'object'
            || options.chart === null || typeof options.chart !== 'object'
            || typeof options.chart.panes !== 'function'
            || typeof options.chart.commandStack !== 'function') {
            throw new TypeError('sschart: pane controller chart is invalid');
        }
        const commands = options.commands ?? options.chart.commandStack();
        if (commands === null || typeof commands !== 'object'
            || typeof commands.execute !== 'function') {
            throw new TypeError('sschart: pane controller command stack is invalid');
        }
        this.chart = options.chart;
        this.commands = commands;
    }

    panes(): readonly PaneControllerSnapshot[] {
        this.assertAlive();
        return snapshot(this.chart.panes());
    }

    resizePair(beforePaneId: string, afterPaneId: string, delta: number): boolean {
        this.assertAlive();
        if (!Number.isFinite(delta))
            throw new RangeError('sschart: pane resize delta must be finite');
        const before = this.panes();
        const beforeIndex = before.findIndex(pane => pane.id === paneId(beforePaneId));
        const afterIndex = before.findIndex(pane => pane.id === paneId(afterPaneId));
        if (beforeIndex < 0 || afterIndex < 0)
            throw new Error('sschart: pane resize references an unavailable pane');
        if (afterIndex !== beforeIndex + 1)
            throw new Error('sschart: pane resize requires adjacent panes in display order');
        const first = before[beforeIndex];
        const second = before[afterIndex];
        if (first.state !== 'normal' || second.state !== 'normal') return false;
        const total = first.height + second.height;
        const maximumFirst = total - second.minHeight;
        if (maximumFirst < first.minHeight) return false;
        const nextFirst = Math.min(maximumFirst, Math.max(first.minHeight, first.height + delta));
        if (Math.abs(nextFirst - first.height) < 1e-9) return false;
        const after = before.map(pane => pane.id === first.id
            ? Object.freeze({ ...pane, height: nextFirst })
            : pane.id === second.id
                ? Object.freeze({ ...pane, height: total - nextFirst })
                : pane);
        this.execute('Resize panes', before, Object.freeze(after));
        return true;
    }

    reorder(paneIdValue: string, targetIndex: number): boolean {
        this.assertAlive();
        if (!Number.isSafeInteger(targetIndex))
            throw new RangeError('sschart: pane target index must be a safe integer');
        const before = this.panes();
        if (targetIndex < 0 || targetIndex >= before.length)
            throw new RangeError('sschart: pane target index is outside the pane list');
        const id = paneId(paneIdValue);
        const currentIndex = before.findIndex(pane => pane.id === id);
        if (currentIndex < 0) throw new Error(`sschart: pane '${id}' is unavailable`);
        if (currentIndex === targetIndex) return false;
        const ordered = [...before];
        const [moved] = ordered.splice(currentIndex, 1);
        ordered.splice(targetIndex, 0, moved);
        const after = Object.freeze(ordered.map((pane, order) => Object.freeze({
            ...pane,
            order,
        })));
        this.execute('Reorder pane', before, after);
        return true;
    }

    moveSeries(series: ISeriesApi, targetPaneId: string): boolean {
        this.assertAlive();
        if (series === null || typeof series !== 'object')
            throw new TypeError('sschart: pane controller series is invalid');
        const panes = this.chart.panes();
        const source = panes.find(pane => pane.series().includes(series));
        if (source === undefined) throw new Error('sschart: series is unavailable');
        const targetId = paneId(targetPaneId);
        const target = panes.find(pane => pane.id() === targetId);
        if (target === undefined) throw new Error(`sschart: pane '${targetId}' is unavailable`);
        if (source === target) return false;
        const sourceId = source.id();
        this.commands.execute({
            label: 'Move series',
            execute: () => this.applySeriesMove(series, targetId),
            undo: () => this.applySeriesMove(series, sourceId),
        });
        return true;
    }

    setState(paneIdValue: string, state: PaneState): boolean {
        this.assertAlive();
        if (state !== 'normal' && state !== 'minimized' && state !== 'maximized')
            throw new TypeError('sschart: pane state is invalid');
        const id = paneId(paneIdValue);
        const before = this.panes();
        const current = before.find(pane => pane.id === id);
        if (current === undefined) throw new Error(`sschart: pane '${id}' is unavailable`);
        if (current.state === state) return false;
        const after = Object.freeze(before.map(pane => Object.freeze({
            ...pane,
            state: pane.id === id ? state
                : state === 'maximized' && pane.state === 'maximized' ? 'normal'
                    : pane.state,
        })));
        const action = state === 'minimized' ? 'Minimize pane'
            : state === 'maximized' ? 'Maximize pane' : 'Restore pane';
        this.execute(action, before, after);
        return true;
    }

    toggleMinimized(paneIdValue: string): boolean {
        const current = this.requirePane(paneIdValue);
        return this.setState(current.id, current.state === 'minimized' ? 'normal' : 'minimized');
    }

    toggleMaximized(paneIdValue: string): boolean {
        const current = this.requirePane(paneIdValue);
        return this.setState(current.id, current.state === 'maximized' ? 'normal' : 'maximized');
    }

    subscribe(listener: PaneControllerListener): void {
        this.assertAlive();
        if (typeof listener !== 'function')
            throw new TypeError('sschart: pane controller listener must be a function');
        this.listeners.add(listener);
    }

    unsubscribe(listener: PaneControllerListener): void { this.listeners.delete(listener); }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.listeners.clear();
    }

    private execute(
        label: string,
        before: readonly PaneControllerSnapshot[],
        after: readonly PaneControllerSnapshot[],
    ): void {
        this.commands.execute({
            label,
            execute: () => this.apply(after),
            undo: () => this.apply(before),
        });
    }

    private apply(state: readonly PaneControllerSnapshot[]): void {
        const panes = new Map(this.chart.panes().map(pane => [pane.id(), pane]));
        for (const item of state) {
            if (!panes.has(item.id))
                throw new Error(`sschart: pane '${item.id}' is unavailable`);
        }
        const ordered = [...state].sort((left, right) => (
            Number(left.state === 'maximized') - Number(right.state === 'maximized')
        ));
        for (const item of ordered) {
            panes.get(item.id)!.applyOptions({
                height: item.height,
                minHeight: item.minHeight,
                order: item.order,
                state: item.state,
            });
        }
        this.notify();
    }

    private applySeriesMove(series: ISeriesApi, paneIdValue: string): void {
        const target = this.chart.panes().find(pane => pane.id() === paneIdValue);
        if (target === undefined) throw new Error(`sschart: pane '${paneIdValue}' is unavailable`);
        this.chart.moveSeries(series, target);
        this.notify();
    }

    private notify(): void {
        const next = snapshot(this.chart.panes());
        for (const listener of this.listeners) {
            try { listener(next); } catch { /* listeners are observers */ }
        }
    }

    private requirePane(idValue: string): PaneControllerSnapshot {
        this.assertAlive();
        const id = paneId(idValue);
        const pane = this.panes().find(item => item.id === id);
        if (pane === undefined) throw new Error(`sschart: pane '${id}' is unavailable`);
        return pane;
    }

    private assertAlive(): void {
        if (this.disposed) throw new Error('sschart: pane controller is disposed');
    }
}

function snapshot(panes: readonly IPaneApi[]): readonly PaneControllerSnapshot[] {
    return Object.freeze(panes.map(pane => {
        const options = pane.options();
        return Object.freeze({
            id: pane.id(),
            height: options.height,
            minHeight: options.minHeight,
            order: options.order,
            state: options.state,
        });
    }));
}

function paneId(value: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError('sschart: pane id must be a non-empty string');
    return value.trim();
}
