export type DataChangeKind = 'replace' | 'update' | 'append' | 'prepend' | 'pop' | 'clear';

export interface DataChangeSet {
    readonly kind: DataChangeKind;
    readonly version: number;
    readonly fromIndex: number;
    readonly toIndex: number;
    readonly added: number;
    readonly removed: number;
}
