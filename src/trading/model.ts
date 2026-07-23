import type { Time } from '../core/chart-api.js';

export const TradingSide = Object.freeze({
    Buy: 'buy',
    Sell: 'sell',
} as const);
export type TradingSide = typeof TradingSide[keyof typeof TradingSide];

export const ChartOrderType = Object.freeze({
    Market: 'market',
    Limit: 'limit',
    Stop: 'stop',
    StopLimit: 'stop-limit',
} as const);
export type ChartOrderType = typeof ChartOrderType[keyof typeof ChartOrderType];

export const ChartOrderStatus = Object.freeze({
    Pending: 'pending',
    Working: 'working',
    PartiallyFilled: 'partially-filled',
    Filled: 'filled',
    Cancelled: 'cancelled',
    Rejected: 'rejected',
    Expired: 'expired',
} as const);
export type ChartOrderStatus = typeof ChartOrderStatus[keyof typeof ChartOrderStatus];

export const ChartOrderTimeInForce = Object.freeze({
    Day: 'day',
    GoodTillCancelled: 'good-till-cancelled',
    ImmediateOrCancel: 'immediate-or-cancel',
    FillOrKill: 'fill-or-kill',
} as const);
export type ChartOrderTimeInForce = typeof ChartOrderTimeInForce[
    keyof typeof ChartOrderTimeInForce
];

export const ChartPositionSide = Object.freeze({
    Long: 'long',
    Short: 'short',
} as const);
export type ChartPositionSide = typeof ChartPositionSide[keyof typeof ChartPositionSide];

export const ChartBracketRole = Object.freeze({
    Entry: 'entry',
    StopLoss: 'stop-loss',
    TakeProfit: 'take-profit',
} as const);
export type ChartBracketRole = typeof ChartBracketRole[keyof typeof ChartBracketRole];

export const ChartExecutionLiquidity = Object.freeze({
    Maker: 'maker',
    Taker: 'taker',
    Unknown: 'unknown',
} as const);
export type ChartExecutionLiquidity = typeof ChartExecutionLiquidity[
    keyof typeof ChartExecutionLiquidity
];

export const TradingIntentKind = Object.freeze({
    PlaceOrder: 'place-order',
    ModifyOrder: 'modify-order',
    CancelOrder: 'cancel-order',
    ClosePosition: 'close-position',
    ReversePosition: 'reverse-position',
    CreateStopLoss: 'create-stop-loss',
    EditStopLoss: 'edit-stop-loss',
    RemoveStopLoss: 'remove-stop-loss',
    CreateTakeProfit: 'create-take-profit',
    EditTakeProfit: 'edit-take-profit',
    RemoveTakeProfit: 'remove-take-profit',
} as const);
export type TradingIntentKind = typeof TradingIntentKind[keyof typeof TradingIntentKind];

export interface TradingModelNormalizationOptions {
    readonly tickSize: number;
    /** Tick-grid origin. Defaults to zero. */
    readonly priceOrigin?: number;
    /** Optional quantity grid. Quantities remain positive finite numbers when omitted. */
    readonly quantityStep?: number;
}

export interface ChartBracketRelationship {
    readonly groupId: string;
    readonly role: ChartBracketRole;
    /** Protection orders point either at their entry order or at an open position. */
    readonly parentOrderId?: string;
    readonly positionId?: string;
}

export interface ChartOrderPermissions {
    readonly canModify: boolean;
    readonly canCancel: boolean;
}

/** Canonical broker-owned order snapshot. The chart never mutates this object optimistically. */
export interface ChartOrder {
    readonly id: string;
    readonly revision?: number;
    readonly side: TradingSide;
    readonly type: ChartOrderType;
    readonly status: ChartOrderStatus;
    readonly timeInForce: ChartOrderTimeInForce;
    readonly quantity: number;
    readonly filledQuantity: number;
    readonly price?: number;
    readonly stopPrice?: number;
    readonly averageFillPrice?: number;
    readonly createdAt?: Time;
    readonly updatedAt?: Time;
    readonly bracket?: ChartBracketRelationship;
    /** Missing permissions make the entity read-only. */
    readonly permissions?: ChartOrderPermissions;
    readonly label?: string;
    readonly statusReason?: string;
}

export interface ChartPnlSnapshot {
    readonly realized: number;
    readonly unrealized: number;
    readonly currency?: string;
    readonly markPrice?: number;
    readonly time?: Time;
}

export interface ChartPositionPermissions {
    readonly canClose: boolean;
    readonly canReverse: boolean;
    readonly canProtect: boolean;
}

