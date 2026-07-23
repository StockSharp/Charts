import type { Time } from '../core/chart-api.js';
import type { Unsubscribe } from '../data/data-source.js';
import {
    ChartBracketRole,
    TradingIntentKind,
    normalizeChartExecutions,
    normalizeChartOrderRequest,
    normalizeChartOrders,
    normalizeChartPositions,
    normalizeChartQuote,
    normalizeTradingIntent,
    normalizeTradingModelOptions,
    type CancelOrderIntent,
    type ChartExecution,
    type ChartOrder,
    type ChartOrderModification,
    type ChartOrderRequest,
    type ChartPosition,
    type ChartQuote,
    type ClosePositionIntent,
    type CreateStopLossIntent,
    type CreateTakeProfitIntent,
    type EditStopLossIntent,
    type EditTakeProfitIntent,
    type ModifyOrderIntent,
    type PlaceOrderIntent,
    type RemoveStopLossIntent,
    type RemoveTakeProfitIntent,
    type ReversePositionIntent,
    type TradingIntent,
    type TradingIntentKind as TradingIntentKindValue,
    type TradingModelNormalizationOptions,
} from './model.js';

export const TradingLayerChangeKind = Object.freeze({
    Orders: 'orders',
    Positions: 'positions',
    Executions: 'executions',
    Quote: 'quote',
} as const);
export type TradingLayerChangeKind = typeof TradingLayerChangeKind[
    keyof typeof TradingLayerChangeKind
];

export const TradingIntentOutcomeStatus = Object.freeze({
    Accepted: 'accepted',
    Rejected: 'rejected',
} as const);
export type TradingIntentOutcomeStatus = typeof TradingIntentOutcomeStatus[
    keyof typeof TradingIntentOutcomeStatus
];

export interface TradingLayerOptions extends TradingModelNormalizationOptions {
    /** Injectable Unix-seconds clock for deterministic hosts/tests. */
    readonly clock?: () => Time;
    /** Injectable stable request id factory. Sequence starts at one per layer. */
    readonly intentIdFactory?: (sequence: number) => string;
}

export interface TradingEntityUpdate<TEntity> {
    readonly previous: TEntity;
    readonly current: TEntity;
}

export interface TradingCollectionChange<TEntity, TKind extends TradingLayerChangeKind> {
    readonly kind: TKind;
    readonly version: number;
    readonly added: readonly TEntity[];
    readonly updated: readonly TradingEntityUpdate<TEntity>[];
    readonly removed: readonly TEntity[];
    /** True when stable ids are identical but their host-defined display order changed. */
    readonly orderChanged: boolean;
}

export type TradingOrdersChange = TradingCollectionChange<
    ChartOrder,
    typeof TradingLayerChangeKind.Orders
>;
export type TradingPositionsChange = TradingCollectionChange<
    ChartPosition,
    typeof TradingLayerChangeKind.Positions
>;
export type TradingExecutionsChange = TradingCollectionChange<
    ChartExecution,
    typeof TradingLayerChangeKind.Executions
>;

export interface TradingQuoteChange {
    readonly kind: typeof TradingLayerChangeKind.Quote;
    readonly version: number;
    readonly previous: ChartQuote | null;
    readonly current: ChartQuote | null;
}

export type TradingLayerChange =
    | TradingOrdersChange
    | TradingPositionsChange
    | TradingExecutionsChange
    | TradingQuoteChange;

export interface TradingLayerSnapshot {
    readonly version: number;
    readonly orders: readonly ChartOrder[];
    readonly positions: readonly ChartPosition[];
    readonly executions: readonly ChartExecution[];
    readonly quote: ChartQuote | null;
}

export interface TradingIntentResolution {
    readonly intentId: string;
    readonly status: TradingIntentOutcomeStatus;
    readonly reason?: string;
}

export interface TradingIntentOutcome extends TradingIntentResolution {
    readonly intent: TradingIntent;
}

