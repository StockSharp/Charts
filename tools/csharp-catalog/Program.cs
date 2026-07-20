// Dumps the StockSharp indicator catalog (kind, pane, measure, output count, param keys/types/
// defaults) to stdout as JSON. Referenced live by the Charts parity test — no committed fixture.
using System;
using System.Collections.Generic;
using System.Reflection;
using System.Linq;
using System.Text.Json;
using StockSharp.Algo;
using StockSharp.Algo.Indicators;
using StockSharp.Messages;

var excluded = new HashSet<string>
{
    "Id","Name","IsFormed","NumValuesToInitialize","Container","Source",
    "Measure","Style","Color","IsPreloaded","IsComplex","IsObsolete","Mode",
};

var provider = new IndicatorProvider();
provider.Init();

// --values mode: run every single-output indicator (default params) over a fixed, deterministic
// OHLCV series and print { input, indicators:[{ kind, params, values:(number|null)[] }] } so the
// Charts numeric-parity test can compare the JS port bar-for-bar. The C# side is authoritative and
// read live; no committed fixture. Complex / multi-output indicators are emitted with complex:true
// and no values for now (their per-line dump lands later).
if (args.Contains("--values"))
{
    const int n = 200;
    var t0 = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    var input = new List<TimeFrameCandleMessage>();
    for (var i = 0; i < n; i++)
    {
        var c = Math.Round((decimal)(100.0 + 15.0 * Math.Sin(i / 9.0) + 6.0 * Math.Cos(i / 4.0) + i * 0.05), 2);
        var o = i == 0 ? c : input[i - 1].ClosePrice;
        var spread = Math.Round((decimal)(1.5 + Math.Abs(Math.Sin(i / 3.0))), 2);
        var time = t0.AddMinutes(i);
        input.Add(new TimeFrameCandleMessage
        {
            OpenTime = time,
            CloseTime = time,
            OpenPrice = o,
            HighPrice = Math.Max(o, c) + spread,
            LowPrice = Math.Min(o, c) - spread,
            ClosePrice = c,
            TotalVolume = Math.Round((decimal)(1500.0 + 400.0 * Math.Sin(i / 5.0)), 2),
            State = CandleStates.Finished,
        });
    }

    // Forming-bar probes for the "changing candle" (non-final) parity check: perturb the close of a
    // bar that follows the series and process it WITHOUT committing (IsFinal=false), so the indicator
    // yields a preview off the same committed state each time — mirrors a live last candle redrawing.
    var lastClose = input[n - 1].ClosePrice;
    var probeTime = t0.AddMinutes(n);
    var probes = new List<TimeFrameCandleMessage>();
    foreach (var d in new[] { 0m, 3m, -3m, 12m, -12m })
    {
        var pc = lastClose + d;
        probes.Add(new TimeFrameCandleMessage
        {
            OpenTime = probeTime,
            CloseTime = probeTime,
            OpenPrice = lastClose,
            HighPrice = Math.Max(lastClose, pc) + 1m,
            LowPrice = Math.Min(lastClose, pc) - 1m,
            ClosePrice = pc,
            TotalVolume = 1500m,
            State = CandleStates.Active,
        });
    }

    var outInds = new List<object>();
    foreach (var e in provider.All)
    {
        if (e.Indicator is null || e.IsObsolete) continue;
        IIndicator ind;
        try { ind = (IIndicator)Activator.CreateInstance(e.Indicator); }
        catch { continue; }

        var pdict = new Dictionary<string, object>();
        foreach (var p in e.Indicator.GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            if (p.GetSetMethod() is null || excluded.Contains(p.Name)) continue;
            var u = Nullable.GetUnderlyingType(p.PropertyType) ?? p.PropertyType;
            if (u != typeof(int) && u != typeof(long) && u != typeof(decimal) && u != typeof(double) && u != typeof(float) && u != typeof(bool))
                continue;
            try { pdict[p.Name] = p.GetValue(ind); } catch { }
        }

        if (ind is IComplexIndicator ci && ci.InnerIndicators.Count > 0)
        {
            // Multi-line indicator: emit one per-bar value array per inner indicator
            // (gated on the outer IsFormed, matching the single-output convention).
            var inners = ci.InnerIndicators.ToList();
            var lines = new List<List<object>>();
            for (var li = 0; li < inners.Count; li++) lines.Add(new List<object>());
            var okc = true;
            try
            {
                foreach (var candle in input)
                {
                    var res = ind.Process(new CandleIndicatorValue(ind, candle));
                    var cv = res as IComplexIndicatorValue;
                    for (var li = 0; li < inners.Count; li++)
                    {
                        object val = null;
                        // Gate each line on its OWN inner indicator's IsFormed (not the outer's),
                        // so per-line warm-up matches the client's independent per-line nulling.
                        if (inners[li].IsFormed && cv != null && cv.InnerValues.TryGetValue(inners[li], out var iv) && !iv.IsEmpty)
                        {
                            try { val = iv.GetValue<decimal>(); } catch { }
                        }
                        lines[li].Add(val);
                    }
                }
            }
            catch { okc = false; }

            if (okc)
                outInds.Add(new { kind = e.Indicator.Name, @params = pdict, lines, lineNames = inners.Select(x => x.Name).ToList() });
            else
                outInds.Add(new { kind = e.Indicator.Name, @params = pdict, complex = true });
            continue;
        }

        var values = new List<object>();
        var previews = new List<object>();
        var ok = true;
        try
        {
            foreach (var candle in input)
            {
                var res = ind.Process(new CandleIndicatorValue(ind, candle));
                values.Add(res.IsEmpty || !ind.IsFormed ? null : res.GetValue<decimal>());
            }

            // Non-final previews: each probe is processed with IsFinal=false, which must NOT commit,
            // so every probe reads off the same post-series state (final candle still "forming").
            foreach (var probe in probes)
            {
                var res = ind.Process(new CandleIndicatorValue(ind, probe) { IsFinal = false });
                previews.Add(res.IsEmpty || !ind.IsFormed ? null : res.GetValue<decimal>());
            }
        }
        catch { ok = false; }
        if (!ok) continue;

        outInds.Add(new { kind = e.Indicator.Name, @params = pdict, values, previews });
    }

    var payload = new
    {
        input = input.ConvertAll(cd => new
        {
            t = new DateTimeOffset(cd.OpenTime).ToUnixTimeSeconds(),
            o = cd.OpenPrice,
            h = cd.HighPrice,
            l = cd.LowPrice,
            c = cd.ClosePrice,
            v = cd.TotalVolume,
        }),
        probes = probes.ConvertAll(cd => new
        {
            o = cd.OpenPrice,
            h = cd.HighPrice,
            l = cd.LowPrice,
            c = cd.ClosePrice,
            v = cd.TotalVolume,
        }),
        indicators = outInds,
    };
    Console.WriteLine(JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = false }));
    return;
}

