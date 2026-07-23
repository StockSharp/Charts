import type {
    CrosshairEvent,
    CrosshairListener,
    IChartApi,
    RangeListener,
    Time,
    TimeRange,
} from '../core/chart-api.js';
import type { ChartDataSelection } from '../data/chart-data-controller.js';

export type WorkspaceMaybePromise<T> = T | Promise<T>;

export interface WorkspaceSelectionSnapshot {
    readonly selection: ChartDataSelection | null;
}

/** Structural subset implemented directly by ChartDataController. */
export interface WorkspaceSelectionController {
    snapshot(): WorkspaceSelectionSnapshot;
    setSelection(selection: ChartDataSelection): WorkspaceMaybePromise<unknown>;
    subscribe(listener: (snapshot: WorkspaceSelectionSnapshot) => void): void;
    unsubscribe(listener: (snapshot: WorkspaceSelectionSnapshot) => void): void;
}

export interface WorkspaceChartCell {
    readonly chart: IChartApi;
    readonly data?: WorkspaceSelectionController;
    /** Defaults to chart.remove(). */
    readonly dispose?: () => void;
}

export interface WorkspaceChartFactoryContext {
    readonly id: string;
    readonly index: number;
    readonly host: HTMLElement;
}

export type WorkspaceChartFactory = (
    context: WorkspaceChartFactoryContext,
) => WorkspaceChartCell;

export interface WorkspaceLinkOptions {
    readonly symbol?: boolean;
    readonly resolution?: boolean;
}

export interface WorkspaceSyncOptions {
    readonly range?: boolean;
    readonly crosshair?: boolean;
}

export interface MultiChartWorkspaceOptions {
    readonly container: HTMLElement;
    readonly createChart: WorkspaceChartFactory;
    readonly count?: number;
    /** Null/undefined selects an automatic near-square grid. */
    readonly columns?: number | null;
    readonly links?: WorkspaceLinkOptions;
    readonly sync?: WorkspaceSyncOptions;
}

export interface WorkspaceLayoutRequest {
    readonly count: number;
    readonly columns?: number | null;
}

export interface WorkspaceCellSnapshot {
    readonly id: string;
    readonly index: number;
    readonly active: boolean;
    readonly selection: ChartDataSelection | null;
    readonly visibleRange: TimeRange | null;
    readonly crosshairTime: Time | null;
}

export const WorkspaceSyncErrorKind = Object.freeze({
    Selection: 'selection',
    Range: 'range',
    Crosshair: 'crosshair',
    Lifecycle: 'lifecycle',
} as const);
export type WorkspaceSyncErrorKind = typeof WorkspaceSyncErrorKind[
    keyof typeof WorkspaceSyncErrorKind
];

export interface WorkspaceSyncError {
    readonly cellId: string;
    readonly kind: WorkspaceSyncErrorKind;
    readonly error: unknown;
}

export interface MultiChartWorkspaceSnapshot {
    readonly count: number;
    readonly columns: number;
    readonly rows: number;
    readonly activeId: string;
    readonly links: Readonly<{ symbol: boolean; resolution: boolean }>;
    readonly sync: Readonly<{ range: boolean; crosshair: boolean }>;
    readonly cells: readonly WorkspaceCellSnapshot[];
    readonly errors: readonly WorkspaceSyncError[];
}

export type MultiChartWorkspaceListener = (snapshot: MultiChartWorkspaceSnapshot) => void;

interface WorkspaceEntry {
    readonly id: string;
    readonly host: HTMLElement;
    readonly cell: WorkspaceChartCell;
    readonly rangeListener: RangeListener;
    readonly crosshairListener: CrosshairListener;
    readonly selectionListener: (snapshot: WorkspaceSelectionSnapshot) => void;
    readonly activationListener: () => void;
    selection: ChartDataSelection | null;
    visibleRange: TimeRange | null;
    crosshairTime: Time | null;
}

interface ContainerStyleSnapshot {
    readonly display: string;
    readonly gridTemplateColumns: string;
    readonly gridTemplateRows: string;
    readonly gap: string;
    readonly minWidth: string;
    readonly minHeight: string;
}

