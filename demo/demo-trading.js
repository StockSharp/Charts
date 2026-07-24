// Trading-from-the-chart showcase (M10). The chart only renders canonical
// broker state and emits intents; the demo "broker" (Demo.makeFakeBroker) owns
// the orders/positions and confirms or rejects each intent. Drag is optimistic:
// a preview follows the cursor until the broker resolves the intent.
(function () {
    'use strict';
    var pal = Demo.PALETTES.dark;
    Demo.applyCssPalette(pal);

    var TICK = 0.25;
    var chart = SSChart.createChart(Demo.el('chart'), Demo.chartTheme(pal, { mode: 'ordinal' }));
    var candles = chart.addSeries(SSChart.CandlestickSeries, {
        upColor: pal.up, downColor: pal.down, borderVisible: false,
        wickUpColor: pal.up, wickDownColor: pal.down,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    var bars = Demo.genCandles(160, { startPrice: 100, step: 86400, seed: 7 });
    candles.setData(bars);
    chart.timeScale().setVisibleLogicalRange({ from: bars.length - 70, to: bars.length + 4 });

    // ---- broker-owned canonical state (seed) --------------------------------
    var lastTime = bars[bars.length - 1].time;
    var seedOrders = [
        { id: 'ob1', side: 'buy', type: 'limit', status: 'working', timeInForce: 'good-till-cancelled', quantity: 2, filledQuantity: 0, price: 96.00, revision: 1, permissions: { canModify: true, canCancel: true }, label: 'BID' },
        { id: 'os1', side: 'sell', type: 'limit', status: 'working', timeInForce: 'good-till-cancelled', quantity: 1, filledQuantity: 0, price: 104.00, revision: 1, permissions: { canModify: true, canCancel: true }, label: 'ASK' },
        { id: 'be', side: 'buy', type: 'limit', status: 'working', timeInForce: 'good-till-cancelled', quantity: 1, filledQuantity: 0, price: 98.00, revision: 1, permissions: { canModify: true, canCancel: true }, bracket: { groupId: 'bkt1', role: 'entry' }, label: 'ENTRY' },
        { id: 'bsl', side: 'sell', type: 'stop', status: 'working', timeInForce: 'good-till-cancelled', quantity: 1, filledQuantity: 0, stopPrice: 95.00, revision: 1, permissions: { canModify: true, canCancel: true }, bracket: { groupId: 'bkt1', role: 'stop-loss', parentOrderId: 'be' }, label: 'SL' },
        { id: 'btp', side: 'sell', type: 'limit', status: 'working', timeInForce: 'good-till-cancelled', quantity: 1, filledQuantity: 0, price: 103.00, revision: 1, permissions: { canModify: true, canCancel: true }, bracket: { groupId: 'bkt1', role: 'take-profit', parentOrderId: 'be' }, label: 'TP' },
    ];
    var seedPositions = [
        { id: 'pos1', side: 'long', quantity: 3, averagePrice: 100.00, revision: 1, pnl: { realized: 0, unrealized: 45, currency: 'USD', markPrice: 101.50 }, permissions: { canClose: true, canReverse: true, canProtect: true }, label: 'LONG 3' },
    ];
    var seedExecutions = [
        { id: 'ex1', orderId: 'be', time: bars[bars.length - 40].time, side: 'buy', price: 100.00, quantity: 3, liquidity: 'taker' },
        { id: 'ex2', time: bars[bars.length - 22].time, side: 'sell', price: 101.50, quantity: 1, liquidity: 'maker', fee: -0.02, feeCurrency: 'USD' },
    ];
    var seedQuote = { time: lastTime, bidPrice: 100.75, bidSize: 5, askPrice: 101.00, askSize: 4, lastPrice: 100.75, lastSize: 1 };

    // ---- trading layer + interactive primitive ------------------------------
    var layer = new SSChart.TradingLayer({ tickSize: TICK });
    var primitive = new SSChart.TradingLayerPrimitive(layer, {});
    chart.attachPrimitive(primitive, { series: candles });

    var broker = Demo.makeFakeBroker(layer, {
        orders: seedOrders, positions: seedPositions,
        onLog: log,
        delayMs: 700,
    });
    layer.setExecutions(seedExecutions);
    layer.setQuote(seedQuote);

    // Ctrl+left = buy limit, Ctrl+right = sell limit (placement bridge → intent).
    new SSChart.TradingOrderPlacementAdapter(chart, layer, {
        quantity: 1, orderType: 'limit', modifier: 'ctrl', title: 'ORDER', color: pal.accent,
    });

    // ---- side panel: orders / positions / log -------------------------------
    layer.subscribeChanges(renderState);
    renderState();

    function renderState() {
        var s = layer.state();
        var ol = Demo.el('ordersList'); ol.innerHTML = '';
        s.orders.forEach(function (o) {
            var px = o.price !== undefined ? o.price : o.stopPrice;
            var row = document.createElement('div');
            row.className = 'row ' + (o.side === 'buy' ? 'buy' : 'sell');
            row.innerHTML = '<span class="tag">' + (o.label || o.type) + '</span>'
                + '<span class="mono">' + o.side + ' ' + o.quantity + '</span>'
                + '<span class="mono px">' + fmt(px) + '</span>';
            ol.appendChild(row);
        });
        Demo.el('ordersCount').textContent = s.orders.length;
        var pl = Demo.el('posList'); pl.innerHTML = '';
        s.positions.forEach(function (p) {
            var up = p.pnl ? p.pnl.unrealized : 0;
            var row = document.createElement('div');
            row.className = 'row ' + (p.side === 'long' ? 'buy' : 'sell');
            row.innerHTML = '<span class="tag">' + (p.label || p.side) + '</span>'
                + '<span class="mono">@' + fmt(p.averagePrice) + '</span>'
                + '<span class="mono px ' + (up >= 0 ? 'pos' : 'neg') + '">' + (up >= 0 ? '+' : '') + up + '</span>';
            pl.appendChild(row);
        });
        Demo.el('posCount').textContent = s.positions.length;
    }

    function log(kind, text) {
        var box = Demo.el('log');
        var line = document.createElement('div');
        line.className = 'log-line ' + kind;
        line.textContent = '[' + kind + '] ' + text;
        box.insertBefore(line, box.firstChild);
        while (box.childNodes.length > 60) box.removeChild(box.lastChild);
    }

    function fmt(v) { return v === undefined ? '—' : v.toFixed(2); }

    // ---- controls -----------------------------------------------------------
    var rejectBtn = Demo.el('rejectBtn');
    rejectBtn.addEventListener('click', function () {
        var next = !broker.state.rejectNext;
        broker.setRejectNext(next);
        rejectBtn.classList.toggle('on', next);
        rejectBtn.textContent = next ? 'Will reject next ✗' : 'Reject next intent';
    });
    Demo.el('resetBtn').addEventListener('click', function () { location.reload(); });

    var dark = true;
    Demo.el('themeBtn').addEventListener('click', function () {
        dark = !dark;
        pal = dark ? Demo.PALETTES.dark : Demo.PALETTES.light;
        Demo.applyCssPalette(pal);
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        chart.applyOptions(Demo.chartTheme(pal, { mode: 'ordinal' }));
        candles.applyOptions({ upColor: pal.up, downColor: pal.down, wickUpColor: pal.up, wickDownColor: pal.down });
        Demo.el('themeBtn').innerHTML = dark ? '&#9788; Light' : '&#9789; Dark';
    });
})();
