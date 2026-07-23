import {
    type CreateDrawingOptions,
    BuiltInDrawingType,
    DrawingController,
    DrawingMagnet,
    DrawingMagnetMode,
    type DrawingPrimitiveVisual,
    type DrawingDefinition,
    type DrawingInstance,
    type DrawingOptions,
    registerDrawing,
    createInteractiveDrawingBinding,
} from '../../src/index.js';

interface TrendOptions extends DrawingOptions {
    readonly color: string;
    readonly width: number;
}

const definition: DrawingDefinition<TrendOptions> = {
    type: 'typed-trend',
    name: 'Typed Trend',
    points: { min: 2, max: 2 },
    defaultOptions: { color: '#fff', width: 2 },
    create(instance, events) {
        const model: DrawingInstance<TrendOptions> = instance;
        events.preview(model);
        return {
            primitive: { attached() {}, detached() {}, updateAllViews() {} },
            update(next) { void next; },
        };
    },
};

registerDrawing(definition);

declare const chart: import('../../src/index.js').IChartApi;
const controller = new DrawingController({ chart });
const createOptions: CreateDrawingOptions = {
    id: 'typed',
    options: { color: '#fff', width: 2 },
};
controller.create('typed-trend', [
    { time: 1, price: 10 },
    { time: 2, price: 11 },
], createOptions);
controller.updateOptions('typed', { color: '#f00' });
controller.beginCreation('typed-trend', createOptions);
const creation = controller.creation();
if (creation !== null) {
    const requiredPoints: number = creation.minimumPoints;
    void requiredPoints;
}
controller.cancelCreation();
controller.beginCreation(BuiltInDrawingType.Ray, {
    options: { color: '#2962ff', lineWidth: 2, lineStyle: 0 },
});
controller.cancelCreation();
controller.beginCreation(BuiltInDrawingType.Rectangle, {
    options: {
        color: '#2962ff',
        lineWidth: 2,
        lineStyle: 0,
        fillColor: 'rgba(41,98,255,0.12)',
    },
});
controller.cancelCreation();
controller.beginCreation(BuiltInDrawingType.Note, { options: { text: 'Review' } });
controller.cancelCreation();
controller.beginCreation(BuiltInDrawingType.FibonacciRetracement, {
    options: { levels: [0, 0.5, 1], extendRight: true },
});
controller.cancelCreation();
controller.beginCreation(BuiltInDrawingType.Measure);
controller.cancelCreation();
controller.beginCreation(BuiltInDrawingType.LongPosition, { options: { quantity: 10 } });
controller.cancelCreation();
controller.beginCreation(BuiltInDrawingType.ShortPosition, { options: { quantity: 3 } });
controller.cancelCreation();
controller.applyMagnetOptions({ mode: DrawingMagnetMode.Strong, maxDistance: 12 });
const magnet = new DrawingMagnet({ mode: DrawingMagnetMode.Weak });
const magnetDistance: number = magnet.options().maxDistance;
void magnetDistance;

const visual: DrawingPrimitiveVisual = {
    draw(context) { void context.points; },
    hitTest(_point, _context) { return { cursor: 'move' }; },
};
declare const drawing: DrawingInstance;
declare const events: import('../../src/index.js').DrawingPrimitiveEvents;
const binding = createInteractiveDrawingBinding(drawing, events, visual);
void binding;

// @ts-expect-error drawing options are recursively JSON-safe
const invalidOptions: DrawingOptions = { callback() {} };
void invalidOptions;