const MAX_CELLS = 64;
const MAX_ERRORS = 32;

/**
 * Owns top-level chart cells only. A chart's indicator panes remain internal to that chart and
 * are never counted, laid out or synchronized as workspace cells.
 */
export class MultiChartWorkspace {
    private readonly container: HTMLElement;
    private readonly factory: WorkspaceChartFactory;
    private readonly entries: WorkspaceEntry[] = [];
    private readonly listeners = new Set<MultiChartWorkspaceListener>();
    private readonly errors: WorkspaceSyncError[] = [];
    private readonly originalStyle: ContainerStyleSnapshot;
    private columnsValue: number | null;
    private linksValue: Readonly<{ symbol: boolean; resolution: boolean }>;
    private syncValue: Readonly<{ range: boolean; crosshair: boolean }>;
    private activeIdValue = '';
    private nextId = 1;
    private syncingSelection = 0;
    private syncingRange = 0;
    private syncingCrosshair = 0;
    private disposed = false;

    constructor(options: MultiChartWorkspaceOptions) {
        if (!plainObject(options) || !validContainer(options.container))
            throw new TypeError('sschart: multi-chart workspace options are invalid');
        if (typeof options.createChart !== 'function')
            throw new TypeError('sschart: multi-chart workspace createChart must be a function');
        this.container = options.container;
        this.factory = options.createChart;
        this.columnsValue = normalizeColumns(options.columns);
        this.linksValue = normalizeLinks(options.links);
        this.syncValue = normalizeSync(options.sync);
        this.originalStyle = Object.freeze({
            display: this.container.style.display,
            gridTemplateColumns: this.container.style.gridTemplateColumns,
            gridTemplateRows: this.container.style.gridTemplateRows,
            gap: this.container.style.gap,
            minWidth: this.container.style.minWidth,
            minHeight: this.container.style.minHeight,
        });
        const count = cellCount(options.count ?? 1);
        try {
            this.resize(count, false);
        } catch (error) {
            this.disposeEntries();
            this.restoreContainerStyle();
            throw error;
        }
    }

    snapshot(): MultiChartWorkspaceSnapshot {
        this.assertAlive();
        return this.snapshotValue();
    }

    cells(): readonly WorkspaceCellSnapshot[] {
        this.assertAlive();
        return this.cellSnapshots();
    }

    chart(id: string): IChartApi | undefined {
        this.assertAlive();
        return this.find(id)?.cell.chart;
    }

    host(id: string): HTMLElement | undefined {
        this.assertAlive();
        return this.find(id)?.host;
    }

    add(id?: string): WorkspaceCellSnapshot {
        this.assertAlive();
        if (this.entries.length >= MAX_CELLS)
            throw new RangeError(`sschart: workspace supports at most ${MAX_CELLS} charts`);
        const entry = this.createEntry(id === undefined ? this.createId() : identifier(id, 'workspace cell id'));
        this.entries.push(entry);
        if (!this.activeIdValue) this.activeIdValue = entry.id;
        this.reindex();
        this.applyLayout();
        this.emit();
        return this.cellSnapshot(entry, this.entries.length - 1);
    }

    remove(id: string): boolean {
        this.assertAlive();
        const index = this.indexOf(id);
        if (index < 0) return false;
        if (this.entries.length === 1)
            throw new RangeError('sschart: multi-chart workspace must keep at least one chart');
        const [entry] = this.entries.splice(index, 1);
        this.disposeEntry(entry);
        if (this.activeIdValue === entry.id)
            this.activeIdValue = this.entries[Math.min(index, this.entries.length - 1)].id;
        this.reindex();
        this.applyLayout();
        this.emit();
        return true;
    }

    setCount(count: number): void {
        this.assertAlive();
        this.resize(cellCount(count), true);
    }

    setColumns(columns: number | null): void {
        this.assertAlive();
        const normalized = normalizeColumns(columns);
        if (this.columnsValue === normalized) return;
        this.columnsValue = normalized;
        this.applyLayout();
        this.emit();
    }

