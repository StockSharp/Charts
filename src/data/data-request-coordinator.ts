export interface DataRequestTicket {
    readonly generation: number;
    readonly signal: AbortSignal;
}

/** Owns one request generation and makes stale-result checks explicit. */
export class DataRequestCoordinator {
    private generation = 0;
    private active: AbortController | null = null;
    private disposed = false;

    begin(): DataRequestTicket {
        if (this.disposed) throw new Error('sschart: data request coordinator is disposed');
        this.active?.abort();
        const controller = new AbortController();
        this.active = controller;
        return Object.freeze({ generation: ++this.generation, signal: controller.signal });
    }

    isCurrent(ticket: DataRequestTicket): boolean {
        return !this.disposed
            && ticket.generation === this.generation
            && ticket.signal === this.active?.signal
            && !ticket.signal.aborted;
    }

    cancel(): void {
        if (this.disposed) return;
        this.generation++;
        this.active?.abort();
        this.active = null;
    }

    dispose(): void {
        if (this.disposed) return;
        this.cancel();
        this.disposed = true;
    }
}
