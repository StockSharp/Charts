import { PaneModel, type PaneOptions } from './pane-model.js';
import { TimeScaleModel } from '../scale/time-scale.js';

const DEFAULT_MAIN_PANE: Required<PaneOptions> = {
    id: 'main',
    height: 320,
    minHeight: 80,
    order: 0,
    state: 'normal',
};

/** Root ownership model: one time scale and an ordered collection of panes. */
export class ChartModel<TSeries> {
    readonly timeScale = new TimeScaleModel();
    private readonly paneList: PaneModel<TSeries>[] = [];
    private nextPaneId = 1;

    constructor(mainOptions: PaneOptions = {}) {
        this.paneList.push(new PaneModel({ ...DEFAULT_MAIN_PANE, ...mainOptions, id: mainOptions.id ?? 'main' }));
    }

    get mainPane(): PaneModel<TSeries> { return this.paneList[0]; }
    get panes(): readonly PaneModel<TSeries>[] {
        return this.paneList.slice().sort((a, b) => a.order - b.order);
    }
    get series(): readonly TSeries[] { return this.panes.flatMap((pane) => pane.series); }

    addPane(options: PaneOptions = {}): PaneModel<TSeries> {
        const id = options.id ?? this.allocatePaneId();
        if (this.paneList.some((pane) => pane.id === id)) throw new Error(`sschart: duplicate pane id '${id}'`);
        const pane = new PaneModel<TSeries>({
            id,
            height: options.height ?? 160,
            minHeight: options.minHeight ?? 48,
            order: options.order ?? this.paneList.length,
            state: options.state ?? 'normal',
        });
        this.paneList.push(pane);
        return pane;
    }

    removePane(pane: PaneModel<TSeries>): TSeries[] {
        if (pane === this.mainPane) throw new Error('sschart: the main pane cannot be removed');
        const index = this.paneList.indexOf(pane);
        if (index < 0) return [];
        this.paneList.splice(index, 1);
        return pane.series.splice(0);
    }

    paneById(id: string): PaneModel<TSeries> | undefined {
        return this.paneList.find((pane) => pane.id === id);
    }

    paneForSeries(series: TSeries): PaneModel<TSeries> | undefined {
        return this.paneList.find((pane) => pane.series.includes(series));
    }

    addSeries(series: TSeries, pane: PaneModel<TSeries> = this.mainPane): void {
        if (!this.paneList.includes(pane)) throw new Error('sschart: pane does not belong to this chart');
        const current = this.paneForSeries(series);
        if (current === pane) return;
        current?.removeSeries(series);
        pane.addSeries(series);
    }

    removeSeries(series: TSeries): boolean {
        return this.paneForSeries(series)?.removeSeries(series) ?? false;
    }

    private allocatePaneId(): string {
        let id: string;
        do id = `pane-${this.nextPaneId++}`;
        while (this.paneList.some((pane) => pane.id === id));
        return id;
    }
}