    setLayout(layout: WorkspaceLayoutRequest): void {
        this.assertAlive();
        if (!plainObject(layout))
            throw new TypeError('sschart: workspace layout request must be an object');
        const count = cellCount(layout.count);
        const columns = layout.columns === undefined
            ? this.columnsValue : normalizeColumns(layout.columns);
        this.resize(count, false);
        this.columnsValue = columns;
        this.applyLayout();
        this.emit();
    }

    activate(id: string): void {
        this.assertAlive();
        const entry = this.requireEntry(id);
        if (this.activeIdValue === entry.id) return;
        this.activeIdValue = entry.id;
        this.emit();
    }

    setLinks(options: WorkspaceLinkOptions): void {
        this.assertAlive();
        const normalized = normalizeLinks(options);
        if (sameLinks(this.linksValue, normalized)) return;
        this.linksValue = normalized;
        const active = this.find(this.activeIdValue);
        if (active !== undefined && active.selection !== null)
            this.propagateSelection(active, active.selection);
        this.emit();
    }

    setSync(options: WorkspaceSyncOptions): void {
        this.assertAlive();
        const normalized = normalizeSync(options);
        if (sameSync(this.syncValue, normalized)) return;
        this.syncValue = normalized;
        const active = this.find(this.activeIdValue);
        if (active !== undefined) {
            if (normalized.range && active.visibleRange !== null)
                this.propagateRange(active, active.visibleRange);
            if (normalized.crosshair) this.propagateCrosshair(active, active.crosshairTime);
        }
        this.emit();
    }

    setSelection(id: string, selection: ChartDataSelection): Promise<unknown> {
        this.assertAlive();
        const entry = this.requireEntry(id);
        if (entry.cell.data === undefined)
            throw new Error(`sschart: workspace cell '${entry.id}' has no data controller`);
        const data = entry.cell.data;
        const normalized = normalizeSelection(selection);
        let result: WorkspaceMaybePromise<unknown>;
        this.syncingSelection++;
        try { result = data.setSelection(normalized); }
        catch (error) {
            entry.selection = this.readSelection(data);
            this.recordError(entry.id, WorkspaceSyncErrorKind.Selection, error);
            this.emit();
            return Promise.reject(error);
        } finally {
            this.syncingSelection--;
        }
        entry.selection = normalized;
        if (this.linksValue.symbol || this.linksValue.resolution)
            this.propagateSelection(entry, normalized);
        this.emit();
        return Promise.resolve(result).catch((error) => {
            entry.selection = this.readSelection(data);
            this.recordError(entry.id, WorkspaceSyncErrorKind.Selection, error);
            this.emit();
            throw error;
        });
    }

    clearErrors(): void {
        this.assertAlive();
        if (this.errors.length === 0) return;
        this.errors.length = 0;
        this.emit();
    }

    subscribe(listener: MultiChartWorkspaceListener): void {
        this.assertAlive();
        if (typeof listener !== 'function')
            throw new TypeError('sschart: multi-chart workspace listener must be a function');
        this.listeners.add(listener);
    }

    unsubscribe(listener: MultiChartWorkspaceListener): void {
        this.listeners.delete(listener);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposeEntries();
        this.restoreContainerStyle();
        this.listeners.clear();
        this.disposed = true;
    }

    private resize(count: number, notify: boolean): void {
        if (count === this.entries.length) {
            if (notify) this.emit();
            return;
        }
        if (count > this.entries.length) {
            const created: WorkspaceEntry[] = [];
            try {
                while (this.entries.length < count) {
                    const entry = this.createEntry(this.createId());
                    this.entries.push(entry);
                    created.push(entry);
                }
            } catch (error) {
                for (let index = created.length - 1; index >= 0; index--) {
                    const entry = created[index];
                    const position = this.entries.indexOf(entry);
                    if (position >= 0) this.entries.splice(position, 1);
                    this.disposeEntry(entry);
                }
                throw error;
            }
        } else {
            while (this.entries.length > count) {
                const entry = this.entries.pop()!;
                this.disposeEntry(entry);
            }
        }
        if (!this.activeIdValue || !this.find(this.activeIdValue))
            this.activeIdValue = this.entries[0].id;
        this.reindex();
        this.applyLayout();
        if (notify) this.emit();
    }