var rows = new List<object>();
foreach (var e in provider.All)
{
    if (e.Indicator is null || e.IsObsolete) continue;
    IIndicator probe;
    try { probe = (IIndicator)Activator.CreateInstance(e.Indicator); }
    catch { continue; }

    var ps = new List<object>();
    foreach (var p in e.Indicator.GetProperties(BindingFlags.Public | BindingFlags.Instance))
    {
        if (p.GetSetMethod() is null || excluded.Contains(p.Name)) continue;
        var u = Nullable.GetUnderlyingType(p.PropertyType) ?? p.PropertyType;
        string type = (u == typeof(int) || u == typeof(long)) ? "int"
            : (u == typeof(decimal) || u == typeof(double) || u == typeof(float)) ? "decimal"
            : (u == typeof(bool)) ? "bool" : null;
        if (type is null) continue;
        object def = null;
        try { def = p.GetValue(probe); } catch { }
        ps.Add(new { key = p.Name, type, def });
    }

    string pane = probe.Measure switch
    {
        IndicatorMeasures.Percent => "separate",
        IndicatorMeasures.MinusOnePlusOne => "separate",
        _ => "main",
    };
    int outputs = probe is IComplexIndicator ci && ci.InnerIndicators.Count > 0 ? ci.InnerIndicators.Count : 1;

    rows.Add(new { kind = e.Indicator.Name, pane, measure = probe.Measure.ToString(), outputs, @params = ps });
}

rows.Sort((a, b) => string.CompareOrdinal((string)((dynamic)a).kind, (string)((dynamic)b).kind));
Console.WriteLine(JsonSerializer.Serialize(rows, new JsonSerializerOptions { WriteIndented = true }));
