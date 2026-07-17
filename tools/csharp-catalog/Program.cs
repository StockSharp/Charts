// Dumps the StockSharp indicator catalog (kind, pane, measure, output count, param keys/types/
// defaults) to stdout as JSON. Referenced live by the Charts parity test — no committed fixture.
using System;
using System.Collections.Generic;
using System.Reflection;
using System.Text.Json;
using StockSharp.Algo;
using StockSharp.Algo.Indicators;

var excluded = new HashSet<string>
{
    "Id","Name","IsFormed","NumValuesToInitialize","Container","Source",
    "Measure","Style","Color","IsPreloaded","IsComplex","IsObsolete","Mode",
};

var provider = new IndicatorProvider();
provider.Init();

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
