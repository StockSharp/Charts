const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { CommandStack } = require('../src/core/interaction/command-stack.js');
const {
    DrawingController,
    DrawingDefinitionRegistry,
} = require('../src/drawings/index.js');

function setup() {
    const commands = new CommandStack();
    const mainSeries = [];
    const secondSeries = [];
    const main = { id: () => 'main', series: () => mainSeries };
    const second = { id: () => 'second', series: () => secondSeries };
    const attached = new Set();
    const clickListeners = new Set();
    const crosshairListeners = new Set();
    let drawingMode = false;
    const chart = {
        panes: () => [main, second],
        commandStack: () => commands,
        attachPrimitive(primitive, options) { attached.add(primitive); primitive.pane = options.pane.id(); },
        detachPrimitive(primitive) { attached.delete(primitive); },
        subscribeClick(listener) { clickListeners.add(listener); },
        unsubscribeClick(listener) { clickListeners.delete(listener); },
        subscribeCrosshairMove(listener) { crosshairListeners.add(listener); },
        unsubscribeCrosshairMove(listener) { crosshairListeners.delete(listener); },
        beginDrawing() { drawingMode = true; },
        finishDrawing() { drawingMode = false; },
        drawingMode: () => drawingMode,
        emitClick(event) { for (const listener of clickListeners) listener(event); },
        emitCrosshair(event) { for (const listener of crosshairListeners) listener(event); },
        inputListenerCounts: () => [clickListeners.size, crosshairListeners.size],
    };
    const bindings = new Map();
    const registry = new DrawingDefinitionRegistry();
    registry.register({
        type: 'trend',
        name: 'Trend Line',
        points: { min: 2, max: 2 },
        defaultOptions: { color: '#2962ff', width: 2 },
        create(instance, events) {
            const binding = {
                primitive: { attached() {}, detached() {}, updateAllViews() {} },
                events,
                updates: [],
                disposed: false,
                update(next) { this.updates.push(next); },
                dispose() { this.disposed = true; },
            };
            bindings.set(instance.id, binding);
            return binding;
        },
    });
    const controller = new DrawingController({ chart, registry });
    return { attached, bindings, chart, commands, controller, mainSeries, registry, secondSeries };
}

const points = [
    { time: 10, price: 100 },
    { time: 20, price: 110 },
];

