import {
    CandlestickSeries,
    HorizontalLine,
    type IChartApi,
    type IChartPrimitive,
    type ICommand,
    type PrimitivePaneView,
    PrimitiveHitTestLocation,
    PrimitiveHitTestRole,
    PrimitivePaneViewClip,
    type PrimitiveAttachedContext,
    PrimitiveZOrder,
    TrendLine,
} from '../../src/index.js';

declare const chart: IChartApi;
const candles = chart.addSeries(CandlestickSeries);
const horizontal = new HorizontalLine({ id: 'typed-line', price: 100, autoscale: true });
chart.attachPrimitive(horizontal, { series: candles });
horizontal.applyOptions({ price: 101, draggable: false });
const horizontalPrice: number = horizontal.price();
const horizontalId: string = horizontal.id();
void horizontalPrice;
void horizontalId;
const trend = new TrendLine({
    id: 'typed-trend',
    start: { time: 1, price: 100 },
    end: { time: 2, price: 101 },
});
chart.attachPrimitive(trend, { series: candles });
trend.setPoints({ time: 2, price: 102 }, { time: 3, price: 103 });
const trendStartPrice: number = trend.startPoint().price;
void trendStartPrice;

let attachedContext: PrimitiveAttachedContext | null = null;
const primitive: IChartPrimitive = {
    attached(context) {
        attachedContext = context;
        const x: number | null = context.timeToCoordinate(1);
        const y: number | null = context.priceToCoordinate(100);
        const ratio: number = context.pixelRatio();
        const scaleId: string = context.priceScaleId;
        const commands = context.commandStack;
        const color: string = context.theme().backgroundColor;
        context.addDisposable(() => {});
        context.addDisposable({ dispose() {} });
        void x;
        void y;
        void ratio;
        void scaleId;
        void commands;
        void color;
    },
    detached() { attachedContext = null; },
    updateAllViews() {},
    autoscaleInfo(range) {
        return range.to < range.from ? null : {
            priceRange: { min: 90, max: 110 },
            margins: { above: 10, below: 5 },
        };
    },
    hitTest(point, context) {
        if (context.location !== PrimitiveHitTestLocation.Pane || point.x < 0) return null;
        return {
            id: 'typed-handle',
            role: PrimitiveHitTestRole.Handle,
            cursor: 'grab',
            zOrder: PrimitiveZOrder.Top,
            data: { scaleId: context.priceScaleId },
            interaction: { selectable: true, draggable: true },
        };
    },
    onPointerMove(event) {
        const dx: number = event.totalDelta.x;
        const id: string = event.hit.id;
        void dx;
        void id;
    },
    paneViews(): readonly PrimitivePaneView[] {
        return [{
            zOrder: () => PrimitiveZOrder.Normal,
            clip: () => PrimitivePaneViewClip.Plot,
            renderer: () => ({
                draw(target) {
                    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
                        context.clearRect(0, 0, mediaSize.width, mediaSize.height);
                    });
                },
            }),
        }];
    },
};

chart.attachPrimitive(primitive, { pane: chart.panes()[0], series: candles });
chart.detachPrimitive(primitive);
const stateName: string = chart.interactionState().state;
chart.subscribeInteractionStateChange((state) => void state.selected);
const command: ICommand = { execute() {}, undo() {} };
chart.commandStack().execute(command);
chart.commandStack().undo();
void stateName;
void attachedContext;
const layer: 'normal' = PrimitiveZOrder.Normal;
void layer;

// @ts-expect-error all lifecycle methods are required
chart.attachPrimitive({ attached() {} });
// @ts-expect-error only disposables can be registered
attachedContext?.addDisposable('cleanup');
// @ts-expect-error price is required and finite at runtime
new HorizontalLine({ color: '#fff' });
// @ts-expect-error both trend endpoints are required
new TrendLine({ start: { time: 1, price: 100 } });