export interface ITradingLayer {
    setOrders(orders: readonly ChartOrder[]): void;
    setPositions(positions: readonly ChartPosition[]): void;
    setExecutions(executions: readonly ChartExecution[]): void;
    setQuote(quote: ChartQuote | null): void;

    state(): TradingLayerSnapshot;
    normalizationOptions(): TradingModelNormalizationOptions;
    subscribeChanges(handler: (change: TradingLayerChange) => void): Unsubscribe;
    subscribeIntents(handler: (intent: TradingIntent) => void): Unsubscribe;
    subscribeIntentOutcomes(handler: (outcome: TradingIntentOutcome) => void): Unsubscribe;
    pendingIntents(): readonly TradingIntent[];
    resolveIntent(resolution: TradingIntentResolution): void;

    requestPlaceOrder(order: ChartOrderRequest): PlaceOrderIntent;
    requestModifyOrder(orderId: string, changes: ChartOrderModification): ModifyOrderIntent;
    requestCancelOrder(orderId: string): CancelOrderIntent;
    requestClosePosition(positionId: string, quantity?: number): ClosePositionIntent;
    requestReversePosition(positionId: string, quantity?: number): ReversePositionIntent;
    requestCreateStopLoss(
        positionId: string,
        price: number,
        quantity?: number,
    ): CreateStopLossIntent;
    requestEditStopLoss(orderId: string, price: number, quantity?: number): EditStopLossIntent;
    requestRemoveStopLoss(orderId: string): RemoveStopLossIntent;
    requestCreateTakeProfit(
        positionId: string,
        price: number,
        quantity?: number,
    ): CreateTakeProfitIntent;
    requestEditTakeProfit(
        orderId: string,
        price: number,
        quantity?: number,
    ): EditTakeProfitIntent;
    requestRemoveTakeProfit(orderId: string): RemoveTakeProfitIntent;

    dispose(): void;
}

const EMPTY_ORDERS: readonly ChartOrder[] = Object.freeze([]);
const EMPTY_POSITIONS: readonly ChartPosition[] = Object.freeze([]);
const EMPTY_EXECUTIONS: readonly ChartExecution[] = Object.freeze([]);

/**
 * Owns only normalized presentation state and user intents. It has no transport, account,
 * connector or retry dependency; the host remains the sole owner of broker communication.
 */
export class TradingLayer implements ITradingLayer {
    private readonly modelOptions: TradingModelNormalizationOptions;
    private readonly clock: () => Time;
    private readonly intentIdFactory: (sequence: number) => string;
    private readonly changeHandlers = new Set<(change: TradingLayerChange) => void>();
    private readonly intentHandlers = new Set<(intent: TradingIntent) => void>();
    private readonly outcomeHandlers = new Set<(outcome: TradingIntentOutcome) => void>();
    private readonly pendingIntentMap = new Map<string, TradingIntent>();
    private ordersValue = EMPTY_ORDERS;
    private positionsValue = EMPTY_POSITIONS;
    private executionsValue = EMPTY_EXECUTIONS;
    private quoteValue: ChartQuote | null = null;
    private snapshotValue: TradingLayerSnapshot;
    private versionValue = 0;
    private intentSequence = 0;
    private disposed = false;

    constructor(options: TradingLayerOptions) {
        if (!plainObject(options))
            throw new TypeError('sschart: trading layer options must be an object');
        this.modelOptions = normalizeTradingModelOptions(options);
        if (options.clock !== undefined && typeof options.clock !== 'function')
            throw new TypeError('sschart: trading layer clock must be a function');
        if (options.intentIdFactory !== undefined && typeof options.intentIdFactory !== 'function') {
            throw new TypeError('sschart: trading layer intentIdFactory must be a function');
        }
        this.clock = options.clock ?? (() => Date.now() / 1000);
        this.intentIdFactory = options.intentIdFactory
            ?? (sequence => `trading-intent-${sequence}`);
        this.snapshotValue = this.makeSnapshot();
    }

