// A browser-free DOM double good enough to actually construct a chart.
//
// ChartImpl's constructor is real DOM code: it creates a div and two canvases, writes
// dataset/style/className on them, appends them to the host and takes a 2d context. Until now
// nothing in `npm test` exercised that path — construction was covered only by Playwright — so a
// new DOM member added to the constructor was discovered downstream, by the StockSharp terminal's
// headless suite, as `TypeError: Cannot set properties of undefined (setting 'sschartLayer')`.
// The repo that owns the engine should be the one that notices.
//
// The double provides the baseline HTMLElement surface the engine is entitled to assume, and
// nothing more. That is deliberate: if the engine starts using a further DOM member, the right
// outcome is a loud failure here, followed by a considered decision to add it.

import { createRecordingContext } from './render/recording-context.js';

function elementDouble(document, tagName) {
    const listeners = new Map();
    const classes = new Set();
    const element = {
        tagName: String(tagName).toUpperCase(),
        ownerDocument: document,
        // A plain bag: the engine sets arbitrary CSS properties (including vendor-prefixed ones)
        // and never reads them back, so recording assignments is enough.
        style: {},
        dataset: {},
        className: '',
        children: [],
        parentElement: null,
        clientWidth: 800,
        clientHeight: 400,
        width: 0,
        height: 0,
        classList: {
            add: (value) => { classes.add(value); },
            remove: (value) => { classes.delete(value); },
            contains: (value) => classes.has(value),
        },
        append(...nodes) {
            for (const node of nodes) this.appendChild(node);
        },
        appendChild(child) {
            child.parentElement = this;
            this.children.push(child);
            return child;
        },
        remove() {
            const parent = this.parentElement;
            if (parent === null) return;
            const at = parent.children.indexOf(this);
            if (at >= 0) parent.children.splice(at, 1);
            this.parentElement = null;
        },
        getBoundingClientRect() {
            return { x: 0, y: 0, top: 0, left: 0, right: this.clientWidth, bottom: this.clientHeight,
                width: this.clientWidth, height: this.clientHeight };
        },
        getContext(kind) {
            if (kind !== '2d') return null;
            if (this._ctx === undefined) this._ctx = createRecordingContext().ctx;
            return this._ctx;
        },
        setPointerCapture() { /* pointer capture is a no-op without a real pointer */ },
        releasePointerCapture() { },
        addEventListener(type, listener) {
            let bucket = listeners.get(type);
            if (bucket === undefined) listeners.set(type, bucket = new Set());
            bucket.add(listener);
        },
        removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
        dispatchEvent(event) {
            for (const listener of listeners.get(event.type) ?? []) listener(event);
            return true;
        },
        listenerCount(type) { return listeners.get(type)?.size ?? 0; },
    };
    return element;
}

/**
 * Install the doubles on globalThis and hand back a host element to mount a chart into.
 * Always call restore() — the globals are process-wide and node:test shares the process.
 */
export function createHeadlessDom() {
    const document = {
        visibilityState: 'visible',
        createElement: (tagName) => elementDouble(document, tagName),
        addEventListener() { },
        removeEventListener() { },
    };
    const host = elementDouble(document, 'div');

    // applySize reads window.devicePixelRatio; 1 keeps canvas pixels equal to CSS pixels so the
    // coordinate assertions are readable.
    const window = {
        document,
        devicePixelRatio: 1,
        addEventListener() { },
        removeEventListener() { },
    };

    // Frames are queued, never timed. A test that wants a draw asks for one with flushFrames(),
    // so nothing here depends on a timer firing and the result is the same on every machine.
    const frames = new Map();
    let nextFrameId = 1;
    const requestAnimationFrame = (callback) => {
        const id = nextFrameId++;
        frames.set(id, callback);
        return id;
    };
    const cancelAnimationFrame = (id) => { frames.delete(id); };

    const saved = new Map();
    const globals = [
        ['document', document],
        ['window', window],
        ['requestAnimationFrame', requestAnimationFrame],
        ['cancelAnimationFrame', cancelAnimationFrame],
    ];
    for (const [name, value] of globals) {
        saved.set(name, { had: name in globalThis, value: globalThis[name] });
        globalThis[name] = value;
    }

    return {
        document,
        window,
        host,
        /** Run every queued frame callback, including ones they queue in turn. Returns how many ran. */
        flushFrames(maxRounds = 10) {
            let ran = 0;
            for (let round = 0; round < maxRounds && frames.size > 0; round++) {
                const pending = [...frames.entries()];
                frames.clear();
                for (const [, callback] of pending) { callback(performance.now()); ran++; }
            }
            return ran;
        },
        restore() {
            for (const [name, prev] of saved) {
                if (prev.had) globalThis[name] = prev.value;
                else delete globalThis[name];
            }
        },
    };
}
