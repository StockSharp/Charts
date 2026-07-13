// Negative Volume Index (NVI).
// Port of StockSharp Algo.Indicators NegativeVolumeIndex.cs.
//
// State (per .cs):
//   _prevClose   — last bar's close, 0 until seeded
//   _prevVolume  — last bar's volume, 0 until seeded
//   _nvi         — running NVI, initialised to 1000 (per Reset())
//
// Per bar:
//   nvi = _nvi
//   if (_prevClose != 0 && _prevVolume != 0 && volume != 0)
//       if (volume < _prevVolume)
//           pct = (close - _prevClose) / _prevClose
//           nvi += nvi * pct
//   if (input.IsFinal)
//       _prevClose = close; _prevVolume = volume; _nvi = nvi
//   return nvi
//
// So:
//   * The very first bar emits the seed value (1000) unchanged — _prevClose
//     is still 0, no comparison runs.
//   * On bars where volume DID NOT decrease, nvi carries the previous value.
//   * On bars where volume decreased, nvi changes by the price-pct.
//
// .cs deviation notes:
//   (a) The .cs checks `candle.TotalVolume != 0` (skips the update for
//       zero-volume bars). We do the same.
//   (b) Bad bars (non-finite close or volume) emit the current carried nvi
//       (consistent with how the .cs would behave if Process were called
//       with a real candle whose volume is 0 — but since we can't push a
//       NaN into _prevVolume safely, we DO NOT update _prevClose/_prevVolume
//       on bad bars, so the next valid bar still compares against the last
//       known good baseline).

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
 * @typedef {{time: string|number, value: number|null}} IndicatorPoint
 */

/**
 * @param {CandlePoint[]} candles
 * @param {object} [_params] No tunables — accepted for registry uniformity.
 * @returns {IndicatorPoint[]}
 */
export function calcNVI(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);

    let prevClose = 0;
    let prevVolume = 0;
    let nvi = 1000; // .cs seed

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const cl = c && c.close;
        const v = c && c.volume;
        const okClose = typeof cl === 'number' && Number.isFinite(cl);
        const okVol = typeof v === 'number' && Number.isFinite(v);

        if (!okClose || !okVol) {
            // Carry: do not advance state — keeps the prevClose baseline
            // pointing at the last good bar so we resume cleanly.
            out[i] = { time: c && c.time, value: nvi };
            continue;
        }

        let nextNvi = nvi;
        if (prevClose !== 0 && prevVolume !== 0 && v !== 0) {
            if (v < prevVolume) {
                const pct = (cl - prevClose) / prevClose;
                nextNvi = nvi + nvi * pct;
            }
        }

        // input.IsFinal — closed-bar batch: always commit state.
        prevClose = cl;
        prevVolume = v;
        nvi = nextNvi;

        out[i] = { time: c.time, value: nvi };
    }

    return out;
}