    setOrders(values: readonly ChartOrder[]): void {
        this.assertActive();
        const next = normalizeChartOrders(values, this.modelOptions);
        const diff = diffCollection(this.ordersValue, next, equalOrder);
        if (!diff.changed) return;
        this.ordersValue = diff.values;
        const version = this.advanceVersion();
        this.emitChange(Object.freeze({
            kind: TradingLayerChangeKind.Orders,
            version,
            added: diff.added,
            updated: diff.updated,
            removed: diff.removed,
            orderChanged: diff.orderChanged,
        }));
    }

    setPositions(values: readonly ChartPosition[]): void {
        this.assertActive();
        const next = normalizeChartPositions(values, this.modelOptions);
        const diff = diffCollection(this.positionsValue, next, equalPosition);
        if (!diff.changed) return;
        this.positionsValue = diff.values;
        const version = this.advanceVersion();
        this.emitChange(Object.freeze({
            kind: TradingLayerChangeKind.Positions,
            version,
            added: diff.added,
            updated: diff.updated,
            removed: diff.removed,
            orderChanged: diff.orderChanged,
        }));
    }

    setExecutions(values: readonly ChartExecution[]): void {
        this.assertActive();
        const next = normalizeChartExecutions(values, this.modelOptions);
        const diff = diffCollection(this.executionsValue, next, equalExecution);
        if (!diff.changed) return;
        this.executionsValue = diff.values;
        const version = this.advanceVersion();
        this.emitChange(Object.freeze({
            kind: TradingLayerChangeKind.Executions,
            version,
            added: diff.added,
            updated: diff.updated,
            removed: diff.removed,
            orderChanged: diff.orderChanged,
        }));
    }

    setQuote(value: ChartQuote | null): void {
        this.assertActive();
        const next = value === null ? null : normalizeChartQuote(value, this.modelOptions);
        if (equalOptional(this.quoteValue, next, equalQuote)) return;
        const previous = this.quoteValue;
        this.quoteValue = next;
        const version = this.advanceVersion();
        this.emitChange(Object.freeze({
            kind: TradingLayerChangeKind.Quote,
            version,
            previous,
            current: next,
        }));
    }

    state(): TradingLayerSnapshot {
        this.assertActive();
        return this.snapshotValue;
    }

    normalizationOptions(): TradingModelNormalizationOptions {
        this.assertActive();
        return this.modelOptions;
    }

    subscribeChanges(handler: (change: TradingLayerChange) => void): Unsubscribe {
        this.assertActive();
        assertHandler(handler, 'trading layer change handler');
        this.changeHandlers.add(handler);
        let subscribed = true;
        return () => {
            if (!subscribed) return;
            subscribed = false;
            this.changeHandlers.delete(handler);
        };
    }

    subscribeIntents(handler: (intent: TradingIntent) => void): Unsubscribe {
        this.assertActive();
        assertHandler(handler, 'trading layer intent handler');
        this.intentHandlers.add(handler);
        let subscribed = true;
        return () => {
            if (!subscribed) return;
            subscribed = false;
            this.intentHandlers.delete(handler);
        };
    }

    subscribeIntentOutcomes(handler: (outcome: TradingIntentOutcome) => void): Unsubscribe {
        this.assertActive();
        assertHandler(handler, 'trading layer intent outcome handler');
        this.outcomeHandlers.add(handler);
        let subscribed = true;
        return () => {
            if (!subscribed) return;
            subscribed = false;
            this.outcomeHandlers.delete(handler);
        };
    }

    pendingIntents(): readonly TradingIntent[] {
        this.assertActive();
        return Object.freeze([...this.pendingIntentMap.values()]);
    }