/** Canonical broker-owned position. Quantity is positive; direction lives only in side. */
export interface ChartPosition {
    readonly id: string;
    readonly revision?: number;
    readonly side: ChartPositionSide;
    readonly quantity: number;
    readonly averagePrice: number;
    readonly openedAt?: Time;
    readonly pnl?: ChartPnlSnapshot;
    readonly permissions?: ChartPositionPermissions;
    readonly label?: string;
}

export interface ChartExecution {
    readonly id: string;
    readonly orderId?: string;
    readonly positionId?: string;
    readonly time: Time;
    readonly side: TradingSide;
    readonly price: number;
    readonly quantity: number;
    readonly liquidity?: ChartExecutionLiquidity;
    /** Signed fee: a negative value represents a rebate. */
    readonly fee?: number;
    readonly feeCurrency?: string;
}

/** One-sided quotes are valid; at least one of bid, ask or last must be present. */
export interface ChartQuote {
    readonly time: Time;
    readonly bidPrice?: number;
    readonly bidSize?: number;
    readonly askPrice?: number;
    readonly askSize?: number;
    readonly lastPrice?: number;
    readonly lastSize?: number;
}

export interface ChartOrderRequest {
    readonly clientOrderId?: string;
    readonly side: TradingSide;
    readonly type: ChartOrderType;
    readonly timeInForce: ChartOrderTimeInForce;
    readonly quantity: number;
    readonly price?: number;
    readonly stopPrice?: number;
    readonly bracketGroupId?: string;
}

export interface ChartOrderModification {
    readonly quantity?: number;
    readonly price?: number;
    readonly stopPrice?: number;
    readonly timeInForce?: ChartOrderTimeInForce;
}

export interface TradingIntentBase<TKind extends TradingIntentKind = TradingIntentKind> {
    readonly intentId: string;
    readonly kind: TKind;
    /** Unix seconds at which the chart emitted the intent. */
    readonly createdAt: Time;
}

export interface PlaceOrderIntent extends TradingIntentBase<typeof TradingIntentKind.PlaceOrder> {
    readonly order: ChartOrderRequest;
}

export interface ModifyOrderIntent extends TradingIntentBase<typeof TradingIntentKind.ModifyOrder> {
    readonly orderId: string;
    readonly expectedRevision?: number;
    readonly changes: ChartOrderModification;
}

export interface CancelOrderIntent extends TradingIntentBase<typeof TradingIntentKind.CancelOrder> {
    readonly orderId: string;
    readonly expectedRevision?: number;
}

export interface ClosePositionIntent extends TradingIntentBase<typeof TradingIntentKind.ClosePosition> {
    readonly positionId: string;
    readonly expectedRevision?: number;
    /** Omitted quantity means close the complete canonical position. */
    readonly quantity?: number;
}

export interface ReversePositionIntent extends TradingIntentBase<typeof TradingIntentKind.ReversePosition> {
    readonly positionId: string;
    readonly expectedRevision?: number;
    /** Omitted quantity means open the same quantity on the opposite side. */
    readonly quantity?: number;
}

export interface CreateStopLossIntent extends TradingIntentBase<
    typeof TradingIntentKind.CreateStopLoss
> {
    readonly positionId: string;
    readonly price: number;
    readonly quantity?: number;
    readonly clientOrderId?: string;
    readonly bracketGroupId?: string;
}

export interface EditStopLossIntent extends TradingIntentBase<typeof TradingIntentKind.EditStopLoss> {
    readonly orderId: string;
    readonly expectedRevision?: number;
    readonly price: number;
    readonly quantity?: number;
}

export interface RemoveStopLossIntent extends TradingIntentBase<
    typeof TradingIntentKind.RemoveStopLoss
> {
    readonly orderId: string;
    readonly expectedRevision?: number;
}

export interface CreateTakeProfitIntent extends TradingIntentBase<
    typeof TradingIntentKind.CreateTakeProfit
> {
    readonly positionId: string;
    readonly price: number;
    readonly quantity?: number;
    readonly clientOrderId?: string;
    readonly bracketGroupId?: string;
}

export interface EditTakeProfitIntent extends TradingIntentBase<
    typeof TradingIntentKind.EditTakeProfit
> {
    readonly orderId: string;
    readonly expectedRevision?: number;
    readonly price: number;
    readonly quantity?: number;
}

export interface RemoveTakeProfitIntent extends TradingIntentBase<
    typeof TradingIntentKind.RemoveTakeProfit
