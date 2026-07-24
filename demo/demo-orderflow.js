// Order-flow showcase: the three exact volume-at-price studies over one data
// set. Footprint and TPO are custom series that draw per bar / per session;
// the exact volume profile aggregates bid/ask volume across a fixed range.
(function () {
    'use strict';
    var pal = Demo.PALETTES.dark;
    Demo.applyCssPalette(pal);

    var TICK = 0.25;
    var chart = SSChart.createChart(Demo.el('chart'), Demo.chartTheme(pal, { mode: 'ordinal' }));
    var exactBars = Demo.genExactBars(90, { tickSize: TICK, step: 300, seed: 1234 });
    var tpoBars = Demo.genTpoBars(216, { sessionSize: 24, step: 300, seed: 77, startPrice: 100 });

    var current = [];   // series instances for the active mode

    var DESC = {
        footprint: 'Per-bar bid × ask volume at every tick, with imbalance colouring. Zoom in to read individual cells.',
        profile: 'Aggregated volume-at-price across the visible range (candles for context). Wide bands mark high-activity prices.',
        tpo: 'Market-profile letters: how long price traded at each level per session, with point-of-control and value area.',
    };

    function clear() {
        current.forEach(function (s) { try { chart.removeSeries(s); } catch (e) { /* already gone */ } });
        current = [];
    }

    function build(mode) {
        clear();
        if (mode === 'footprint') {
            var fp = chart.addSeries(SSChart.FootprintSeries, {
                tickSize: TICK,
                mode: SSChart.FootprintDisplayMode.BidAsk,
                detailLevel: SSChart.FootprintDetailLevel.Auto,
                bidColor: pal.bid, askColor: pal.ask,
                showUnfinishedAuctions: true,
            });
            fp.setData(exactBars);
            current = [fp];
            chart.timeScale().setVisibleLogicalRange({ from: exactBars.length - 14, to: exactBars.length + 1 });
        } else if (mode === 'profile') {
            var c = chart.addSeries(SSChart.CandlestickSeries, {
                upColor: pal.up, downColor: pal.down, borderVisible: false,
                wickUpColor: pal.up, wickDownColor: pal.down,
            });
            c.setData(exactBars);
            var vp = chart.addSeries(SSChart.ExactVolumeProfileSeries, {
                tickSize: TICK,
                // Visible mode: the profile recomputes over whatever candles are in
                // view, so it changes as you zoom / scroll (Fixed pins one range).
                rangeMode: SSChart.VolumeProfileRangeMode.Visible,
                displayMode: SSChart.VolumeProfileDisplayMode.BidAsk,
                bidColor: pal.bid, askColor: pal.ask,
                showLabels: true, profileWidth: 0.32,
            });
            vp.setData(exactBars);
            current = [c, vp];
            chart.timeScale().fitContent();
        } else {
            var tpo = chart.addSeries(SSChart.TpoSeries, {
                displayMode: SSChart.TpoDisplayMode.Auto,
                showPoc: true, showValueArea: true, showInitialBalance: true, showSinglePrints: true,
            });
            tpo.setData(tpoBars);
            current = [tpo];
            chart.timeScale().fitContent();
        }
        Demo.el('modeDesc').textContent = DESC[mode];
    }

    // ---- mode segmented control --------------------------------------------
    var seg = Demo.el('modeSeg');
    seg.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-mode]');
        if (!btn) return;
        Array.prototype.forEach.call(seg.querySelectorAll('.tbtn'), function (b) { b.classList.remove('on'); });
        btn.classList.add('on');
        build(btn.getAttribute('data-mode'));
    });
    build('footprint');

    // ---- theme --------------------------------------------------------------
    var dark = true;
    Demo.el('themeBtn').addEventListener('click', function () {
        dark = !dark;
        pal = dark ? Demo.PALETTES.dark : Demo.PALETTES.light;
        Demo.applyCssPalette(pal);
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        chart.applyOptions(Demo.chartTheme(pal, { mode: 'ordinal' }));
        var active = seg.querySelector('.on').getAttribute('data-mode');
        build(active);
        Demo.el('themeBtn').innerHTML = dark ? '&#9788; Light' : '&#9789; Dark';
    });
})();