    resolveIntent(resolution: TradingIntentResolution): void {
        this.assertActive();
        if (!plainObject(resolution))
            throw new TypeError('sschart: trading intent resolution must be an object');
        const intentId = normalizedLookupId(resolution.intentId, 'trading intent resolution id');
        if (!Object.values(TradingIntentOutcomeStatus).includes(resolution.status))
            throw new TypeError('sschart: trading intent resolution status is invalid');
        const reason = resolution.reason === undefined
            ? undefined : normalizedText(resolution.reason, 'trading intent resolution reason');
        const intent = this.pendingIntentMap.get(intentId);
        if (intent === undefined)
            throw new RangeError(`sschart: unknown pending trading intent '${intentId}'`);
        this.pendingIntentMap.delete(intentId);
        const outcome: TradingIntentOutcome = Object.freeze({
            intentId,
            status: resolution.status,
            ...(reason === undefined ? {} : { reason }),
            intent,
        });
        for (const handler of [...this.outcomeHandlers]) handler(outcome);
    }

    requestPlaceOrder(order: ChartOrderRequest): PlaceOrderIntent {
        this.assertActive();
        const normalized = normalizeChartOrderRequest(order, this.modelOptions);
        return this.publish({
            ...this.intentBase(TradingIntentKind.PlaceOrder),
            order: normalized,
        }) as PlaceOrderIntent;
    }

    requestModifyOrder(orderId: string, changes: ChartOrderModification): ModifyOrderIntent {
        const order = this.editableOrder(orderId, 'modify');
        return this.publish({
            ...this.intentBase(TradingIntentKind.ModifyOrder),
            orderId: order.id,
            ...(order.revision === undefined ? {} : { expectedRevision: order.revision }),
            changes,
        }) as ModifyOrderIntent;
    }

    requestCancelOrder(orderId: string): CancelOrderIntent {
        const order = this.cancelableOrder(orderId, 'cancel');
        return this.publish({
            ...this.intentBase(TradingIntentKind.CancelOrder),
            orderId: order.id,
            ...(order.revision === undefined ? {} : { expectedRevision: order.revision }),
        }) as CancelOrderIntent;
    }

    requestClosePosition(positionId: string, quantity?: number): ClosePositionIntent {
        const position = this.positionWithPermission(positionId, 'canClose', 'close');
        if (quantity !== undefined && quantity > position.quantity) {
            throw new RangeError(
                'sschart: close-position quantity cannot exceed canonical position quantity',
            );
        }
        return this.publish({
            ...this.intentBase(TradingIntentKind.ClosePosition),
            positionId: position.id,
            ...(position.revision === undefined ? {} : { expectedRevision: position.revision }),
            ...(quantity === undefined ? {} : { quantity }),
        }) as ClosePositionIntent;
    }

    requestReversePosition(positionId: string, quantity?: number): ReversePositionIntent {
        const position = this.positionWithPermission(positionId, 'canReverse', 'reverse');
        return this.publish({
            ...this.intentBase(TradingIntentKind.ReversePosition),
            positionId: position.id,
            ...(position.revision === undefined ? {} : { expectedRevision: position.revision }),
            ...(quantity === undefined ? {} : { quantity }),
        }) as ReversePositionIntent;
    }

    requestCreateStopLoss(
        positionId: string,
        price: number,
        quantity?: number,
    ): CreateStopLossIntent {
        return this.requestCreateProtection(
            TradingIntentKind.CreateStopLoss,
            positionId,
            price,
            quantity,
        ) as CreateStopLossIntent;
    }

    requestEditStopLoss(
        orderId: string,
        price: number,
        quantity?: number,
    ): EditStopLossIntent {
        return this.requestEditProtection(
            TradingIntentKind.EditStopLoss,
            ChartBracketRole.StopLoss,
            orderId,
            price,
            quantity,
        ) as EditStopLossIntent;
    }

    requestRemoveStopLoss(orderId: string): RemoveStopLossIntent {
        return this.requestRemoveProtection(
            TradingIntentKind.RemoveStopLoss,
            ChartBracketRole.StopLoss,
            orderId,
        ) as RemoveStopLossIntent;
    }

    requestCreateTakeProfit(
        positionId: string,
        price: number,
        quantity?: number,
    ): CreateTakeProfitIntent {
        return this.requestCreateProtection(
            TradingIntentKind.CreateTakeProfit,
            positionId,
            price,
            quantity,
        ) as CreateTakeProfitIntent;
    }