describe('DrawingController', () => {
    it('owns CRUD, pane attachment and visibility through one command stack', () => {
        const { attached, bindings, commands, controller } = setup();
        const created = controller.create('trend', points, { id: 'a' });
        const firstBinding = bindings.get('a');
        assert.equal(created.options.color, '#2962ff');
        assert.equal(attached.has(firstBinding.primitive), true);
        assert.equal(commands.snapshot().undoLabel, 'Create Trend Line');

        const moved = controller.update('a', {
            points: [points[0], { time: 30, price: 120 }],
            paneId: 'second',
        });
        assert.equal(moved.paneId, 'second');
        assert.equal(firstBinding.primitive.pane, 'second');
        assert.equal(firstBinding.updates.length, 1);

        assert.equal(commands.undo(), true);
        assert.equal(controller.get('a').paneId, 'main');
        assert.equal(firstBinding.primitive.pane, 'main');
        assert.equal(commands.redo(), true);
        assert.equal(controller.get('a').points[1].price, 120);

        controller.setVisible('a', false);
        assert.equal(attached.has(firstBinding.primitive), false);
        commands.undo();
        assert.equal(attached.has(firstBinding.primitive), true);

        assert.equal(controller.remove('a'), true);
        assert.equal(firstBinding.disposed, true);
        assert.equal(controller.has('a'), false);
        commands.undo();
        assert.equal(controller.has('a'), true);
        assert.notEqual(bindings.get('a'), firstBinding);
    });

    it('records a whole primitive preview gesture as one undoable edit', () => {
        const { bindings, commands, controller } = setup();
        controller.create('trend', points, { id: 'gesture' });
        commands.clear();
        const binding = bindings.get('gesture');
        const origin = controller.get('gesture');
        const preview = {
            ...origin,
            points: [origin.points[0], { time: 25, price: 115 }],
        };
        const final = {
            ...preview,
            points: [preview.points[0], { time: 30, price: 125 }],
        };

        binding.events.preview(preview);
        assert.equal(controller.get('gesture').points[1].price, 115);
        assert.equal(commands.snapshot().undoCount, 0);
        binding.events.commit(final);

        assert.equal(controller.get('gesture').points[1].price, 125);
        assert.equal(commands.snapshot().undoCount, 1);
        commands.undo();
        assert.deepEqual(controller.get('gesture'), origin);
        commands.redo();
        assert.equal(controller.get('gesture').points[1].price, 125);
    });

    it('duplicates and clears drawings as atomic commands', () => {
        const { commands, controller } = setup();
        controller.create('trend', points, { id: 'one' });
        const copy = controller.duplicate('one', 'two');
        assert.equal(copy.id, 'two');
        assert.notEqual(copy.points, controller.get('one').points);
        commands.clear();

        assert.equal(controller.clear(), true);
        assert.deepEqual(controller.drawings(), []);
        assert.equal(commands.snapshot().undoCount, 1);
        commands.undo();
        assert.deepEqual(controller.drawings().map(item => item.id), ['one', 'two']);
        commands.redo();
        assert.deepEqual(controller.drawings(), []);
    });

    it('rejects unknown types, bad point counts, panes and duplicate ids', () => {
        const { controller } = setup();
        assert.throws(() => controller.create('missing', points), /unknown drawing type/);
        assert.throws(() => controller.create('trend', points.slice(0, 1)), /requires 2 point/);
        assert.throws(
            () => controller.create('trend', points, { paneId: 'missing' }),
            /pane 'missing'/,
        );
        controller.create('trend', points, { id: 'same' });
        assert.throws(() => controller.create('trend', points, { id: 'same' }), /already in use/);
    });

    it('creates a fixed-point drawing stepwise with a live draft and one command', () => {
        const { attached, bindings, chart, commands, controller } = setup();
        const creationEvents = [];
        controller.subscribeCreation(value => creationEvents.push(value));
        controller.beginCreation('trend', { id: 'drawn' });

        assert.equal(chart.drawingMode(), true);
        assert.deepEqual(chart.inputListenerCounts(), [1, 1]);
        assert.equal(controller.creation().points.length, 0);

        chart.emitClick(click(10, 100));
        const draft = [...bindings.entries()].find(([id]) => id.startsWith('__sschart-draft-'))[1];
        assert.equal(controller.creation().points.length, 1);
        assert.equal(attached.has(draft.primitive), true);
        assert.deepEqual(draft.updates, []);

        chart.emitCrosshair(crosshair(18, 108));
        assert.deepEqual(draft.updates.at(-1).points, [
            { time: 10, price: 100 },
            { time: 18, price: 108 },
        ]);

        chart.emitClick(click(20, 110));
        assert.equal(controller.creation(), null);
        assert.equal(chart.drawingMode(), false);
        assert.deepEqual(chart.inputListenerCounts(), [0, 0]);
        assert.deepEqual(controller.get('drawn').points, points);
        assert.equal(draft.disposed, true);
        assert.equal(attached.has(draft.primitive), false);
        assert.equal(commands.snapshot().undoCount, 1);
        assert.equal(creationEvents.at(-1), null);

        commands.undo();
        assert.equal(controller.has('drawn'), false);
    });

    it('supports cancellation and explicit completion for variable-point tools', () => {
        const { chart, commands, controller, registry } = setup();
        registry.register({
            type: 'polyline',
            name: 'Polyline',
            points: { min: 2, max: 4 },
            defaultOptions: {},
            create() {
                return {
                    primitive: { attached() {}, detached() {}, updateAllViews() {} },
                    update() {},
                };
            },
        });

        controller.beginCreation('polyline');
        chart.emitClick(click(10, 100));
        assert.equal(controller.finishCreation(), null);
        chart.emitClick(click(20, 110));
        const created = controller.finishCreation();
        assert.deepEqual(created.points, points);
        assert.equal(commands.snapshot().undoCount, 1);

        commands.clear();
        controller.beginCreation('trend');
        chart.emitClick(click(30, 120));
        assert.equal(controller.cancelCreation(), true);
        assert.equal(controller.creation(), null);
        assert.equal(commands.snapshot().undoCount, 0);
        assert.equal(chart.drawingMode(), false);
        assert.equal(controller.cancelCreation(), false);
    });

    it('keeps all creation points on the pane selected by the first click', () => {
        const { chart, controller } = setup();
        controller.beginCreation('trend');
        chart.emitClick(click(10, 100, 'second'));
        chart.emitClick(click(20, 110, 'main'));
        assert.equal(controller.creation().points.length, 1);
        chart.emitClick(click(20, 110, 'second'));
        assert.equal(controller.get('trend-1').paneId, 'second');
    });

    it('applies renderer-defined magnet values to preview and committed anchors', () => {
        const { chart, controller, mainSeries } = setup();
        const indicator = {
            magnetValues: data => [data.value],
            priceToCoordinate: price => price,
        };
        mainSeries.push(indicator);
        controller.applyMagnetOptions({ mode: 'strong' });
        controller.beginCreation('trend', { id: 'snapped' });

        chart.emitClick(click(
            10,
            250,
            'main',
            new Map([[indicator, { time: 10, value: 105 }]]),
        ));
        chart.emitCrosshair({
            ...crosshair(20, 260),
            seriesData: new Map([[indicator, { time: 20, value: 112 }]]),
        });
        assert.equal(controller.creation().previewPoint.price, 112);
        chart.emitClick(click(
            20,
            260,
            'main',
            new Map([[indicator, { time: 20, value: 112 }]]),
        ));

        assert.deepEqual(controller.get('snapped').points, [
            { time: 10, price: 105 },
            { time: 20, price: 112 },
        ]);
    });

    it('restores known drawings atomically, skips unknown types and clears stale history', () => {
        const { commands, controller } = setup();
        controller.create('trend', points, { id: 'old' });
        const unknown = {
            id: 'plugin',
            type: 'missing-plugin',
            paneId: 'main',
            points: [{ time: 1, price: 2 }],
            options: {},
            visible: true,
            locked: false,
            zOrder: 0,
        };
        const restored = {
            ...controller.get('old'),
            id: 'restored',
            points,
        };

        const result = controller.replaceAll([unknown, restored]);
        assert.deepEqual(controller.drawings().map(item => item.id), ['restored']);
        assert.deepEqual(result.restored.map(item => item.id), ['restored']);
        assert.deepEqual(result.skipped, [{
            id: 'plugin', type: 'missing-plugin', reason: 'unknown-type',
        }]);
        assert.equal(commands.snapshot().undoCount, 0);

        assert.throws(
            () => controller.replaceAll([unknown], { unknownType: 'error' }),
            /unknown drawing type/,
        );
        assert.deepEqual(controller.drawings().map(item => item.id), ['restored']);
    });
});

function click(time, price, paneId = 'main', seriesData = new Map()) {
    return {
        time,
        price,
        paneId,
        point: { x: time, y: price },
        seriesData,
        button: 0,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        hoveredObject: null,
    };
}

function crosshair(time, price, paneId = 'main') {
    return {
        time,
        logical: time,
        price,
        paneId,
        point: { x: time, y: price },
        seriesData: new Map(),
        hoveredObject: null,
        sourceEvent: null,
    };
}