> {
    readonly orderId: string;
    readonly expectedRevision?: number;
}

export type TradingIntent =
    | PlaceOrderIntent
    | ModifyOrderIntent
    | CancelOrderIntent
    | ClosePositionIntent
    | ReversePositionIntent
    | CreateStopLossIntent
    | EditStopLossIntent
    | RemoveStopLossIntent
    | CreateTakeProfitIntent
    | EditTakeProfitIntent
    | RemoveTakeProfitIntent;

export function normalizeChartOrder(
    value: ChartOrder,
    options: TradingModelNormalizationOptions,
): ChartOrder {
    const grid = normalizeGrid(options);
    object(value, 'chart order');
    const id = identifier(value.id, 'chart order id');
    const type = enumValue(value.type, ChartOrderType, 'chart order type');
    const status = enumValue(value.status, ChartOrderStatus, 'chart order status');
    const quantity = positiveQuantity(value.quantity, grid, 'chart order quantity');
    const filledQuantity = nonNegativeQuantity(
        value.filledQuantity,
        grid,
        'chart order filledQuantity',
    );
    if (filledQuantity > quantity + quantityTolerance(quantity, grid.quantityStep)) {
        throw new RangeError('sschart: chart order filledQuantity cannot exceed quantity');
    }
    if (status === ChartOrderStatus.Filled && !sameQuantity(filledQuantity, quantity, grid)) {
        throw new RangeError('sschart: filled chart order must have its complete quantity filled');
    }
    if (status === ChartOrderStatus.PartiallyFilled
        && (!(filledQuantity > 0) || sameQuantity(filledQuantity, quantity, grid))) {
        throw new RangeError(
            'sschart: partially-filled chart order requires a partial filledQuantity',
        );
    }
    const prices = normalizeOrderPrices(value, type, grid, 'chart order');
    const averageFillPrice = value.averageFillPrice === undefined
        ? undefined : price(value.averageFillPrice, grid, 'chart order averageFillPrice');
    if (averageFillPrice !== undefined && !(filledQuantity > 0)) {
        throw new RangeError(
            'sschart: chart order averageFillPrice requires a positive filledQuantity',
        );
    }
    const createdAt = optionalTime(value.createdAt, 'chart order createdAt');
    const updatedAt = optionalTime(value.updatedAt, 'chart order updatedAt');
    if (createdAt !== undefined && updatedAt !== undefined && updatedAt < createdAt)
        throw new RangeError('sschart: chart order updatedAt cannot precede createdAt');
    const revision = optionalRevision(value.revision, 'chart order revision');
    const bracket = value.bracket === undefined
        ? undefined : normalizeChartBracketRelationship(value.bracket);
    const permissions = value.permissions === undefined
        ? undefined : normalizeOrderPermissions(value.permissions);
    const label = optionalText(value.label, 'chart order label');
    const statusReason = optionalText(value.statusReason, 'chart order statusReason');
    return Object.freeze({
        id,
        ...(revision === undefined ? {} : { revision }),
        side: enumValue(value.side, TradingSide, 'chart order side'),
        type,
        status,
        timeInForce: enumValue(
            value.timeInForce,
            ChartOrderTimeInForce,
            'chart order timeInForce',
        ),
        quantity,
        filledQuantity,
        ...prices,
        ...(averageFillPrice === undefined ? {} : { averageFillPrice }),
        ...(createdAt === undefined ? {} : { createdAt }),
        ...(updatedAt === undefined ? {} : { updatedAt }),
        ...(bracket === undefined ? {} : { bracket }),
        ...(permissions === undefined ? {} : { permissions }),
        ...(label === undefined ? {} : { label }),
        ...(statusReason === undefined ? {} : { statusReason }),
    });
}

export function normalizeChartOrders(
    values: readonly ChartOrder[],
    options: TradingModelNormalizationOptions,
): readonly ChartOrder[] {
    normalizeGrid(options);
    return normalizeUnique(values, value => normalizeChartOrder(value, options), 'chart order');
}