    requestEditTakeProfit(
        orderId: string,
        price: number,
        quantity?: number,
    ): EditTakeProfitIntent {
        return this.requestEditProtection(
            TradingIntentKind.EditTakeProfit,
            ChartBracketRole.TakeProfit,
            orderId,
            price,
            quantity,
        ) as EditTakeProfitIntent;
    }

    requestRemoveTakeProfit(orderId: string): RemoveTakeProfitIntent {
        return this.requestRemoveProtection(
            TradingIntentKind.RemoveTakeProfit,
            ChartBracketRole.TakeProfit,
            orderId,
        ) as RemoveTakeProfitIntent;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.changeHandlers.clear();
        this.intentHandlers.clear();
        this.outcomeHandlers.clear();
        this.pendingIntentMap.clear();
        this.ordersValue = EMPTY_ORDERS;
        this.positionsValue = EMPTY_POSITIONS;
        this.executionsValue = EMPTY_EXECUTIONS;
        this.quoteValue = null;
        this.snapshotValue = Object.freeze({
            version: this.versionValue,
            orders: EMPTY_ORDERS,
            positions: EMPTY_POSITIONS,
            executions: EMPTY_EXECUTIONS,
            quote: null,
        });
    }

    private requestCreateProtection(
        kind: typeof TradingIntentKind.CreateStopLoss
            | typeof TradingIntentKind.CreateTakeProfit,
        positionId: string,
        price: number,
        quantity?: number,
    ): CreateStopLossIntent | CreateTakeProfitIntent {
        const position = this.positionWithPermission(positionId, 'canProtect', 'protect');
        if (quantity !== undefined && quantity > position.quantity) {
            throw new RangeError(
                `sschart: ${kind} quantity cannot exceed canonical position quantity`,
            );
        }
        return this.publish({
            ...this.intentBase(kind),
            positionId: position.id,
            price,
            ...(quantity === undefined ? {} : { quantity }),
        }) as CreateStopLossIntent | CreateTakeProfitIntent;
    }

    private requestEditProtection(
        kind: typeof TradingIntentKind.EditStopLoss | typeof TradingIntentKind.EditTakeProfit,
        role: typeof ChartBracketRole.StopLoss | typeof ChartBracketRole.TakeProfit,
        orderId: string,
        price: number,
        quantity?: number,
    ): EditStopLossIntent | EditTakeProfitIntent {
        const order = this.editableOrder(orderId, 'edit protection');
        this.assertProtectionRole(order, role);
        return this.publish({
            ...this.intentBase(kind),
            orderId: order.id,
            ...(order.revision === undefined ? {} : { expectedRevision: order.revision }),
            price,
            ...(quantity === undefined ? {} : { quantity }),
        }) as EditStopLossIntent | EditTakeProfitIntent;
    }

    private requestRemoveProtection(
        kind: typeof TradingIntentKind.RemoveStopLoss
            | typeof TradingIntentKind.RemoveTakeProfit,
        role: typeof ChartBracketRole.StopLoss | typeof ChartBracketRole.TakeProfit,
        orderId: string,
    ): RemoveStopLossIntent | RemoveTakeProfitIntent {
        const order = this.cancelableOrder(orderId, 'remove protection');
        this.assertProtectionRole(order, role);
        return this.publish({
            ...this.intentBase(kind),
            orderId: order.id,
            ...(order.revision === undefined ? {} : { expectedRevision: order.revision }),
        }) as RemoveStopLossIntent | RemoveTakeProfitIntent;
    }

    private assertProtectionRole(
        order: ChartOrder,
        role: typeof ChartBracketRole.StopLoss | typeof ChartBracketRole.TakeProfit,
    ): void {
        if (order.bracket?.role !== role) {
            throw new TypeError(
                `sschart: chart order '${order.id}' is not a ${role} protection order`,
            );
        }
    }

