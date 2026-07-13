// Simple Moving Average — close-price based.
// Returns one point per input candle, time passed through untouched (the
// chart widget expects whatever shape the original candles use, currently
// ISO string). First (length-1) points carry value:null for the warm-up.

import { simpleMA } from './helpers.js';

export function calcSMA(candles, params) {
    const length = params && Number.isFinite(params.length) ? (params.length | 0) : 14;
    if (!Array.isArray(candles) || candles.length === 0) return [];
    const closes = new Array(candles.length);
    for (let i = 0; i < candles.length; i++) closes[i] = candles[i] && candles[i].close;
    const ma = simpleMA(closes, length);
    const out = new Array(candles.length);
    for (let i = 0; i < candles.length; i++) {
        out[i] = { time: candles[i].time, value: ma[i] };
    }
    return out;
}