export function normalizeChartPosition(
    value: ChartPosition,
    options: TradingModelNormalizationOptions,
): ChartPosition {
    const grid = normalizeGrid(options);
    object(value, 'chart position');
    const revision = optionalRevision(value.revision, 'chart position revision');
    const openedAt = optionalTime(value.openedAt, 'chart position openedAt');
    const pnl = value.pnl === undefined ? undefined : normalizeChartPnl(value.pnl, grid);
    const permissions = value.permissions === undefined
        ? undefined : normalizePositionPermissions(value.permissions);
    const label = optionalText(value.label, 'chart position label');
    return Object.freeze({
        id: identifier(value.id, 'chart position id'),
        ...(revision === undefined ? {} : { revision }),
        side: enumValue(value.side, ChartPositionSide, 'chart position side'),
        quantity: positiveQuantity(value.quantity, grid, 'chart position quantity'),
        averagePrice: price(value.averagePrice, grid, 'chart position averagePrice'),
        ...(openedAt === undefined ? {} : { openedAt }),
        ...(pnl === undefined ? {} : { pnl }),
        ...(permissions === undefined ? {} : { permissions }),
        ...(label === undefined ? {} : { label }),
    });
}

export function normalizeChartPositions(
    values: readonly ChartPosition[],
    options: TradingModelNormalizationOptions,
): readonly ChartPosition[] {
    normalizeGrid(options);
    return normalizeUnique(
        values,
        value => normalizeChartPosition(value, options),
        'chart position',
    );
}

export function normalizeChartExecution(
    value: ChartExecution,
    options: TradingModelNormalizationOptions,
): ChartExecution {
    const grid = normalizeGrid(options);
    object(value, 'chart execution');
    const orderId = optionalIdentifier(value.orderId, 'chart execution orderId');
    const positionId = optionalIdentifier(value.positionId, 'chart execution positionId');
    const liquidity = value.liquidity === undefined ? undefined : enumValue(
        value.liquidity,
        ChartExecutionLiquidity,
        'chart execution liquidity',
    );
    const fee = value.fee === undefined ? undefined : finite(value.fee, 'chart execution fee');
    const feeCurrency = optionalText(value.feeCurrency, 'chart execution feeCurrency');
    if (feeCurrency !== undefined && fee === undefined)
        throw new TypeError('sschart: chart execution feeCurrency requires fee');
    return Object.freeze({
        id: identifier(value.id, 'chart execution id'),
        ...(orderId === undefined ? {} : { orderId }),
        ...(positionId === undefined ? {} : { positionId }),
        time: time(value.time, 'chart execution time'),
        side: enumValue(value.side, TradingSide, 'chart execution side'),
        price: price(value.price, grid, 'chart execution price'),
        quantity: positiveQuantity(value.quantity, grid, 'chart execution quantity'),
        ...(liquidity === undefined ? {} : { liquidity }),
        ...(fee === undefined ? {} : { fee }),
        ...(feeCurrency === undefined ? {} : { feeCurrency }),
    });
}

export function normalizeChartExecutions(
    values: readonly ChartExecution[],
    options: TradingModelNormalizationOptions,
): readonly ChartExecution[] {
    normalizeGrid(options);
    return normalizeUnique(
        values,
        value => normalizeChartExecution(value, options),
        'chart execution',
    );
}

export function normalizeChartQuote(
    value: ChartQuote,
    options: TradingModelNormalizationOptions,
): ChartQuote {
    const grid = normalizeGrid(options);
    object(value, 'chart quote');
    const bidPrice = optionalPrice(value.bidPrice, grid, 'chart quote bidPrice');
    const askPrice = optionalPrice(value.askPrice, grid, 'chart quote askPrice');
    const lastPrice = optionalPrice(value.lastPrice, grid, 'chart quote lastPrice');
    if (bidPrice === undefined && askPrice === undefined && lastPrice === undefined)
        throw new TypeError('sschart: chart quote requires bidPrice, askPrice or lastPrice');
    if (bidPrice !== undefined && askPrice !== undefined && bidPrice > askPrice)
        throw new RangeError('sschart: chart quote bidPrice cannot exceed askPrice');
    const bidSize = optionalNonNegativeQuantity(value.bidSize, grid, 'chart quote bidSize');
    const askSize = optionalNonNegativeQuantity(value.askSize, grid, 'chart quote askSize');
    const lastSize = optionalNonNegativeQuantity(value.lastSize, grid, 'chart quote lastSize');
    if (bidSize !== undefined && bidPrice === undefined)
        throw new TypeError('sschart: chart quote bidSize requires bidPrice');
    if (askSize !== undefined && askPrice === undefined)
        throw new TypeError('sschart: chart quote askSize requires askPrice');
    if (lastSize !== undefined && lastPrice === undefined)
        throw new TypeError('sschart: chart quote lastSize requires lastPrice');
    return Object.freeze({
        time: time(value.time, 'chart quote time'),
        ...(bidPrice === undefined ? {} : { bidPrice }),
        ...(bidSize === undefined ? {} : { bidSize }),
        ...(askPrice === undefined ? {} : { askPrice }),
        ...(askSize === undefined ? {} : { askSize }),
        ...(lastPrice === undefined ? {} : { lastPrice }),
        ...(lastSize === undefined ? {} : { lastSize }),
    });
}

