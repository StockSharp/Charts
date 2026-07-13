// Volume — trivial pass-through indicator.
// One point per candle, `value` is the candle's volume, and a colour hint
// `up`/`down` derived from close >= open. The renderer paints bars green
// when `up:true`, red when `up:false`, so it doesn't need access to the
// original candle stream. Missing/non-finite volume → value:null,
// up defaults to true (matches StockSharp's default neutral colouring).

/**
 * @typedef {object} CandlePoint
 * @property {string|number} time
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number} [volume]
 */

/**
 * @typedef {{time: string|number, value: number|null, up: boolean}} VolumePoint
 */

/**
 * @param {CandlePoint[]} candles
 * @param {object} [_params] No tunables — accepted for registry uniformity.
 * @returns {VolumePoint[]}
 */
export function calcVolume(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const n = candles.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const v = c && c.volume;
        const open = c && c.open;
        const close = c && c.close;
        const up = (typeof open === 'number' && Number.isFinite(open) &&
                    typeof close === 'number' && Number.isFinite(close))
            ? close >= open
            : true;
        out[i] = {
            time: c && c.time,
            value: (typeof v === 'number' && Number.isFinite(v)) ? v : null,
            up,
        };
    }
    return out;
}
