export interface RingBufferCheckpoint<T> {
    readonly values: readonly T[];
}

/** Fixed-capacity FIFO with O(1) append/eviction and stable logical indexing. */
export class RingBuffer<T> {
    private values: T[];
    private head = 0;
    private sizeValue = 0;

    constructor(readonly capacity: number) {
        if (!Number.isInteger(capacity) || capacity < 1)
            throw new RangeError('sschart: ring buffer capacity must be a positive integer');
        this.values = new Array<T>(capacity);
    }

    get size(): number { return this.sizeValue; }
    get full(): boolean { return this.sizeValue === this.capacity; }

    at(index: number): T | undefined {
        if (!Number.isInteger(index) || index < 0 || index >= this.sizeValue) return undefined;
        return this.values[(this.head + index) % this.capacity];
    }

    front(): T | undefined { return this.at(0); }
    back(): T | undefined { return this.at(this.sizeValue - 1); }

    push(value: T): void {
        if (this.sizeValue < this.capacity) {
            this.values[(this.head + this.sizeValue) % this.capacity] = value;
            this.sizeValue += 1;
            return;
        }
        this.values[this.head] = value;
        this.head = (this.head + 1) % this.capacity;
    }

    clear(): void {
        this.values = new Array<T>(this.capacity);
        this.head = 0;
        this.sizeValue = 0;
    }

    toArray(): T[] {
        const result = new Array<T>(this.sizeValue);
        for (let index = 0; index < this.sizeValue; index += 1)
            result[index] = this.values[(this.head + index) % this.capacity];
        return result;
    }

    checkpoint(): RingBufferCheckpoint<T> {
        return Object.freeze({ values: Object.freeze(this.toArray()) });
    }

    restore(checkpoint: RingBufferCheckpoint<T>): void {
        if (checkpoint === null || typeof checkpoint !== 'object'
            || !Array.isArray(checkpoint.values)
            || checkpoint.values.length > this.capacity) {
            throw new TypeError('sschart: invalid ring buffer checkpoint');
        }
        this.clear();
        for (const value of checkpoint.values) this.push(value);
    }
}

