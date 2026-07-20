// Moving Average Ribbon.
// Port of StockSharp Algo.Indicators MovingAverageRibbon.cs.
//
// The .cs builds `RibbonCount` SimpleMovingAverage inner indicators with
// lengths spaced as:
//   step = (LongPeriod - ShortPeriod) / (RibbonCount - 1)         // int division
//   lengths[i] = ShortPeriod + i * step      for i in [0..RibbonCount-1)
// Defaults: ShortPeriod=10, LongPeriod=100, RibbonCount=10
//   → step = (100-10)/9 = 10, lengths = [10,20,30,40,50,60,70,80,90,100]
//
// NB: the .cs uses C# integer division for `step`, which can leave the
// last entry below LongPeriod (e.g. Short=10, Long=99, Count=10 → step=9,
// lengths = [10,19,28,37,46,55,64,73,82,91]). We replicate that exactly.
//
// IMPORTANT — the complex indicator runs in ComplexIndicatorModes.Sequence, so
// the SMAs are CASCADED, not applied independently to the close: SMA[k] smooths
// the OUTPUT of SMA[k-1], and BaseComplexIndicator.OnProcess feeds SMA[k] only
// on bars where every earlier SMA is already IsFormed (it breaks the chain at
// the first unformed inner). So SMA[0]=SMA(close) forms first; SMA[1] then gets
// SMA[0]'s formed output and forms len[1] bars later; and so on, the warm-up
// accumulating down the ribbon. Each line is gated (nulled) until its own SMA
// is formed. We simulate that stateful cascade bar-by-bar below.
//
// `Reset()` enforces RibbonCount >= 2 and Short/Long >= 1 — we mirror with
// `throw new Error()` on invalid params to fail loudly during dev (the
// renderer should never feed bad params, but tests can hit it).
//
// Output shape:
//   { lengths: number[], averages: IndicatorPoint[][] }
// where averages[i] is the SMA series for lengths[i]. Each series has
// length == candles.length; first (lengths[i] - 1) entries are null.

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
 * @typedef {{lengths: number[], averages: IndicatorPoint[][]}} MARibbonSeries
 */

/**
 * @param {CandlePoint[]} candles
 * @param {{shortPeriod?: number, longPeriod?: number, ribbonCount?: number}} [params]
 * @returns {MARibbonSeries}
 */
export function calcMovingAverageRibbon(candles, params) {
    const shortPeriod = params && Number.isFinite(params.shortPeriod) ? (params.shortPeriod | 0) : 10;
    const longPeriod = params && Number.isFinite(params.longPeriod) ? (params.longPeriod | 0) : 100;
    const ribbonCount = params && Number.isFinite(params.ribbonCount) ? (params.ribbonCount | 0) : 10;

    if (shortPeriod < 1) throw new Error('shortPeriod must be >= 1');
    if (longPeriod < 1) throw new Error('longPeriod must be >= 1');
    if (ribbonCount < 2) throw new Error('ribbonCount must be >= 2');

    // C# integer division (positive operands here): truncate toward zero.
    const step = ((longPeriod - shortPeriod) / (ribbonCount - 1)) | 0;
    const lengths = new Array(ribbonCount);
    for (let i = 0; i < ribbonCount; i++) lengths[i] = shortPeriod + i * step;

    if (!Array.isArray(candles) || candles.length === 0) {
        return { lengths, averages: lengths.map(() => []) };
    }

    const n = candles.length;

    // Stateful partial-seed SMAs (SimpleMovingAverage.cs = Buffer.Sum / Length),
    // one per ribbon length. Post-form the value equals a windowed SMA; the
    // partial-seed phase is never emitted (gated on `formed`) nor fed downstream
    // (the cascade only advances once a stage is formed).
    const state = lengths.map((L) => ({ L, buf: [], sum: 0, formed: false }));
    const pushSMA = (st, v) => {
        st.buf.push(v);
        st.sum += v;
        if (st.buf.length > st.L) st.sum -= st.buf.shift();
        st.formed = st.buf.length === st.L;
        return st.sum / st.L;
    };

    const averages = new Array(ribbonCount);
    for (let s = 0; s < ribbonCount; s++) averages[s] = new Array(n);

    for (let i = 0; i < n; i++) {
        const t = candles[i].time;
        const close = candles[i] && candles[i].close;
        let input = close;
        let broke = !(typeof input === 'number' && Number.isFinite(input));
        for (let k = 0; k < ribbonCount; k++) {
            if (broke) { averages[k][i] = { time: t, value: null }; continue; }
            const r = pushSMA(state[k], input);
            averages[k][i] = { time: t, value: state[k].formed ? r : null };
            if (!state[k].formed) broke = true; // later stages not fed this bar
            else input = r;
        }
    }
    return { lengths, averages };
}
