export interface IDisposable {
    dispose(): void;
}

export type DisposeCallback = () => void;

export function toDisposable(callback: DisposeCallback): IDisposable {
    let active = true;
    return {
        dispose(): void {
            if (!active) return;
            active = false;
            callback();
        },
    };
}

/** Owns a group of resources and releases them once, in reverse order. */
export class DisposableStore implements IDisposable {
    private readonly items = new Set<IDisposable>();
    private disposed = false;

    get isDisposed(): boolean { return this.disposed; }

    add<T extends IDisposable>(item: T): T {
        if (this.disposed) item.dispose();
        else this.items.add(item);
        return item;
    }

    defer(callback: DisposeCallback): IDisposable {
        return this.add(toDisposable(callback));
    }

    listen<TEvent extends Event>(
        target: EventTarget,
        type: string,
        listener: (event: TEvent) => void,
        options?: boolean | AddEventListenerOptions,
    ): IDisposable {
        const eventListener = listener as EventListener;
        target.addEventListener(type, eventListener, options);
        return this.defer(() => target.removeEventListener(type, eventListener, options));
    }

    clear(): void {
        const owned = Array.from(this.items).reverse();
        this.items.clear();
        for (const item of owned) {
            try { item.dispose(); } catch { /* continue releasing sibling resources */ }
        }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.clear();
    }
}

/** A replaceable resource slot used for pending RAFs, requests and workers. */
export class MutableDisposable implements IDisposable {
    private current: IDisposable | null = null;
    private disposed = false;

    set value(next: IDisposable | null) {
        if (next === this.current) return;
        this.current?.dispose();
        if (this.disposed) next?.dispose();
        else this.current = next;
    }

    get value(): IDisposable | null { return this.current; }

    clear(): void { this.value = null; }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.current?.dispose();
        this.current = null;
    }
}
