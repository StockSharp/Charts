// A headless, browser-free CanvasRenderingContext2D stand-in used to verify
// chart rendering without a real browser. It does not rasterize anything — it
// RECORDS the ordered sequence of draw calls and style mutations the engine
// makes, so tests can snapshot "what was drawn" (a deterministic command log)
// instead of pixels. Catches rendering-logic regressions (wrong shapes /
// positions / colours / order) with plain `node --test`.
//
// Implemented as a Proxy so no canvas method can be silently missed: any known
// 2D method is recorded with its (rounded) arguments; any property assignment
// (fillStyle, lineWidth, font, …) is recorded too. The few methods that return
// a value the engine consumes (measureText, getLineDash, gradients) return
// deterministic stand-ins.

const METHODS = new Set([
    'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo',
    'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect',
    'roundRect', 'fill', 'stroke', 'clip', 'fillRect', 'strokeRect',
    'clearRect', 'fillText', 'strokeText', 'setLineDash', 'getLineDash',
    'measureText', 'setTransform', 'resetTransform', 'transform', 'translate',
    'scale', 'rotate', 'createLinearGradient', 'createRadialGradient',
    'createConicGradient', 'createPattern', 'drawImage', 'putImageData',
    'getImageData', 'createImageData', 'isPointInPath', 'isPointInStroke',
]);

function fmt(value) {
    if (typeof value === 'number') {
        // Round to kill sub-pixel float noise while keeping meaningful geometry.
        return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : String(value);
    }
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean' || value === null || value === undefined) return String(value);
    if (Array.isArray(value)) return '[' + value.map(fmt).join(',') + ']';
    if (value && value.__kind) return value.__kind;   // gradient / pattern marker
    return '{obj}';
}

/**
 * @returns {{ ctx: CanvasRenderingContext2D, ops: string[] }}
 */
export function createRecordingContext() {
    const ops = [];
    const store = Object.create(null);

    const gradient = () => {
        const g = {
            __kind: 'gradient',
            addColorStop(offset, color) { ops.push(`gradient.addColorStop(${fmt(offset)}, ${fmt(color)})`); return g; },
        };
        return g;
    };

    const record = (name) => (...args) => {
        ops.push(`${name}(${args.map(fmt).join(', ')})`);
        if (name === 'createLinearGradient' || name === 'createRadialGradient' || name === 'createConicGradient') return gradient();
        if (name === 'createPattern') return { __kind: 'pattern' };
        if (name === 'measureText') { const t = args[0] == null ? '' : String(args[0]); return { width: t.length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }; }
        if (name === 'getLineDash') return [];
        return undefined;
    };

    const handler = {
        get(_target, prop) {
            if (prop === 'canvas') return { width: 0, height: 0 };
            if (typeof prop === 'symbol') return undefined;
            if (METHODS.has(prop)) return record(prop);
            return store[prop];
        },
        set(_target, prop, value) {
            store[prop] = value;
            ops.push(`${String(prop)} = ${fmt(value)}`);
            return true;
        },
    };

    return { ctx: new Proxy({}, handler), ops };
}