    private editableOrder(orderId: string, action: string): ChartOrder {
        const order = this.requireOrder(orderId);
        if (order.permissions?.canModify !== true)
            throw new Error(`sschart: chart order '${order.id}' cannot ${action}`);
        return order;
    }

    private cancelableOrder(orderId: string, action: string): ChartOrder {
        const order = this.requireOrder(orderId);
        if (order.permissions?.canCancel !== true)
            throw new Error(`sschart: chart order '${order.id}' cannot ${action}`);
        return order;
    }

    private requireOrder(orderId: string): ChartOrder {
        this.assertActive();
        const normalizedId = normalizedLookupId(orderId, 'chart order id');
        const order = this.ordersValue.find(item => item.id === normalizedId);
        if (order === undefined)
            throw new RangeError(`sschart: unknown chart order id '${normalizedId}'`);
        return order;
    }

    private positionWithPermission(
        positionId: string,
        permission: 'canClose' | 'canReverse' | 'canProtect',
        action: string,
    ): ChartPosition {
        this.assertActive();
        const normalizedId = normalizedLookupId(positionId, 'chart position id');
        const position = this.positionsValue.find(item => item.id === normalizedId);
        if (position === undefined)
            throw new RangeError(`sschart: unknown chart position id '${normalizedId}'`);
        if (position.permissions?.[permission] !== true)
            throw new Error(`sschart: chart position '${normalizedId}' cannot ${action}`);
        return position;
    }

    private intentBase<TKind extends TradingIntentKindValue>(
        kind: TKind,
    ): { readonly intentId: string; readonly kind: TKind; readonly createdAt: Time } {
        this.assertActive();
        const sequence = ++this.intentSequence;
        return Object.freeze({
            intentId: this.intentIdFactory(sequence),
            kind,
            createdAt: this.clock(),
        });
    }

    private publish(value: TradingIntent): TradingIntent {
        const intent = normalizeTradingIntent(value, this.modelOptions);
        if (this.pendingIntentMap.has(intent.intentId)) {
            throw new RangeError(`sschart: duplicate pending trading intent '${intent.intentId}'`);
        }
        this.pendingIntentMap.set(intent.intentId, intent);
        try {
            for (const handler of [...this.intentHandlers]) handler(intent);
        } catch (error) {
            this.pendingIntentMap.delete(intent.intentId);
            throw error;
        }
        return intent;
    }

    private advanceVersion(): number {
        this.versionValue += 1;
        this.snapshotValue = this.makeSnapshot();
        return this.versionValue;
    }

    private makeSnapshot(): TradingLayerSnapshot {
        return Object.freeze({
            version: this.versionValue,
            orders: this.ordersValue,
            positions: this.positionsValue,
            executions: this.executionsValue,
            quote: this.quoteValue,
        });
    }

    private emitChange(change: TradingLayerChange): void {
        for (const handler of [...this.changeHandlers]) handler(change);
    }

    private assertActive(): void {
        if (this.disposed) throw new Error('sschart: trading layer is disposed');
    }
}

interface CollectionDiff<TEntity> {
    readonly changed: boolean;
    readonly values: readonly TEntity[];
    readonly added: readonly TEntity[];
    readonly updated: readonly TradingEntityUpdate<TEntity>[];
    readonly removed: readonly TEntity[];
    readonly orderChanged: boolean;
}

function diffCollection<TEntity extends { readonly id: string }>(
    previous: readonly TEntity[],
    next: readonly TEntity[],
    equal: (left: TEntity, right: TEntity) => boolean,
): CollectionDiff<TEntity> {
    const previousById = new Map(previous.map(item => [item.id, item]));
    const seen = new Set<string>();
    const values: TEntity[] = [];
    const added: TEntity[] = [];
    const updated: TradingEntityUpdate<TEntity>[] = [];
    for (const candidate of next) {
        seen.add(candidate.id);
        const old = previousById.get(candidate.id);
        if (old === undefined) {
            values.push(candidate);
            added.push(candidate);
        } else if (equal(old, candidate)) {
            values.push(old);
        } else {
            values.push(candidate);
            updated.push(Object.freeze({ previous: old, current: candidate }));
        }
    }
    const removed = previous.filter(item => !seen.has(item.id));
    const orderChanged = previous.length === values.length
        && previous.some((item, index) => item.id !== values[index].id);
    const changed = added.length > 0 || updated.length > 0 || removed.length > 0 || orderChanged;
    return Object.freeze({
        changed,
        values: changed ? Object.freeze(values) : previous,
        added: Object.freeze(added),
        updated: Object.freeze(updated),
        removed: Object.freeze(removed),
        orderChanged,
    });
}

