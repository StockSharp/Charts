const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { RenderDirty, RenderScheduler } = require('../src/core/render-scheduler.js');

function frameDriver() {
    let next = 1;
    const callbacks = new Map();
    return {
        request(callback) {
            const id = next++;
            callbacks.set(id, callback);
            return id;
        },
        cancel(id) { callbacks.delete(id); },
        fire() {
            const pending = Array.from(callbacks.values());
            callbacks.clear();
            for (const callback of pending) callback(0);
        },
        get size() { return callbacks.size; },
    };
}

describe('RenderScheduler', () => {
    it('coalesces dirty layers into one immutable frame mask', () => {
        const frames = frameDriver();
        const rendered = [];
        const scheduler = new RenderScheduler((dirty) => rendered.push(dirty), frames);

        scheduler.invalidate(RenderDirty.Base);
        scheduler.invalidate(RenderDirty.Overlay);

        assert.equal(frames.size, 1);
        assert.equal(scheduler.pendingDirty, RenderDirty.Base | RenderDirty.Overlay);
        frames.fire();
        assert.deepEqual(rendered, [RenderDirty.Base | RenderDirty.Overlay]);
        assert.equal(scheduler.pendingDirty, RenderDirty.None);
    });

    it('retains invalidations raised while a frame is rendering', () => {
        const frames = frameDriver();
        const rendered = [];
        let scheduler;
        scheduler = new RenderScheduler((dirty) => {
            rendered.push(dirty);
            scheduler.invalidate(RenderDirty.Axes);
        }, frames);

        scheduler.invalidate(RenderDirty.Base);
        frames.fire();
        assert.equal(frames.size, 1);
        frames.fire();
        assert.deepEqual(rendered, [RenderDirty.Base, RenderDirty.Axes]);
    });

    it('cancels pending work on dispose', () => {
        const frames = frameDriver();
        let renders = 0;
        const scheduler = new RenderScheduler(() => renders++, frames);
        scheduler.invalidate(RenderDirty.All);
        scheduler.dispose();
        frames.fire();
        assert.equal(renders, 0);
        assert.equal(frames.size, 0);
    });
});