export function normalizeChartOrderRequest(
    value: ChartOrderRequest,
    options: TradingModelNormalizationOptions,
): ChartOrderRequest {
    const grid = normalizeGrid(options);
    object(value, 'chart order request');
    const type = enumValue(value.type, ChartOrderType, 'chart order request type');
    const clientOrderId = optionalIdentifier(
        value.clientOrderId,
        'chart order request clientOrderId',
    );
    const bracketGroupId = optionalIdentifier(
        value.bracketGroupId,
        'chart order request bracketGroupId',
    );
    return Object.freeze({
        ...(clientOrderId === undefined ? {} : { clientOrderId }),
        side: enumValue(value.side, TradingSide, 'chart order request side'),
        type,
        timeInForce: enumValue(
            value.timeInForce,
            ChartOrderTimeInForce,
            'chart order request timeInForce',
        ),
        quantity: positiveQuantity(value.quantity, grid, 'chart order request quantity'),
        ...normalizeOrderPrices(value, type, grid, 'chart order request'),
        ...(bracketGroupId === undefined ? {} : { bracketGroupId }),
    });
}

export function normalizeTradingIntent(
    value: TradingIntent,
    options: TradingModelNormalizationOptions,
): TradingIntent {
    const grid = normalizeGrid(options);
    object(value, 'trading intent');
    const base = Object.freeze({
        intentId: identifier(value.intentId, 'trading intent id'),
        kind: enumValue(value.kind, TradingIntentKind, 'trading intent kind'),
        createdAt: time(value.createdAt, 'trading intent createdAt'),
    });
    switch (base.kind) {
        case TradingIntentKind.PlaceOrder:
            return Object.freeze({
                ...base,
                kind: TradingIntentKind.PlaceOrder,
                order: normalizeChartOrderRequest(
                    (value as PlaceOrderIntent).order,
                    options,
                ),
            });
        case TradingIntentKind.ModifyOrder: {
            const intent = value as ModifyOrderIntent;
            return Object.freeze({
                ...base,
                kind: TradingIntentKind.ModifyOrder,
                orderId: identifier(intent.orderId, 'modify-order intent orderId'),
                ...revisionProperty(intent.expectedRevision, 'modify-order expectedRevision'),
                changes: normalizeOrderModification(intent.changes, grid),
            });
        }
        case TradingIntentKind.CancelOrder:
        case TradingIntentKind.RemoveStopLoss:
        case TradingIntentKind.RemoveTakeProfit: {
            const intent = value as CancelOrderIntent | RemoveStopLossIntent
                | RemoveTakeProfitIntent;
            return Object.freeze({
                ...base,
                kind: base.kind,
                orderId: identifier(intent.orderId, `${base.kind} intent orderId`),
                ...revisionProperty(intent.expectedRevision, `${base.kind} expectedRevision`),
            }) as CancelOrderIntent | RemoveStopLossIntent | RemoveTakeProfitIntent;
        }
        case TradingIntentKind.ClosePosition:
        case TradingIntentKind.ReversePosition: {
            const intent = value as ClosePositionIntent | ReversePositionIntent;
            const quantity = intent.quantity === undefined ? undefined : positiveQuantity(
                intent.quantity,
                grid,
                `${base.kind} intent quantity`,
            );
            return Object.freeze({
                ...base,
                kind: base.kind,
                positionId: identifier(intent.positionId, `${base.kind} intent positionId`),
                ...revisionProperty(intent.expectedRevision, `${base.kind} expectedRevision`),
                ...(quantity === undefined ? {} : { quantity }),
            }) as ClosePositionIntent | ReversePositionIntent;
        }
        case TradingIntentKind.CreateStopLoss:
        case TradingIntentKind.CreateTakeProfit: {
            const intent = value as CreateStopLossIntent | CreateTakeProfitIntent;
            const quantity = intent.quantity === undefined ? undefined : positiveQuantity(
                intent.quantity,
                grid,
                `${base.kind} intent quantity`,
            );
            const clientOrderId = optionalIdentifier(
                intent.clientOrderId,
                `${base.kind} intent clientOrderId`,
            );
            const bracketGroupId = optionalIdentifier(
                intent.bracketGroupId,
                `${base.kind} intent bracketGroupId`,
            );
            return Object.freeze({
                ...base,
                kind: base.kind,
                positionId: identifier(intent.positionId, `${base.kind} intent positionId`),
                price: price(intent.price, grid, `${base.kind} intent price`),
                ...(quantity === undefined ? {} : { quantity }),
                ...(clientOrderId === undefined ? {} : { clientOrderId }),
                ...(bracketGroupId === undefined ? {} : { bracketGroupId }),
            }) as CreateStopLossIntent | CreateTakeProfitIntent;
        }
        case TradingIntentKind.EditStopLoss:
        case TradingIntentKind.EditTakeProfit: {
            const intent = value as EditStopLossIntent | EditTakeProfitIntent;
            const quantity = intent.quantity === undefined ? undefined : positiveQuantity(
                intent.quantity,
                grid,
                `${base.kind} intent quantity`,
            );
            return Object.freeze({
                ...base,
                kind: base.kind,
                orderId: identifier(intent.orderId, `${base.kind} intent orderId`),
                ...revisionProperty(intent.expectedRevision, `${base.kind} expectedRevision`),
                price: price(intent.price, grid, `${base.kind} intent price`),
                ...(quantity === undefined ? {} : { quantity }),
            }) as EditStopLossIntent | EditTakeProfitIntent;
        }
    }
}

