// On-Balance Volume (OBV) — Granville's variant.
// Port of StockSharp Algo.Indicators OnBalanceVolume.cs.
//
// Algorithm (per .cs):
//   _prevClosePrice = 0, _currentValue = 0 (Reset)
//   per bar:
//     currentValue = _currentValue
//     if (_prevClosePrice != 0)
//         if (close > _prevClosePrice) currentValue += volume
//         else if (close < _prevClosePrice) currentValue -= volume
//     if (input.IsFinal)
//         _prevClosePrice = close; _currentValue = currentValue
//     return currentValue
//
// Compared with our existing BalanceVolume port (obv.js / BalanceVolume.cs):
//   * BalanceVolume returns NULL on the first bar (no previous close yet).
//   * OnBalanceVolume returns 0 on the first bar (the .cs returns
//     `currentValue` unconditionally, and `currentValue` is 0 because the
//     `if (_prevClosePrice != 0)` guard short-circuits).
//   * Cumulative sum semantics for bars 1..n are otherwise identical.
//
// So we DO NOT delegate to calcOBV — the warm-up bar would differ. We
// implement OnBalanceVolume directly here to match its .cs exactly.
//
// .cs deviation notes:
//   (a) Bad bars (non-finite close/volume) emit `null` and keep the running
//       sum + previous-close marker unchanged. The .cs would crash on NaN —
//       this is a defensive UI-side fallback, same convention as obv.js.

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
export function calcOnBalanceVolume(candles, _params) {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const n = candles.length;
    const out = new Array(n);
    let cum = 0;
    let prevClose = 0; // .cs sentinel: 0 means "not yet seeded"

    for (let i = 0; i < n; i++) {
        const c = candles[i];
        const cl = c && c.close;
        const v = c && c.volume;
        const okClose = typeof cl === 'number' && Number.isFinite(cl);
        const okVol = typeof v === 'number' && Number.isFinite(v);

        if (!okClose || !okVol) {
            // Carry without updating state.
            out[i] = { time: c && c.time, value: null };
            continue;
        }

        // The .cs's `_prevClosePrice == 0` branch returns the current
        // (untouched) value, i.e. 0 on bar 0. Subsequent bars apply the
        // up/down rule.
        if (prevClose !== 0) {
            if (cl > prevClose) cum += v;
            else if (cl < prevClose) cum -= v;
            // equal → no change
        }

        prevClose = cl;
        out[i] = { time: c.time, value: cum };
    }
    return out;
}