    private createEntry(id: string): WorkspaceEntry {
        if (this.find(id)) throw new Error(`sschart: duplicate workspace cell id '${id}'`);
        const host = this.container.ownerDocument.createElement('div');
        host.classList.add('sschart-workspace-cell');
        host.dataset.sschartWorkspaceCell = id;
        host.style.minWidth = '0';
        host.style.minHeight = '0';
        host.style.position = 'relative';
        host.tabIndex = 0;
        this.container.appendChild(host);
        let cell: WorkspaceChartCell | undefined;
        try {
            cell = this.factory(Object.freeze({ id, index: this.entries.length, host }));
            validateCell(cell, id);
        } catch (error) {
            disposeFactoryResult(cell);
            host.remove();
            throw error;
        }

        let entry!: WorkspaceEntry;
        const rangeListener: RangeListener = (range) => this.handleRange(entry, range);
        const crosshairListener: CrosshairListener = (event) => this.handleCrosshair(entry, event);
        const selectionListener = (snapshot: WorkspaceSelectionSnapshot): void => (
            this.handleSelection(entry, snapshot)
        );
        const activationListener = (): void => {
            if (!this.disposed) this.activate(entry.id);
        };
        entry = {
            id,
            host,
            cell,
            rangeListener,
            crosshairListener,
            selectionListener,
            activationListener,
            selection: cell.data === undefined ? null : this.readSelection(cell.data),
            visibleRange: freezeRange(cell.chart.timeScale().getVisibleRange()),
            crosshairTime: null,
        };
        try {
            cell.chart.timeScale().subscribeVisibleTimeRangeChange(rangeListener);
            cell.chart.subscribeCrosshairMove(crosshairListener);
            cell.data?.subscribe(selectionListener);
            host.addEventListener('pointerdown', activationListener);
            host.addEventListener('focusin', activationListener);
        } catch (error) {
            this.disposeEntry(entry);
            throw error;
        }
        return entry;
    }

    private disposeEntry(entry: WorkspaceEntry): void {
        entry.host.removeEventListener('pointerdown', entry.activationListener);
        entry.host.removeEventListener('focusin', entry.activationListener);
        try { entry.cell.data?.unsubscribe(entry.selectionListener); }
        catch (error) { this.recordError(entry.id, WorkspaceSyncErrorKind.Lifecycle, error); }
        try { entry.cell.chart.timeScale().unsubscribeVisibleTimeRangeChange(entry.rangeListener); }
        catch (error) { this.recordError(entry.id, WorkspaceSyncErrorKind.Lifecycle, error); }
        try { entry.cell.chart.unsubscribeCrosshairMove(entry.crosshairListener); }
        catch (error) { this.recordError(entry.id, WorkspaceSyncErrorKind.Lifecycle, error); }
        try { (entry.cell.dispose ?? (() => entry.cell.chart.remove()))(); }
        catch (error) { this.recordError(entry.id, WorkspaceSyncErrorKind.Lifecycle, error); }
        entry.host.remove();
    }

    private disposeEntries(): void {
        while (this.entries.length > 0) this.disposeEntry(this.entries.pop()!);
        this.activeIdValue = '';
    }

    private handleSelection(entry: WorkspaceEntry, snapshot: WorkspaceSelectionSnapshot): void {
        if (this.disposed) return;
        const selection = normalizeOptionalSelection(snapshot?.selection);
        if (sameSelection(entry.selection, selection)) return;
        entry.selection = selection;
        if (this.syncingSelection > 0) return;
        if (selection !== null && (this.linksValue.symbol || this.linksValue.resolution))
            this.propagateSelection(entry, selection);
        this.emit();
    }

