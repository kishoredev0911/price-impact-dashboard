import { useMemo } from "react";
import {
  BarChart, Bar, Cell, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Boxes, AlertTriangle, Trophy, Layers } from "lucide-react";
import { type CalcRow, type POCalc, type RmIndex } from "@/lib/pricing";

const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#0ea5e9", "#a855f7", "#f97316", "#14b8a6"];

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);

const lakhs = (n: number) => (n / 100000).toFixed(2);

export function DashboardTab({
  parts, rm, rows, prevQ, newQ, grnQty, alloys,
}: {
  parts: POCalc[];
  rm: RmIndex;
  rows: CalcRow[];
  prevQ: string;
  newQ: string;
  grnQty: Record<string, number>;
  alloys: string[];
}) {
  // GRN-based impact per vendor (in lakhs)
  const vendorGrnImpact = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.part.id, r]));
    const byVendor: Record<string, number> = {};
    let total = 0;
    for (const p of parts) {
      const qty = grnQty[p.id] ?? 0;
      if (!qty) continue;
      const r = byId.get(p.id);
      const old = r?.oldPrice ?? null;
      const np = r?.newPrice ?? null;
      if (old == null || np == null) continue;
      const impact = (np - old) * qty;
      const v = p.vendorCode || "—";
      byVendor[v] = (byVendor[v] ?? 0) + impact;
      total += impact;
    }
    return { byVendor, total };
  }, [parts, rows, grnQty]);

  const vendorRanking = useMemo(() => {
    const entries = Object.entries(vendorGrnImpact.byVendor)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 8);
    return entries.map(([vendor, impact]) => ({
      vendor,
      impact,
      impactLakh: parseFloat(lakhs(impact)),
      contribution: vendorGrnImpact.total !== 0
        ? (Math.abs(impact) / Math.abs(vendorGrnImpact.total) * 100).toFixed(1)
        : "0.0",
    }));
  }, [vendorGrnImpact]);

  // Alloy-based price impact (part count weighted)
  const impactByAlloy = useMemo(() => {
    const acc: Record<string, number> = {};
    const byId = new Map(rows.map((r) => [r.part.id, r]));
    for (const p of parts) {
      const qty = grnQty[p.id] ?? 0;
      if (!qty) continue;
      const r = byId.get(p.id);
      const old = r?.oldPrice ?? null;
      const np = r?.newPrice ?? null;
      if (old == null || np == null) continue;
      acc[p.alloy] = (acc[p.alloy] ?? 0) + (np - old) * qty;
    }
    return alloys
      .filter((a) => acc[a] != null)
      .map((a) => ({ alloy: a, impact: +acc[a].toFixed(2), impactLakh: parseFloat(lakhs(acc[a])) }))
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  }, [rows, parts, grnQty, alloys]);

  const highImpact = useMemo(() => {
    let count = 0;
    for (const r of rows) {
      if (r.newPrice == null || !r.part.basePrice) continue;
      const pct = Math.abs((r.newPrice - r.part.basePrice) / r.part.basePrice);
      if (pct >= 0.01) count++;
    }
    return count;
  }, [rows]);

  const totalGrnImpactLakh = parseFloat(lakhs(vendorGrnImpact.total));

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          icon={<TrendingUp className="size-4" />}
          tint="bg-indigo-100 text-indigo-700"
          label={`Total GRN Impact (${prevQ}→${newQ})`}
          value={`${totalGrnImpactLakh >= 0 ? "+" : ""}${totalGrnImpactLakh} L`}
          sub={`₹${inr(vendorGrnImpact.total)}`}
          valueClass={totalGrnImpactLakh >= 0 ? "text-emerald-600" : "text-red-600"}
        />
        <Kpi
          icon={<Boxes className="size-4" />}
          tint="bg-slate-100 text-slate-700"
          label="Parts in System"
          value={String(parts.length)}
          sub={`${Object.values(grnQty).filter(v=>v>0).length} with GRN qty`}
        />
        <Kpi
          icon={<AlertTriangle className="size-4" />}
          tint="bg-amber-100 text-amber-700"
          label="High-Impact Parts (≥1%)"
          value={String(highImpact)}
        />
        <Kpi
          icon={<Trophy className="size-4" />}
          tint="bg-purple-100 text-purple-700"
          label="Vendors with GRN"
          value={String(Object.keys(vendorGrnImpact.byVendor).length)}
        />
      </div>

      {/* Vendor impact table + alloy chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Highest Impact Vendors */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="size-4 text-amber-500" /> Highest Impact Vendors
            </CardTitle>
            <CardDescription>Ranked by GRN impact magnitude (₹ Lakhs)</CardDescription>
          </CardHeader>
          <CardContent>
            {vendorRanking.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No GRN qty entered yet. Enter quantities in the GRN Impact tab.
              </div>
            ) : (
              <div className="space-y-2">
                {vendorRanking.map(({ vendor, impactLakh, contribution }, idx) => (
                  <div key={vendor} className="flex items-center gap-3">
                    <div className="w-6 text-xs text-muted-foreground font-mono text-center">{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-mono font-medium truncate">{vendor}</span>
                        <span className={`text-xs font-semibold tabular-nums ${impactLakh >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {impactLakh >= 0 ? "+" : ""}{impactLakh} L
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${impactLakh >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                            style={{ width: `${contribution}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-10 text-right">{contribution}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alloy Impact */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="size-4 text-indigo-500" /> Impact by Alloy
            </CardTitle>
            <CardDescription>GRN-weighted ₹ impact by alloy grade (Lakhs)</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            {impactByAlloy.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No GRN qty entered yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={impactByAlloy} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="alloy" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}L`} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [`${v} L`, "Impact"]} />
                  <Bar dataKey="impactLakh" radius={[4, 4, 0, 0]}>
                    {impactByAlloy.map((d, i) => (
                      <Cell key={i} fill={d.impactLakh >= 0 ? COLORS[i % COLORS.length] : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Vendor pie chart */}
      {vendorRanking.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Vendor Contribution to Total Impact</CardTitle>
            <CardDescription>Share of total GRN price impact by vendor code</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={vendorRanking.map(v => ({ name: v.vendor, value: Math.abs(v.impactLakh) }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(1)}%)`}
                  labelLine={true}
                >
                  {vendorRanking.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v} L`, "Impact"]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* RM Price Trend (no chart needed — just a summary table) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">RM Rates — {prevQ} → {newQ}</CardTitle>
          <CardDescription>Current quarter vs. previous quarter prices</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted text-muted-foreground text-left">
                <th className="px-3 py-2">Alloy / Grade</th>
                <th className="px-3 py-2 text-right">{prevQ}</th>
                <th className="px-3 py-2 text-right">{newQ}</th>
                <th className="px-3 py-2 text-right">Δ ₹</th>
              </tr>
            </thead>
            <tbody>
              {[...alloys, "SCRAP"].map((a, i) => {
                const prev = rm[a]?.[prevQ] ?? null;
                const nxt = rm[a]?.[newQ] ?? null;
                const delta = prev != null && nxt != null ? nxt - prev : null;
                return (
                  <tr key={a} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/30"}`}>
                    <td className="px-3 py-1.5 font-medium">{a}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{prev != null ? prev.toFixed(2) : "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{nxt != null ? nxt.toFixed(2) : "—"}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${delta == null ? "" : delta >= 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {delta != null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  icon, tint, label, value, sub, valueClass,
}: { icon: React.ReactNode; tint: string; label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <div className={`size-7 rounded-md flex items-center justify-center ${tint}`}>{icon}</div>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className={`mt-2 text-2xl font-semibold tabular-nums ${valueClass ?? ""}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}