export function chartOrderRemainingQuantity(order: ChartOrder): number {
    object(order, 'chart order');
    const result = order.quantity - order.filledQuantity;
    return result > 0 ? result : 0;
}

export function chartPnlTotal(pnl: ChartPnlSnapshot): number {
    object(pnl, 'chart P&L');
    return finite(pnl.realized, 'chart P&L realized')
        + finite(pnl.unrealized, 'chart P&L unrealized');
}

export function normalizeTradingModelOptions(
    options: TradingModelNormalizationOptions,
): TradingModelNormalizationOptions {
    const grid = normalizeGrid(options);
    return Object.freeze({
        tickSize: grid.tickSize,
        ...(grid.priceOrigin === 0 ? {} : { priceOrigin: grid.priceOrigin }),
        ...(grid.quantityStep === undefined ? {} : { quantityStep: grid.quantityStep }),
    });
}

/** Quantizes an interactive preview onto the same grid used by canonical validation. */
export function quantizeTradingPrice(
    value: number,
    options: TradingModelNormalizationOptions,
): number {
    const grid = normalizeGrid(options);
    const source = finite(value, 'trading price preview');
    const ticks = Math.round((source - grid.priceOrigin) / grid.tickSize);
    const normalized = grid.priceOrigin + ticks * grid.tickSize;
    return Object.is(normalized, -0) ? 0 : normalized;
}

interface Grid {
    readonly tickSize: number;
    readonly priceOrigin: number;
    readonly quantityStep?: number;
}

function normalizeGrid(options: TradingModelNormalizationOptions): Grid {
    object(options, 'trading model normalization options');
    const tickSize = positive(options.tickSize, 'trading model tickSize');
    const priceOrigin = options.priceOrigin === undefined
        ? 0 : finite(options.priceOrigin, 'trading model priceOrigin');
    const quantityStep = options.quantityStep === undefined
        ? undefined : positive(options.quantityStep, 'trading model quantityStep');
    return Object.freeze({ tickSize, priceOrigin, ...(quantityStep === undefined ? {} : {
        quantityStep,
    }) });
}

function normalizeChartBracketRelationship(value: ChartBracketRelationship): ChartBracketRelationship {
    object(value, 'chart bracket relationship');
    const role = enumValue(value.role, ChartBracketRole, 'chart bracket role');
    const parentOrderId = optionalIdentifier(
        value.parentOrderId,
        'chart bracket parentOrderId',
    );
    const positionId = optionalIdentifier(value.positionId, 'chart bracket positionId');
    if (role === ChartBracketRole.Entry) {
        if (parentOrderId !== undefined || positionId !== undefined) {
            throw new TypeError(
                'sschart: bracket entry cannot reference a parent order or position',
            );
        }
    } else if ((parentOrderId === undefined) === (positionId === undefined)) {
        throw new TypeError(
            'sschart: bracket protection requires exactly one parentOrderId or positionId',
        );
    }
    return Object.freeze({
        groupId: identifier(value.groupId, 'chart bracket groupId'),
        role,
        ...(parentOrderId === undefined ? {} : { parentOrderId }),
        ...(positionId === undefined ? {} : { positionId }),
    });
}