    private propagateSelection(source: WorkspaceEntry, selection: ChartDataSelection): void {
        if (!this.linksValue.symbol && !this.linksValue.resolution) return;
        this.syncingSelection++;
        try {
            for (const target of this.entries) {
                if (target === source || target.cell.data === undefined) continue;
                const data = target.cell.data;
                const current = target.selection;
                const next = Object.freeze({
                    symbol: this.linksValue.symbol
                        ? selection.symbol : (current?.symbol ?? selection.symbol),
                    resolution: this.linksValue.resolution
                        ? selection.resolution : (current?.resolution ?? selection.resolution),
                });
                if (sameSelection(current, next)) continue;
                target.selection = next;
                let result: WorkspaceMaybePromise<unknown>;
                try { result = data.setSelection(next); }
                catch (error) {
                    target.selection = this.readSelection(data);
                    this.recordError(target.id, WorkspaceSyncErrorKind.Selection, error);
                    continue;
                }
                void Promise.resolve(result).catch((error) => {
                    target.selection = this.readSelection(data);
                    this.recordError(target.id, WorkspaceSyncErrorKind.Selection, error);
                    this.emit();
                });
            }
        } finally {
            this.syncingSelection--;
        }
    }

    private handleRange(entry: WorkspaceEntry, range: TimeRange | null): void {
        if (this.disposed) return;
        entry.visibleRange = freezeRange(range);
        if (this.syncingRange > 0) return;
        if (this.syncValue.range && range !== null) this.propagateRange(entry, range);
        this.emit();
    }

    private propagateRange(source: WorkspaceEntry, range: TimeRange): void {
        this.syncingRange++;
        try {
            for (const target of this.entries) {
                if (target === source || sameRange(target.visibleRange, range)) continue;
                try {
                    target.cell.chart.timeScale().setVisibleRange(range);
                    target.visibleRange = freezeRange(range);
                }
                catch (error) { this.recordError(target.id, WorkspaceSyncErrorKind.Range, error); }
            }
        } finally {
            this.syncingRange--;
        }
    }

    private handleCrosshair(entry: WorkspaceEntry, event: CrosshairEvent): void {
        if (this.disposed) return;
        entry.crosshairTime = event.time;
        if (this.syncingCrosshair > 0) return;
        if (this.syncValue.crosshair) this.propagateCrosshair(entry, event.time);
        this.emit();
    }

    private propagateCrosshair(source: WorkspaceEntry, time: Time | null): void {
        this.syncingCrosshair++;
        try {
            for (const target of this.entries) {
                if (target === source || target.crosshairTime === time) continue;
                try {
                    if (time === null) target.cell.chart.clearCrosshairPosition();
                    else target.cell.chart.setCrosshairPosition({ time });
                    target.crosshairTime = time;
                } catch (error) {
                    this.recordError(target.id, WorkspaceSyncErrorKind.Crosshair, error);
                }
            }
        } finally {
            this.syncingCrosshair--;
        }
    }

    private applyLayout(): void {
        const columns = this.actualColumns();
        const rows = Math.ceil(this.entries.length / columns);
        this.container.style.display = 'grid';
        this.container.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
        this.container.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
        this.container.style.gap = this.originalStyle.gap || '1px';
        this.container.style.minWidth = '0';
        this.container.style.minHeight = '0';
    }

    private restoreContainerStyle(): void {
        Object.assign(this.container.style, this.originalStyle);
    }

    private actualColumns(): number {
        const automatic = Math.ceil(Math.sqrt(this.entries.length));
        return Math.max(1, Math.min(this.entries.length, this.columnsValue ?? automatic));
    }

    private reindex(): void {
        this.entries.forEach((entry, index) => {
            entry.host.dataset.sschartWorkspaceIndex = String(index);
        });
    }

    private cellSnapshots(): readonly WorkspaceCellSnapshot[] {
        return Object.freeze(this.entries.map((entry, index) => this.cellSnapshot(entry, index)));
    }

