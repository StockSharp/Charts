export interface ICommand {
    readonly label?: string;
    execute(): void;
    undo(): void;
    redo?(): void;
}

export interface CommandStackSnapshot {
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly undoLabel: string | null;
    readonly redoLabel: string | null;
    readonly undoCount: number;
    readonly redoCount: number;
    readonly transactionActive: boolean;
}

export type CommandStackListener = (snapshot: CommandStackSnapshot) => void;

export interface ICommandStack {
    execute(command: ICommand): void;
    undo(): boolean;
    redo(): boolean;
    beginTransaction(label?: string): void;
    commitTransaction(): boolean;
    rollbackTransaction(): boolean;
    transaction<T>(label: string, action: () => T): T;
    clear(): void;
    snapshot(): CommandStackSnapshot;
    subscribe(listener: CommandStackListener): void;
    unsubscribe(listener: CommandStackListener): void;
}

interface Transaction {
    readonly label: string;
    readonly commands: ICommand[];
}

/** Bounded, failure-safe command history shared by drawings and trading overlays. */
export class CommandStack implements ICommandStack {
    private readonly undoStack: ICommand[] = [];
    private readonly redoStack: ICommand[] = [];
    private readonly listeners = new Set<CommandStackListener>();
    private activeTransaction: Transaction | null = null;
    private running = false;
    private disposed = false;

    constructor(private readonly historyLimit = 100) {
        if (!Number.isInteger(historyLimit) || historyLimit < 1)
            throw new RangeError('sschart: command history limit must be a positive integer');
    }

    execute(command: ICommand): void {
        this.assertAlive();
        this.assertCommand(command);
        this.run(() => command.execute());
        if (this.activeTransaction !== null) {
            this.activeTransaction.commands.push(command);
        } else {
            this.record(command);
        }
        this.emit();
    }

    undo(): boolean {
        this.assertAlive();
        this.assertNoTransaction('undo');
        const command = this.undoStack.pop();
        if (command === undefined) return false;
        try {
            this.run(() => command.undo());
        } catch (error) {
            this.undoStack.push(command);
            throw error;
        }
        this.redoStack.push(command);
        this.emit();
        return true;
    }

    redo(): boolean {
        this.assertAlive();
        this.assertNoTransaction('redo');
        const command = this.redoStack.pop();
        if (command === undefined) return false;
        try {
            this.run(() => (command.redo ?? command.execute).call(command));
        } catch (error) {
            this.redoStack.push(command);
            throw error;
        }
        this.undoStack.push(command);
        this.trimHistory();
        this.emit();
        return true;
    }

    beginTransaction(label = ''): void {
        this.assertAlive();
        if (this.activeTransaction !== null)
            throw new Error('sschart: nested command transactions are not supported');
        if (this.running) throw new Error('sschart: cannot begin a transaction from a command callback');
        this.activeTransaction = { label, commands: [] };
        this.emit();
    }

    commitTransaction(): boolean {
        const transaction = this.requireTransaction();
        this.activeTransaction = null;
        if (transaction.commands.length === 0) {
            this.emit();
            return false;
        }
        const command = transaction.commands.length === 1 && transaction.label.length === 0
            ? transaction.commands[0]
            : new CompositeCommand(transaction.label, transaction.commands);
        this.record(command);
        this.emit();
        return true;
    }

    rollbackTransaction(): boolean {
        const transaction = this.requireTransaction();
        this.activeTransaction = null;
        if (transaction.commands.length === 0) {
            this.emit();
            return false;
        }
        let failure: unknown = null;
        for (const command of [...transaction.commands].reverse()) {
            try { this.run(() => command.undo()); } catch (error) { failure ??= error; }
        }
        this.emit();
        if (failure !== null) throw failure;
        return true;
    }

    transaction<T>(label: string, action: () => T): T {
        this.beginTransaction(label);
        try {
            const result = action();
            this.commitTransaction();
            return result;
        } catch (error) {
            try { this.rollbackTransaction(); } catch { /* preserve action failure */ }
            throw error;
        }
    }

    clear(): void {
        this.assertAlive();
        this.assertNoTransaction('clear history');
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.emit();
    }

    snapshot(): CommandStackSnapshot {
        return Object.freeze({
            canUndo: this.undoStack.length > 0,
            canRedo: this.redoStack.length > 0,
            undoLabel: labelOf(this.undoStack[this.undoStack.length - 1]),
            redoLabel: labelOf(this.redoStack[this.redoStack.length - 1]),
            undoCount: this.undoStack.length,
            redoCount: this.redoStack.length,
            transactionActive: this.activeTransaction !== null,
        });
    }

    subscribe(listener: CommandStackListener): void {
        this.assertAlive();
        this.listeners.add(listener);
    }
    unsubscribe(listener: CommandStackListener): void { this.listeners.delete(listener); }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.activeTransaction = null;
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this.listeners.clear();
    }

    private record(command: ICommand): void {
        this.undoStack.push(command);
        this.redoStack.length = 0;
        this.trimHistory();
    }

    private trimHistory(): void {
        const excess = this.undoStack.length - this.historyLimit;
        if (excess > 0) this.undoStack.splice(0, excess);
    }

    private run(action: () => void): void {
        if (this.running) throw new Error('sschart: command callbacks cannot mutate their command stack');
        this.running = true;
        try { action(); } finally { this.running = false; }
    }

    private assertCommand(command: ICommand): void {
        if (command === null || typeof command !== 'object'
            || typeof command.execute !== 'function' || typeof command.undo !== 'function')
            throw new TypeError('sschart: command must implement execute() and undo()');
    }

    private assertAlive(): void {
        if (this.disposed) throw new Error('sschart: command stack is disposed');
    }

    private assertNoTransaction(operation: string): void {
        if (this.activeTransaction !== null)
            throw new Error(`sschart: cannot ${operation} during a command transaction`);
        if (this.running) throw new Error(`sschart: cannot ${operation} from a command callback`);
    }

    private requireTransaction(): Transaction {
        if (this.activeTransaction === null)
            throw new Error('sschart: no command transaction is active');
        if (this.running) throw new Error('sschart: cannot finish a transaction from a command callback');
        return this.activeTransaction;
    }

    private emit(): void {
        const snapshot = this.snapshot();
        for (const listener of this.listeners) {
            try { listener(snapshot); } catch { /* listeners are observers */ }
        }
    }
}

class CompositeCommand implements ICommand {
    readonly label: string;
    private readonly commands: readonly ICommand[];

    constructor(label: string, commands: readonly ICommand[]) {
        this.label = label;
        this.commands = Object.freeze([...commands]);
    }

    execute(): void {
        const completed: ICommand[] = [];
        try {
            for (const command of this.commands) {
                (command.redo ?? command.execute).call(command);
                completed.push(command);
            }
        } catch (error) {
            for (const command of completed.reverse()) {
                try { command.undo(); } catch { /* preserve original composite failure */ }
            }
            throw error;
        }
    }

    redo(): void { this.execute(); }

    undo(): void {
        const undone: ICommand[] = [];
        try {
            for (const command of [...this.commands].reverse()) {
                command.undo();
                undone.push(command);
            }
        } catch (error) {
            for (const command of undone.reverse()) {
                try { (command.redo ?? command.execute).call(command); } catch { /* preserve undo failure */ }
            }
            throw error;
        }
    }
}

function labelOf(command: ICommand | undefined): string | null {
    const label = command?.label?.trim();
    return label === undefined || label.length === 0 ? null : label;
}