function equalOrder(left: ChartOrder, right: ChartOrder): boolean {
    return left.id === right.id
        && left.revision === right.revision
        && left.side === right.side
        && left.type === right.type
        && left.status === right.status
        && left.timeInForce === right.timeInForce
        && left.quantity === right.quantity
        && left.filledQuantity === right.filledQuantity
        && left.price === right.price
        && left.stopPrice === right.stopPrice
        && left.averageFillPrice === right.averageFillPrice
        && left.createdAt === right.createdAt
        && left.updatedAt === right.updatedAt
        && left.label === right.label
        && left.statusReason === right.statusReason
        && equalOptional(left.bracket, right.bracket, equalBracket)
        && equalOptional(left.permissions, right.permissions, (a, b) => (
            a.canModify === b.canModify && a.canCancel === b.canCancel
        ));
}

function equalPosition(left: ChartPosition, right: ChartPosition): boolean {
    return left.id === right.id
        && left.revision === right.revision
        && left.side === right.side
        && left.quantity === right.quantity
        && left.averagePrice === right.averagePrice
        && left.openedAt === right.openedAt
        && left.label === right.label
        && equalOptional(left.pnl, right.pnl, (a, b) => (
            a.realized === b.realized
            && a.unrealized === b.unrealized
            && a.currency === b.currency
            && a.markPrice === b.markPrice
            && a.time === b.time
        ))
        && equalOptional(left.permissions, right.permissions, (a, b) => (
            a.canClose === b.canClose
            && a.canReverse === b.canReverse
            && a.canProtect === b.canProtect
        ));
}

function equalExecution(left: ChartExecution, right: ChartExecution): boolean {
    return left.id === right.id
        && left.orderId === right.orderId
        && left.positionId === right.positionId
        && left.time === right.time
        && left.side === right.side
        && left.price === right.price
        && left.quantity === right.quantity
        && left.liquidity === right.liquidity
        && left.fee === right.fee
        && left.feeCurrency === right.feeCurrency;
}

function equalQuote(left: ChartQuote, right: ChartQuote): boolean {
    return left.time === right.time
        && left.bidPrice === right.bidPrice
        && left.bidSize === right.bidSize
        && left.askPrice === right.askPrice
        && left.askSize === right.askSize
        && left.lastPrice === right.lastPrice
        && left.lastSize === right.lastSize;
}

function equalBracket(
    left: NonNullable<ChartOrder['bracket']>,
    right: NonNullable<ChartOrder['bracket']>,
): boolean {
    return left.groupId === right.groupId
        && left.role === right.role
        && left.parentOrderId === right.parentOrderId
        && left.positionId === right.positionId;
}

function equalOptional<T>(
    left: T | null | undefined,
    right: T | null | undefined,
    equal: (left: T, right: T) => boolean,
): boolean {
    if (left === null || left === undefined) return right === null || right === undefined;
    return right !== null && right !== undefined && equal(left, right);
}

function normalizedLookupId(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: ${name} must be a non-empty string`);
    return value.trim();
}

function normalizedText(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: ${name} must be a non-empty string`);
    return value.trim();
}

function assertHandler(value: unknown, name: string): asserts value is (...args: any[]) => void {
    if (typeof value !== 'function') throw new TypeError(`sschart: ${name} must be a function`);
}

function plainObject(value: unknown): value is Readonly<Record<string, any>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
