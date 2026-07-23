const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    InteractionController,
    InteractionState,
} = require('../src/core/interaction/interaction-controller.js');

const primitive = { attached() {}, detached() {}, updateAllViews() {} };
const object = (id, role = 'body') => ({ primitive, id, role });

describe('InteractionController', () => {
    it('tracks idle, hover and persistent selection', () => {
        const states = [];
        const controller = new InteractionController((snapshot) => states.push(snapshot));
        const first = object('first');

        controller.hover(first);
        assert.equal(controller.snapshot().state, InteractionState.Hover);
        controller.pointerDown({ x: 10, y: 10 }, {
            kind: 'primitive', object: first, selectable: true, draggable: false,
        });
        controller.pointerUp({ x: 11, y: 10 });
        controller.hover(null);

        assert.equal(controller.snapshot().state, InteractionState.Selected);
        assert.equal(controller.snapshot().selected.id, 'first');
        controller.clearSelection();
        assert.equal(controller.snapshot().state, InteractionState.Idle);
        assert.ok(states.length >= 4);
    });

    it('does not pan until the drag threshold is crossed', () => {
        const controller = new InteractionController(() => {}, 4);
        controller.pointerDown({ x: 100, y: 100 }, { kind: 'pane' });
        const pending = controller.pointerMove({ x: 103, y: 102 });
        assert.equal(pending.state, InteractionState.Idle);
        assert.equal(pending.started, false);

        const panning = controller.pointerMove({ x: 110, y: 104 });
        assert.equal(panning.state, InteractionState.Panning);
        assert.equal(panning.started, true);
        assert.deepEqual(panning.totalDelta, { x: 10, y: 4 });

        controller.pointerUp({ x: 112, y: 104 });
        assert.equal(controller.snapshot().state, InteractionState.Idle);
    });

    it('separates body and handle drags and keeps one selected object', () => {
        for (const [role, state] of [
            ['body', InteractionState.DraggingBody],
            ['handle', InteractionState.DraggingHandle],
        ]) {
            const controller = new InteractionController(() => {}, 2);
            const selected = object(role, role);
            controller.pointerDown({ x: 0, y: 0 }, {
                kind: 'primitive', object: selected, selectable: true, draggable: true,
            });
            const movement = controller.pointerMove({ x: 5, y: 0 });
            assert.equal(movement.state, state);
            assert.equal(movement.started, true);
            controller.pointerUp({ x: 8, y: 1 });
            assert.equal(controller.snapshot().state, InteractionState.Selected);
            assert.equal(controller.snapshot().selected.id, role);
        }
    });

    it('models immediate scale, drawing and cancellation states', () => {
        const controller = new InteractionController();
        controller.pointerDown({ x: 5, y: 5 }, { kind: 'scale' });
        assert.equal(controller.snapshot().state, InteractionState.Scaling);
        controller.cancel();
        assert.equal(controller.snapshot().state, InteractionState.Idle);

        controller.beginDrawing();
        assert.equal(controller.snapshot().state, InteractionState.Drawing);
        controller.finishDrawing(object('created'));
        assert.equal(controller.snapshot().state, InteractionState.Selected);
        assert.equal(controller.snapshot().selected.id, 'created');
    });

    it('forgets detached primitive hover, selection and capture', () => {
        const controller = new InteractionController();
        const selected = object('detached');
        controller.hover(selected);
        controller.pointerDown({ x: 0, y: 0 }, {
            kind: 'primitive', object: selected, selectable: true, draggable: true,
        });
        assert.equal(controller.hasActivePress, true);

        controller.forgetPrimitive(primitive);

        assert.equal(controller.hasActivePress, false);
        assert.deepEqual(controller.snapshot(), {
            state: InteractionState.Idle,
            hovered: null,
            selected: null,
        });
    });
});