    private cellSnapshot(entry: WorkspaceEntry, index: number): WorkspaceCellSnapshot {
        return Object.freeze({
            id: entry.id,
            index,
            active: entry.id === this.activeIdValue,
            selection: cloneSelection(entry.selection),
            visibleRange: freezeRange(entry.visibleRange),
            crosshairTime: entry.crosshairTime,
        });
    }

    private snapshotValue(): MultiChartWorkspaceSnapshot {
        const columns = this.actualColumns();
        return Object.freeze({
            count: this.entries.length,
            columns,
            rows: Math.ceil(this.entries.length / columns),
            activeId: this.activeIdValue,
            links: this.linksValue,
            sync: this.syncValue,
            cells: this.cellSnapshots(),
            errors: Object.freeze(this.errors.map(error => Object.freeze({ ...error }))),
        });
    }

    private createId(): string {
        let id: string;
        do { id = `workspace-chart-${this.nextId++}`; } while (this.find(id));
        return id;
    }

    private find(id: string): WorkspaceEntry | undefined {
        const normalized = identifier(id, 'workspace cell id');
        return this.entries.find(entry => entry.id === normalized);
    }

    private indexOf(id: string): number {
        const normalized = identifier(id, 'workspace cell id');
        return this.entries.findIndex(entry => entry.id === normalized);
    }

    private requireEntry(id: string): WorkspaceEntry {
        const normalized = identifier(id, 'workspace cell id');
        const entry = this.entries.find(candidate => candidate.id === normalized);
        if (entry === undefined) throw new RangeError(`sschart: unknown workspace cell '${normalized}'`);
        return entry;
    }

    private readSelection(data: WorkspaceSelectionController): ChartDataSelection | null {
        return normalizeOptionalSelection(data.snapshot()?.selection);
    }

    private recordError(cellId: string, kind: WorkspaceSyncErrorKind, error: unknown): void {
        this.errors.push(Object.freeze({ cellId, kind, error }));
        if (this.errors.length > MAX_ERRORS) this.errors.splice(0, this.errors.length - MAX_ERRORS);
    }

    private emit(): void {
        if (this.disposed) return;
        const snapshot = this.snapshotValue();
        for (const listener of this.listeners) {
            try { listener(snapshot); } catch { /* observers cannot break workspace synchronization */ }
        }
    }

    private assertAlive(): void {
        if (this.disposed) throw new Error('sschart: multi-chart workspace is disposed');
    }
}

function normalizeLinks(value: WorkspaceLinkOptions | undefined): Readonly<{
    symbol: boolean;
    resolution: boolean;
}> {
    if (value !== undefined && !plainObject(value))
        throw new TypeError('sschart: workspace links must be an object');
    if (value?.symbol !== undefined && typeof value.symbol !== 'boolean')
        throw new TypeError('sschart: workspace symbol link must be boolean');
    if (value?.resolution !== undefined && typeof value.resolution !== 'boolean')
        throw new TypeError('sschart: workspace resolution link must be boolean');
    return Object.freeze({ symbol: value?.symbol === true, resolution: value?.resolution === true });
}

function normalizeSync(value: WorkspaceSyncOptions | undefined): Readonly<{
    range: boolean;
    crosshair: boolean;
}> {
    if (value !== undefined && !plainObject(value))
        throw new TypeError('sschart: workspace sync must be an object');
    if (value?.range !== undefined && typeof value.range !== 'boolean')
        throw new TypeError('sschart: workspace range sync must be boolean');
    if (value?.crosshair !== undefined && typeof value.crosshair !== 'boolean')
        throw new TypeError('sschart: workspace crosshair sync must be boolean');
    return Object.freeze({ range: value?.range === true, crosshair: value?.crosshair === true });
}

function normalizeSelection(value: ChartDataSelection): ChartDataSelection {
    if (!plainObject(value)) throw new TypeError('sschart: workspace selection is required');
    return Object.freeze({
        symbol: identifier(value.symbol, 'workspace symbol'),
        resolution: identifier(value.resolution, 'workspace resolution'),
    });
}

function normalizeOptionalSelection(value: unknown): ChartDataSelection | null {
    return value === null || value === undefined ? null : normalizeSelection(value as ChartDataSelection);
}