function normalizeOrderPermissions(value: ChartOrderPermissions): ChartOrderPermissions {
    object(value, 'chart order permissions');
    return Object.freeze({
        canModify: boolean(value.canModify, 'chart order permissions canModify'),
        canCancel: boolean(value.canCancel, 'chart order permissions canCancel'),
    });
}

function normalizePositionPermissions(value: ChartPositionPermissions): ChartPositionPermissions {
    object(value, 'chart position permissions');
    return Object.freeze({
        canClose: boolean(value.canClose, 'chart position permissions canClose'),
        canReverse: boolean(value.canReverse, 'chart position permissions canReverse'),
        canProtect: boolean(value.canProtect, 'chart position permissions canProtect'),
    });
}

function normalizeChartPnl(value: ChartPnlSnapshot, grid: Grid): ChartPnlSnapshot {
    object(value, 'chart P&L snapshot');
    const currency = optionalText(value.currency, 'chart P&L currency');
    const markPrice = optionalPrice(value.markPrice, grid, 'chart P&L markPrice');
    const snapshotTime = optionalTime(value.time, 'chart P&L time');
    return Object.freeze({
        realized: finite(value.realized, 'chart P&L realized'),
        unrealized: finite(value.unrealized, 'chart P&L unrealized'),
        ...(currency === undefined ? {} : { currency }),
        ...(markPrice === undefined ? {} : { markPrice }),
        ...(snapshotTime === undefined ? {} : { time: snapshotTime }),
    });
}

function normalizeOrderPrices(
    value: { readonly price?: number; readonly stopPrice?: number },
    type: ChartOrderType,
    grid: Grid,
    name: string,
): Readonly<{ price?: number; stopPrice?: number }> {
    const limitPrice = optionalPrice(value.price, grid, `${name} price`);
    const stopPrice = optionalPrice(value.stopPrice, grid, `${name} stopPrice`);
    const needsLimit = type === ChartOrderType.Limit || type === ChartOrderType.StopLimit;
    const needsStop = type === ChartOrderType.Stop || type === ChartOrderType.StopLimit;
    if (needsLimit !== (limitPrice !== undefined)) {
        throw new TypeError(
            `sschart: ${name} type '${type}' ${needsLimit ? 'requires' : 'does not accept'} price`,
        );
    }
    if (needsStop !== (stopPrice !== undefined)) {
        throw new TypeError(
            `sschart: ${name} type '${type}' ${needsStop ? 'requires' : 'does not accept'} stopPrice`,
        );
    }
    return Object.freeze({
        ...(limitPrice === undefined ? {} : { price: limitPrice }),
        ...(stopPrice === undefined ? {} : { stopPrice }),
    });
}

function normalizeOrderModification(
    value: ChartOrderModification,
    grid: Grid,
): ChartOrderModification {
    object(value, 'chart order modification');
    const quantity = value.quantity === undefined ? undefined : positiveQuantity(
        value.quantity,
        grid,
        'chart order modification quantity',
    );
    const limitPrice = optionalPrice(value.price, grid, 'chart order modification price');
    const stopPrice = optionalPrice(
        value.stopPrice,
        grid,
        'chart order modification stopPrice',
    );
    const timeInForce = value.timeInForce === undefined ? undefined : enumValue(
        value.timeInForce,
        ChartOrderTimeInForce,
        'chart order modification timeInForce',
    );
    if (quantity === undefined && limitPrice === undefined && stopPrice === undefined
        && timeInForce === undefined) {
        throw new TypeError('sschart: chart order modification must contain a change');
    }
    return Object.freeze({
        ...(quantity === undefined ? {} : { quantity }),
        ...(limitPrice === undefined ? {} : { price: limitPrice }),
        ...(stopPrice === undefined ? {} : { stopPrice }),
        ...(timeInForce === undefined ? {} : { timeInForce }),
    });
}

function normalizeUnique<T extends { readonly id: string }>(
    values: readonly T[],
    normalize: (value: T) => T,
    name: string,
): readonly T[] {
    if (!Array.isArray(values)) throw new TypeError(`sschart: ${name}s must be an array`);
    const ids = new Set<string>();
    const result: T[] = [];
    for (const source of values) {
        const item = normalize(source);
        if (ids.has(item.id)) throw new RangeError(`sschart: duplicate ${name} id '${item.id}'`);
        ids.add(item.id);
        result.push(item);
    }
    return Object.freeze(result);
}

