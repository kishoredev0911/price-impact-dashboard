import { useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, FileSpreadsheet } from "lucide-react";
import { cc, type CalcRow, type Part } from "@/lib/pricing";
import { downloadGrnTemplate, parseGrnExcel, grnKey } from "@/lib/excel";

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);

const lakhs = (n: number) => (n / 100000).toFixed(4);

export function GrnTab({
  parts, rows, grnQty, setGrnQty, prevQ, newQ,
}: {
  parts: Part[]; rows: CalcRow[];
  grnQty: Record<string, number>;
  setGrnQty: (next: Record<string, number>) => void;
  prevQ: string; newQ: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.part.id, r])), [rows]);

  const sorted = useMemo(() =>
    parts.slice().sort((a,b) =>
      (a.vendorCode ?? "").localeCompare(b.vendorCode ?? "") ||
      (a.poNum ?? "").localeCompare(b.poNum ?? "") ||
      (a.plant ?? "").localeCompare(b.plant ?? "") ||
      a.partNumber.localeCompare(b.partNumber)
    ),
  [parts]);

  const computed = useMemo(() => sorted.map((p) => {
    const r = rowById.get(p.id);
    const old = r?.oldPrice ?? null;
    const np = r?.newPrice ?? null;
    const delta = old != null && np != null ? np - old : null;
    const qty = grnQty[p.id] ?? 0;
    // Impact only if GRN qty is entered
    const impact = delta != null && qty > 0 ? delta * qty : null;
    const impactLakh = impact != null ? parseFloat(lakhs(impact)) : null;
    return { p, r, old, np, delta, qty, impact, impactLakh };
  }), [sorted, rowById, grnQty]);

  const totals = useMemo(() => {
    const byVendor: Record<string, number> = {};
    const byAlloy: Record<string, number> = {};
    let total = 0;
    for (const c of computed) {
      if (c.impact == null) continue;
      total += c.impact;
      const v = c.p.vendorCode || "—";
      byVendor[v] = (byVendor[v] ?? 0) + c.impact;
      byAlloy[c.p.alloy] = (byAlloy[c.p.alloy] ?? 0) + c.impact;
    }
    return { byVendor, byAlloy, total };
  }, [computed]);

  function setQty(id: string, v: string) {
    const n = Number(v);
    const next = { ...grnQty };
    if (!v || Number.isNaN(n) || n === 0) delete next[id];
    else next[id] = n;
    setGrnQty(next);
  }

  async function onUpload(file: File) {
    const map = await parseGrnExcel(file);
    const next: Record<string, number> = { ...grnQty };
    for (const p of parts) {
      const k = grnKey(p);
      if (map[k] != null) next[p.id] = map[k];
    }
    setGrnQty(next);
  }

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiBox label="Total GRN Impact (₹)" value={`₹${inr(totals.total)}`} highlight />
        <KpiBox label="Total GRN Impact (Lakhs)" value={`${parseFloat(lakhs(totals.total)).toFixed(2)} L`} highlight />
        <KpiBox label="Vendors with GRN" value={String(Object.keys(totals.byVendor).length)} />
        <KpiBox label="Alloys with GRN" value={String(Object.keys(totals.byAlloy).length)} />
      </div>

      {/* Group totals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <GroupCard title="Impact by Vendor (₹ Lakhs)" data={totals.byVendor} />
        <GroupCard title="Impact by Alloy (₹ Lakhs)" data={totals.byAlloy} />
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">GRN Impact — {prevQ} → {newQ}</CardTitle>
            <CardDescription>
              Impact = (New Price − Old Price) × GRN Qty. Enter GRN qty to compute impact.
            </CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline"
              onClick={() => downloadGrnTemplate(parts, rows, grnQty, prevQ, newQ)}>
              <FileSpreadsheet className="size-4 mr-1.5" />Template
            </Button>
            <Button size="sm" variant="outline"
              onClick={() => downloadGrnTemplate(parts, rows, grnQty, prevQ, newQ)}>
              <Download className="size-4 mr-1.5" />Export
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4 mr-1.5" />Upload GRN Qty
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]; if (f) onUpload(f);
                if (fileRef.current) fileRef.current.value = "";
              }} />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-muted text-muted-foreground sticky top-0">
              <tr className="text-left">
                <th className="px-2 py-2">Vendor</th>
                <th className="px-2 py-2">PO Num</th>
                <th className="px-2 py-2">Plant</th>
                <th className="px-2 py-2">Part #</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2">Alloy</th>
                <th className="px-2 py-2 text-right">Old (₹)</th>
                <th className="px-2 py-2 text-right">New (₹)</th>
                <th className="px-2 py-2 text-right">Δ ₹</th>
                <th className="px-2 py-2 text-right">GRN Qty</th>
                <th className="px-2 py-2 text-right">Impact (₹)</th>
                <th className="px-2 py-2 text-right">Impact (L)</th>
              </tr>
            </thead>
            <tbody>
              {computed.map(({ p, old, np, delta, qty, impact, impactLakh }) => (
                <tr key={p.id} className="border-t hover:bg-muted/40">
                  <td className="px-2 py-1 font-mono">{p.vendorCode || "—"}</td>
                  <td className="px-2 py-1 font-mono">{p.poNum || "—"}</td>
                  <td className="px-2 py-1 font-mono">{p.plant}</td>
                  <td className="px-2 py-1 font-mono">{p.partNumber}</td>
                  <td className="px-2 py-1"><div className="max-w-[180px] truncate">{p.description}</div></td>
                  <td className="px-2 py-1"><Badge variant="outline" className="text-[10px]">{p.alloy}</Badge></td>
                  <td className="px-2 py-1 text-right tabular-nums">{old != null ? old.toFixed(2) : "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{np != null ? np.toFixed(2) : "—"}</td>
                  <td className={`px-2 py-1 text-right tabular-nums ${delta != null ? (delta >= 0 ? "text-red-600" : "text-emerald-600") : ""}`}>
                    {delta != null ? (delta >= 0 ? "+" : "") + delta.toFixed(2) : "—"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <Input className="h-8 w-24 text-right" type="number" step="1" min="0"
                      value={qty || ""} onChange={(e) => setQty(p.id, e.target.value)} />
                  </td>
                  <td className={`px-2 py-1 text-right tabular-nums font-semibold ${impact != null ? (impact >= 0 ? "text-red-700" : "text-emerald-700") : ""}`}>
                    {impact != null && qty ? `₹${inr(impact)}` : "—"}
                  </td>
                  <td className={`px-2 py-1 text-right tabular-nums font-semibold ${impactLakh != null ? (impactLakh >= 0 ? "text-red-700" : "text-emerald-700") : ""}`}>
                    {impactLakh != null && qty ? `${impactLakh.toFixed(4)} L` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/40 font-semibold">
                <td colSpan={10} className="px-2 py-2 text-right">Total GRN Impact</td>
                <td className="px-2 py-2 text-right tabular-nums">₹{inr(totals.total)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{parseFloat(lakhs(totals.total)).toFixed(4)} L</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function GroupCard({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a,b) => Math.abs(b[1]) - Math.abs(a[1]));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1.5">
        {entries.length === 0 && <div className="text-xs text-muted-foreground">No GRN qty entered yet.</div>}
        {entries.map(([k, v]) => (
          <div key={k} className="flex justify-between text-xs gap-2">
            <span className="font-mono truncate">{k}</span>
            <div className="flex gap-3 tabular-nums font-semibold shrink-0">
              <span className={v >= 0 ? "text-red-700" : "text-emerald-700"}>
                ₹{new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v)}
              </span>
              <span className={v >= 0 ? "text-red-600" : "text-emerald-600"}>
                {parseFloat((v / 100000).toFixed(2)).toFixed(2)} L
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