function cloneSelection(value: ChartDataSelection | null): ChartDataSelection | null {
    return value === null ? null : Object.freeze({ ...value });
}

function freezeRange(value: TimeRange | null): TimeRange | null {
    if (value === null) return null;
    if (!plainObject(value) || !Number.isFinite(value.from) || !Number.isFinite(value.to)
        || !(value.to > value.from)) {
        throw new TypeError('sschart: workspace visible range is invalid');
    }
    return Object.freeze({ from: value.from, to: value.to });
}

function sameSelection(left: ChartDataSelection | null, right: ChartDataSelection | null): boolean {
    return left === right || (left !== null && right !== null
        && left.symbol === right.symbol && left.resolution === right.resolution);
}

function sameRange(left: TimeRange | null, right: TimeRange | null): boolean {
    return left === right || (left !== null && right !== null
        && left.from === right.from && left.to === right.to);
}

function sameLinks(
    left: Readonly<{ symbol: boolean; resolution: boolean }>,
    right: Readonly<{ symbol: boolean; resolution: boolean }>,
): boolean {
    return left.symbol === right.symbol && left.resolution === right.resolution;
}

function sameSync(
    left: Readonly<{ range: boolean; crosshair: boolean }>,
    right: Readonly<{ range: boolean; crosshair: boolean }>,
): boolean {
    return left.range === right.range && left.crosshair === right.crosshair;
}

function cellCount(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_CELLS)
        throw new RangeError(`sschart: workspace chart count must be from 1 to ${MAX_CELLS}`);
    return value as number;
}

function normalizeColumns(value: number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_CELLS)
        throw new RangeError(`sschart: workspace columns must be from 1 to ${MAX_CELLS} or null`);
    return value;
}

function identifier(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: ${name} must be a non-empty string`);
    return value.trim();
}

function validateCell(value: WorkspaceChartCell, id: string): void {
    if (!plainObject(value) || !validChart(value.chart))
        throw new TypeError(`sschart: workspace factory returned an invalid chart for '${id}'`);
    if (value.data !== undefined && !validSelectionController(value.data))
        throw new TypeError(`sschart: workspace factory returned an invalid data controller for '${id}'`);
    if (value.dispose !== undefined && typeof value.dispose !== 'function')
        throw new TypeError(`sschart: workspace factory returned an invalid disposer for '${id}'`);
}

function disposeFactoryResult(value: WorkspaceChartCell | undefined): void {
    if (!plainObject(value)) return;
    if (typeof value.dispose === 'function') {
        try {
            value.dispose();
            return;
        } catch { /* fall through to the chart's base lifecycle */ }
    }
    if (!validChart(value.chart)) return;
    try { value.chart.remove(); } catch { /* preserve the factory/validation error */ }
}

function validContainer(value: unknown): value is HTMLElement {
    if (value === null || typeof value !== 'object') return false;
    const container = value as HTMLElement;
    return container.style !== undefined
        && container.ownerDocument !== undefined
        && typeof container.ownerDocument.createElement === 'function'
        && typeof container.appendChild === 'function';
}

function validChart(value: unknown): value is IChartApi {
    if (value === null || typeof value !== 'object') return false;
    const chart = value as IChartApi;
    return typeof chart.timeScale === 'function'
        && typeof chart.subscribeCrosshairMove === 'function'
        && typeof chart.unsubscribeCrosshairMove === 'function'
        && typeof chart.setCrosshairPosition === 'function'
        && typeof chart.clearCrosshairPosition === 'function'
        && typeof chart.remove === 'function';
}

function validSelectionController(value: unknown): value is WorkspaceSelectionController {
    if (value === null || typeof value !== 'object') return false;
    const data = value as WorkspaceSelectionController;
    return typeof data.snapshot === 'function'
        && typeof data.setSelection === 'function'
        && typeof data.subscribe === 'function'
        && typeof data.unsubscribe === 'function';
}

function plainObject(value: unknown): value is Readonly<Record<string, any>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