function revisionProperty(
    value: number | undefined,
    name: string,
): Readonly<{ expectedRevision?: number }> {
    const expectedRevision = optionalRevision(value, name);
    return Object.freeze(expectedRevision === undefined ? {} : { expectedRevision });
}

function optionalRevision(value: unknown, name: string): number | undefined {
    if (value === undefined) return undefined;
    if (!Number.isSafeInteger(value) || (value as number) < 0)
        throw new RangeError(`sschart: ${name} must be a non-negative integer`);
    return value as number;
}

function price(value: unknown, grid: Grid, name: string): number {
    const source = finite(value, name);
    const ticks = (source - grid.priceOrigin) / grid.tickSize;
    const nearest = Math.round(ticks);
    const normalized = grid.priceOrigin + nearest * grid.tickSize;
    const tolerance = Math.max(
        1e-12,
        Math.abs(source) * Number.EPSILON * 16,
        grid.tickSize * 1e-9,
    );
    if (Math.abs(source - normalized) > tolerance)
        throw new RangeError(`sschart: ${name} must align to tickSize ${grid.tickSize}`);
    return Object.is(normalized, -0) ? 0 : normalized;
}

function optionalPrice(value: unknown, grid: Grid, name: string): number | undefined {
    return value === undefined ? undefined : price(value, grid, name);
}

function positiveQuantity(value: unknown, grid: Grid, name: string): number {
    const result = quantity(value, grid, name);
    if (!(result > 0)) throw new RangeError(`sschart: ${name} must be positive`);
    return result;
}

function nonNegativeQuantity(value: unknown, grid: Grid, name: string): number {
    const result = quantity(value, grid, name);
    if (result < 0) throw new RangeError(`sschart: ${name} must be non-negative`);
    return result;
}

function optionalNonNegativeQuantity(
    value: unknown,
    grid: Grid,
    name: string,
): number | undefined {
    return value === undefined ? undefined : nonNegativeQuantity(value, grid, name);
}

function quantity(value: unknown, grid: Grid, name: string): number {
    const source = finite(value, name);
    if (grid.quantityStep === undefined) return Object.is(source, -0) ? 0 : source;
    const units = source / grid.quantityStep;
    const nearest = Math.round(units);
    const normalized = nearest * grid.quantityStep;
    if (Math.abs(source - normalized) > quantityTolerance(source, grid.quantityStep)) {
        throw new RangeError(
            `sschart: ${name} must align to quantityStep ${grid.quantityStep}`,
        );
    }
    return Object.is(normalized, -0) ? 0 : normalized;
}

function sameQuantity(left: number, right: number, grid: Grid): boolean {
    return Math.abs(left - right) <= quantityTolerance(
        Math.max(Math.abs(left), Math.abs(right)),
        grid.quantityStep,
    );
}

function quantityTolerance(value: number, step?: number): number {
    return Math.max(1e-12, Math.abs(value) * Number.EPSILON * 16, (step ?? 0) * 1e-9);
}

function time(value: unknown, name: string): Time {
    return finite(value, name);
}

function optionalTime(value: unknown, name: string): Time | undefined {
    return value === undefined ? undefined : time(value, name);
}

function finite(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new TypeError(`sschart: ${name} must be finite`);
    return value;
}

function positive(value: unknown, name: string): number {
    const result = finite(value, name);
    if (!(result > 0)) throw new RangeError(`sschart: ${name} must be positive`);
    return result;
}

function optionalIdentifier(value: unknown, name: string): string | undefined {
    return value === undefined ? undefined : identifier(value, name);
}

function identifier(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: ${name} must be a non-empty string`);
    return value.trim();
}

function optionalText(value: unknown, name: string): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.trim().length === 0)
        throw new TypeError(`sschart: ${name} must be a non-empty string`);
    return value.trim();
}

function boolean(value: unknown, name: string): boolean {
    if (typeof value !== 'boolean') throw new TypeError(`sschart: ${name} must be boolean`);
    return value;
}

function enumValue<T extends string>(
    value: unknown,
    values: Readonly<Record<string, T>>,
    name: string,
): T {
    if (!Object.values(values).includes(value as T))
        throw new TypeError(`sschart: ${name} is invalid`);
    return value as T;
}

function object(value: unknown, name: string): asserts value is Readonly<Record<string, any>> {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new TypeError(`sschart: ${name} must be an object`);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
        throw new TypeError(`sschart: ${name} must be a plain object`);
}
