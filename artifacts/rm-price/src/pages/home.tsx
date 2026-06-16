import { useMemo, useRef, useState } from "react";
import {
  calcAll, cc, computeHistory, deriveSeries, derivedScrapWt,
  findInconsistencies, inconsistentIds, isManualAsCast, computeAutoScrap,
  type Part, type RmIndex,
} from "@/lib/pricing";
import {
  downloadCalcExport, downloadHistoryExport, downloadPartsExport, downloadPartsTemplate,
  downloadRmTemplate, parsePartsExcel, parseRmExcel,
} from "@/lib/excel";
import { SEED_PARTS, SEED_RM_INDEX, DEFAULT_QUARTERS, DEFAULT_ALLOYS } from "@/lib/seed-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Trash2, Download, Upload, Plus, Calculator, Factory, FileSpreadsheet,
  History, AlertTriangle, Settings, Pencil, Check, X,
} from "lucide-react";
import { LayoutDashboard, GitBranch, PackageCheck } from "lucide-react";
import { DashboardTab } from "@/components/dashboard-tab";
import { GrnTab } from "@/components/grn-tab";

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={`px-2 py-2 border ${right ? "text-right" : "text-left"} whitespace-nowrap`}>{children}</th>;
}
function Td({ children, className = "", right }: { children?: React.ReactNode; className?: string; right?: boolean }) {
  return <td className={`px-2 py-1.5 border ${right ? "text-right" : ""} ${className}`}>{children}</td>;
}
function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(4);
}
function signColor(n: number | null | undefined): string {
  if (n == null) return "";
  return n >= 0 ? "text-red-600" : "text-emerald-600";
}

export default function Home() {
  // Quarter & alloy config (user-editable)
  const [quarters, setQuarters] = useState<string[]>(DEFAULT_QUARTERS);
  const [alloys, setAlloys] = useState<string[]>(DEFAULT_ALLOYS);

  const RM_ROWS = useMemo(() => [...alloys, "SCRAP"], [alloys]);

  const [rm, setRm] = useState<RmIndex>(() => {
    const init: RmIndex = {};
    for (const a of [...DEFAULT_ALLOYS, "SCRAP"]) {
      init[a] = {};
      for (const q of DEFAULT_QUARTERS) {
        init[a][q] = SEED_RM_INDEX[a]?.[q] ?? null;
      }
    }
    return init;
  });
  const [parts, setParts] = useState<Part[]>(SEED_PARTS);
  const [prevQ, setPrevQ] = useState<string>(DEFAULT_QUARTERS[0]);
  const [newQ, setNewQ] = useState<string>(DEFAULT_QUARTERS[1] ?? DEFAULT_QUARTERS[0]);
  const [amendmentReason, setAmendmentReason] = useState("");
  const [grnQty, setGrnQty] = useState<Record<string, number>>({});

  // SCRAP auto-compute override: track which (alloy=SCRAP, quarter) cells the user has manually set
  const [scrapOverride, setScrapOverride] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => calcAll(parts, rm, prevQ, newQ, quarters), [parts, rm, prevQ, newQ, quarters]);
  const history = useMemo(() => {
    const out: Record<string, Record<string, number | null>> = {};
    for (const p of parts) out[p.id] = computeHistory(p, rm, quarters);
    return out;
  }, [parts, rm, quarters]);
  const inconsistencies = useMemo(() => findInconsistencies(parts), [parts]);
  const badIds = useMemo(() => inconsistentIds(parts), [parts]);

  // Auto-compute SCRAP for newQ column when SCM14 changes
  const autoScrap = useMemo(() => {
    return computeAutoScrap(rm, prevQ, newQ);
  }, [rm, prevQ, newQ]);

  function updateRm(alloy: string, q: string, v: string) {
    const isScrapNewQ = alloy === "SCRAP" && q === newQ;
    if (isScrapNewQ) {
      // If user clears, re-enable auto; otherwise mark as override
      if (v === "") {
        setScrapOverride(prev => ({ ...prev, [`${q}`]: false }));
      } else {
        setScrapOverride(prev => ({ ...prev, [`${q}`]: true }));
      }
    }
    setRm((prev) => ({ ...prev, [alloy]: { ...prev[alloy], [q]: v === "" ? null : Number(v) } }));
  }

  // Apply auto-scrap to newQ if not overridden
  const effectiveRm = useMemo(() => {
    if (autoScrap == null || scrapOverride[newQ]) return rm;
    if (rm["SCRAP"]?.[newQ] != null) return rm; // user has value
    return {
      ...rm,
      SCRAP: { ...rm["SCRAP"], [newQ]: autoScrap },
    };
  }, [rm, autoScrap, scrapOverride, newQ]);

  const effectiveRows = useMemo(() => calcAll(parts, effectiveRm, prevQ, newQ, quarters), [parts, effectiveRm, prevQ, newQ, quarters]);
  const effectiveHistory = useMemo(() => {
    const out: Record<string, Record<string, number | null>> = {};
    for (const p of parts) out[p.id] = computeHistory(p, effectiveRm, quarters);
    return out;
  }, [parts, effectiveRm, quarters]);

  function updatePart(id: string, patch: Partial<Part>) {
    setParts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function addPart() {
    setParts((p) => [...p, {
      id: `p${Date.now()}`, partNumber: "", description: "", plant: "1020",
      vendorCode: "", alloy: alloys[0] ?? "SCM 14", castWt: 0, machiningWt: 0, asCast: false,
      basePrice: 0, baseQuarter: prevQ, poNum: "",
    }]);
  }
  function removePart(id: string) { setParts((p) => p.filter((x) => x.id !== id)); }

  async function handlePartsUpload(file: File, mode: "append" | "replace") {
    const incoming = await parsePartsExcel(file, prevQ);
    setParts((prev) => (mode === "replace" ? incoming : [...prev, ...incoming]));
  }
  async function handleRmUpload(file: File) {
    const incoming = await parseRmExcel(file);
    setRm((prev) => {
      const merged: RmIndex = { ...prev };
      for (const alloy of Object.keys(incoming)) {
        merged[alloy] = { ...(merged[alloy] ?? {}), ...incoming[alloy] };
      }
      return merged;
    });
    // Also update alloys/quarters if new ones appeared
    const newAlloyList = Object.keys(incoming).filter(k => k !== "SCRAP");
    if (newAlloyList.length > 0) {
      setAlloys(prev => {
        const combined = [...prev];
        for (const a of newAlloyList) if (!combined.includes(a)) combined.push(a);
        return combined;
      });
    }
    const allQtrs = Object.values(incoming).flatMap(v => Object.keys(v ?? {}));
    const uniqueQtrs = [...new Set(allQtrs)];
    if (uniqueQtrs.length > 0) {
      setQuarters(prev => {
        const combined = [...prev];
        for (const q of uniqueQtrs) if (!combined.includes(q)) combined.push(q);
        return combined;
      });
    }
  }

  // Quarter management
  function addQuarter(name: string) {
    if (!name || quarters.includes(name)) return;
    setQuarters(prev => [...prev, name]);
    setRm(prev => {
      const next = { ...prev };
      for (const a of RM_ROWS) {
        next[a] = { ...next[a], [name]: null };
      }
      return next;
    });
  }
  function renameQuarter(oldName: string, newName: string) {
    if (!newName || newName === oldName || quarters.includes(newName)) return;
    setQuarters(prev => prev.map(q => q === oldName ? newName : q));
    // Update parts with this base quarter
    setParts(prev => prev.map(p => p.baseQuarter === oldName ? { ...p, baseQuarter: newName } : p));
    // Rename in rm
    setRm(prev => {
      const next = { ...prev };
      for (const a of Object.keys(next)) {
        if (next[a][oldName] !== undefined) {
          next[a] = { ...next[a], [newName]: next[a][oldName] };
          delete next[a][oldName];
        }
      }
      return next;
    });
    if (prevQ === oldName) setPrevQ(newName);
    if (newQ === oldName) setNewQ(newName);
  }
  function removeQuarter(name: string) {
    if (quarters.length <= 1) return;
    setQuarters(prev => prev.filter(q => q !== name));
    setRm(prev => {
      const next = { ...prev };
      for (const a of Object.keys(next)) {
        next[a] = { ...next[a] };
        delete next[a][name];
      }
      return next;
    });
    if (prevQ === name) setPrevQ(quarters.find(q => q !== name) ?? "");
    if (newQ === name) setNewQ(quarters.find(q => q !== name) ?? "");
  }

  // Alloy management
  function addAlloy(name: string) {
    if (!name || alloys.includes(name)) return;
    setAlloys(prev => [...prev, name]);
    setRm(prev => ({ ...prev, [name]: Object.fromEntries(quarters.map(q => [q, null])) }));
  }
  function renameAlloy(oldName: string, newName: string) {
    if (!newName || newName === oldName || alloys.includes(newName)) return;
    setAlloys(prev => prev.map(a => a === oldName ? newName : a));
    setParts(prev => prev.map(p => p.alloy === oldName ? { ...p, alloy: newName } : p));
    setRm(prev => {
      const next = { ...prev, [newName]: prev[oldName] ?? {} };
      delete next[oldName];
      return next;
    });
  }
  function removeAlloy(name: string) {
    if (alloys.length <= 1) return;
    setAlloys(prev => prev.filter(a => a !== name));
    setRm(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  const displayRm = effectiveRm;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="mx-auto max-w-[1700px] px-4 md:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-primary text-primary-foreground p-2">
              <Factory className="size-5" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-semibold tracking-tight">RM Price Calculator</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Aluminium Casting · Quarterly Recompute · Excel I/O</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{parts.length} parts</Badge>
            <Badge variant="secondary">{alloys.length} alloys</Badge>
            <Badge variant="secondary">{quarters.length} qtrs</Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1700px] px-4 md:px-6 py-6 space-y-5">
        {/* Amendment header */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Amendment Header</CardTitle>
            <CardDescription>Captured on every export.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <Label>Amendment Reason</Label>
              <Input
                value={amendmentReason}
                onChange={(e) => setAmendmentReason(e.target.value)}
                placeholder={`e.g. ${prevQ} → ${newQ} RM revision`}
              />
            </div>
          </CardContent>
        </Card>

        {/* Quarter selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quarter Comparison</CardTitle>
            <CardDescription>Pick base & target quarter — everything recomputes instantly.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Previous Quarter (Old Price)</Label>
              <Select value={prevQ} onValueChange={setPrevQ}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{quarters.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>New Quarter</Label>
              <Select value={newQ} onValueChange={setNewQ}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{quarters.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Export</Label>
              <Button className="w-full" onClick={() =>
                downloadCalcExport(parts, effectiveRows, displayRm, prevQ, newQ, { amendmentReason }, quarters, alloys)
              }>
                <Download className="size-4 mr-1.5" />Export Calculation Excel
              </Button>
            </div>
          </CardContent>
        </Card>

        {inconsistencies.length > 0 && (
          <Card className="border-red-300 bg-red-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-red-700 flex items-center gap-2">
                <AlertTriangle className="size-4" /> Inconsistent Part Master ({inconsistencies.length})
              </CardTitle>
              <CardDescription>Same Part # must use the same Alloy, Cast Wt and Machining Wt across plants / POs / vendors.</CardDescription>
            </CardHeader>
            <CardContent className="text-xs space-y-1">
              {inconsistencies.slice(0, 6).map((inc, i) => (
                <div key={i}>
                  <span className="font-mono font-semibold">{inc.partNumber}</span>{" "}
                  <span className="text-muted-foreground">{inc.field}</span> →{" "}
                  {inc.values.map((v, j) => (
                    <span key={j} className="mr-2">
                      <b>{String(v.value)}</b> <span className="text-muted-foreground">({v.ids.length}x)</span>
                    </span>
                  ))}
                </div>
              ))}
              {inconsistencies.length > 6 && <div className="text-muted-foreground">…and {inconsistencies.length - 6} more.</div>}
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="dashboard">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="dashboard"><LayoutDashboard className="size-4 mr-1.5" />Dashboard</TabsTrigger>
            <TabsTrigger value="results"><Calculator className="size-4 mr-1.5" />Calculated Prices</TabsTrigger>
            <TabsTrigger value="deriv"><GitBranch className="size-4 mr-1.5" />Derivation</TabsTrigger>
            <TabsTrigger value="history"><History className="size-4 mr-1.5" />Price History</TabsTrigger>
            <TabsTrigger value="grn"><PackageCheck className="size-4 mr-1.5" />GRN Impact</TabsTrigger>
            <TabsTrigger value="parts">Part Master ({parts.length})</TabsTrigger>
            <TabsTrigger value="rm"><Settings className="size-4 mr-1.5" />RM Index</TabsTrigger>
          </TabsList>

          {/* DASHBOARD */}
          <TabsContent value="dashboard" className="mt-4">
            <DashboardTab parts={parts} rm={displayRm} rows={effectiveRows} prevQ={prevQ} newQ={newQ} grnQty={grnQty} alloys={alloys} />
          </TabsContent>

          {/* CALCULATED PRICES */}
          <TabsContent value="results" className="mt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">Calculated Prices — {prevQ} → {newQ}</CardTitle>
                  <CardDescription>
                    New Price = Old Price + RM Impact − Scrap Deduction. Scrap Ded = (Prev Scrap / SCM14 Prev) × (Scrap Wt × 80%).
                  </CardDescription>
                </div>
                <Button onClick={() => downloadCalcExport(parts, effectiveRows, displayRm, prevQ, newQ, { amendmentReason }, quarters, alloys)} size="sm">
                  <Download className="size-4 mr-1.5" />Export Excel
                </Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-muted text-muted-foreground sticky top-0">
                    <tr className="text-left">
                      <Th>CC</Th><Th>Plant</Th><Th>Vendor</Th>
                      <Th>Part #</Th><Th>Description</Th><Th>Alloy</Th>
                      <Th right>Cast Wt</Th><Th right>Eff Scrap</Th>
                      <Th right>Prev RM</Th><Th right>New RM</Th>
                      <Th right>Melt Loss</Th>
                      <Th right>RM Impact</Th><Th right>Scrap Ded</Th>
                      <Th right>Old Price</Th><Th right>New Price</Th><Th right>Δ%</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {effectiveRows.map((r) => {
                      const old = r.oldPrice ?? null;
                      const pct = r.newPrice != null && old
                        ? ((r.newPrice - old) / old) * 100 : null;
                      return (
                        <tr key={r.part.id} className="border-t hover:bg-muted/40">
                          <Td className="font-mono whitespace-nowrap">{cc(r.part)}</Td>
                          <Td className="font-mono">{r.part.plant}</Td>
                          <Td className="font-mono">{r.part.vendorCode ?? ""}</Td>
                          <Td className="font-mono whitespace-nowrap">{r.part.partNumber}</Td>
                          <Td><div className="max-w-[180px] truncate">{r.part.description}</div>
                            {r.note && <div className="text-[10px] text-destructive">{r.note}</div>}</Td>
                          <Td><Badge variant="outline" className="text-[10px]">{r.part.alloy}</Badge></Td>
                          <Td right>{r.part.castWt.toFixed(3)}</Td>
                          <Td right>{r.effectiveScrapWt.toFixed(3)}</Td>
                          <Td right>{fmt(r.prevBase)}</Td><Td right>{fmt(r.newBase)}</Td>
                          <Td right>{r.meltingLoss.toFixed(3)}</Td>
                          <Td right className={signColor(r.rmImpact)}>{fmt(r.rmImpact)}</Td>
                          <Td right>{fmt(r.scrapDeduction)}</Td>
                          <Td right>{old != null ? `₹${old.toFixed(2)}` : "—"}</Td>
                          <Td right className="font-semibold">{r.newPrice != null ? `₹${r.newPrice.toFixed(2)}` : "—"}</Td>
                          <Td right className={signColor(pct)}>{pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PRICE DERIVATION */}
          <TabsContent value="deriv" className="mt-4">
            <DerivationTab parts={parts} rm={displayRm} grnQty={grnQty} quarters={quarters} />
          </TabsContent>

          {/* PRICE HISTORY */}
          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">Price History — all parts × all quarters</CardTitle>
                  <CardDescription>Chain-computed from each part's base quarter using the RM Index.</CardDescription>
                </div>
                <Button size="sm" onClick={() => downloadHistoryExport(parts, effectiveHistory, quarters)}>
                  <Download className="size-4 mr-1.5" />Export Excel
                </Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="text-xs border-collapse">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <Th>CC</Th><Th>Part #</Th><Th>Description</Th><Th>Alloy</Th>
                      {quarters.map((q) => (
                        <Th key={q} right>
                          <span className={q === prevQ ? "text-primary font-semibold" : q === newQ ? "text-blue-600 font-semibold" : ""}>{q}</span>
                        </Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((p) => (
                      <tr key={p.id} className="border-t">
                        <Td className="font-mono whitespace-nowrap">{cc(p)}</Td>
                        <Td className="font-mono whitespace-nowrap">{p.partNumber}</Td>
                        <Td><div className="max-w-[180px] truncate">{p.description}</div></Td>
                        <Td><Badge variant="outline" className="text-[10px]">{p.alloy}</Badge></Td>
                        {quarters.map((q) => {
                          const v = effectiveHistory[p.id]?.[q];
                          const isBase = q === p.baseQuarter;
                          return (
                            <Td key={q} right className={`tabular-nums ${isBase ? "font-semibold underline" : ""}`}>
                              {v != null ? v.toFixed(2) : "—"}
                            </Td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* GRN IMPACT */}
          <TabsContent value="grn" className="mt-4">
            <GrnTab parts={parts} rows={effectiveRows} grnQty={grnQty} setGrnQty={setGrnQty} prevQ={prevQ} newQ={newQ} />
          </TabsContent>

          {/* PART MASTER */}
          <TabsContent value="parts" className="mt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">Part Master</CardTitle>
                  <CardDescription>
                    Parts ending in <b>0</b> or <b>6</b> are forced AS CAST (no scrap deduction).
                  </CardDescription>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={downloadPartsTemplate}>
                    <FileSpreadsheet className="size-4 mr-1.5" />Template
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPartsExport(parts)}>
                    <Download className="size-4 mr-1.5" />Export
                  </Button>
                  <UploadButton label="Append" accept=".xlsx,.xls" onFile={(f) => handlePartsUpload(f, "append")} />
                  <UploadButton label="Replace All" variant="destructive" accept=".xlsx,.xls" onFile={(f) => handlePartsUpload(f, "replace")} />
                  <Button onClick={addPart} size="sm"><Plus className="size-4 mr-1.5" />Add</Button>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-muted text-muted-foreground">
                    <tr className="text-left">
                      <Th>Part #</Th><Th>Description</Th><Th>Plant</Th><Th>Vendor</Th>
                      <Th>PO Num</Th><Th>Alloy</Th>
                      <Th right>Cast Wt</Th><Th right>Mach Wt</Th><Th right>Scrap Wt</Th>
                      <Th>AS CAST</Th><Th right>SAP Price</Th><Th>Base Q</Th><Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((p) => {
                      const manual = isManualAsCast(p);
                      const auto06 = /[06]$/.test(p.partNumber);
                      const bad = badIds.has(p.id);
                      return (
                        <tr key={p.id} className={`border-t ${bad ? "bg-red-100/70" : manual ? "bg-amber-100/70" : ""}`}>
                          <Td><Input className="h-7 font-mono w-28" value={p.partNumber} onChange={(e) => updatePart(p.id, { partNumber: e.target.value })} /></Td>
                          <Td><Input className="h-7 w-40" value={p.description} onChange={(e) => updatePart(p.id, { description: e.target.value })} /></Td>
                          <Td><Input className="h-7 w-16" value={p.plant} onChange={(e) => updatePart(p.id, { plant: e.target.value })} /></Td>
                          <Td><Input className="h-7 w-20" value={p.vendorCode ?? ""} onChange={(e) => updatePart(p.id, { vendorCode: e.target.value })} /></Td>
                          <Td><Input className="h-7 w-20" value={p.poNum ?? ""} onChange={(e) => updatePart(p.id, { poNum: e.target.value })} /></Td>
                          <Td>
                            <Select value={p.alloy} onValueChange={(v) => updatePart(p.id, { alloy: v })}>
                              <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                              <SelectContent>{alloys.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                            </Select>
                          </Td>
                          <Td right><Input className="h-7 w-20 text-right" type="number" step="0.001" value={p.castWt} onChange={(e) => updatePart(p.id, { castWt: Number(e.target.value) })} /></Td>
                          <Td right><Input className="h-7 w-20 text-right" type="number" step="0.001" value={p.machiningWt} onChange={(e) => updatePart(p.id, { machiningWt: Number(e.target.value) })} /></Td>
                          <Td right className="tabular-nums text-muted-foreground">{derivedScrapWt(p).toFixed(3)}</Td>
                          <Td>
                            <div className="flex items-center gap-1.5">
                              <Checkbox
                                checked={auto06 ? true : p.asCast}
                                disabled={auto06}
                                onCheckedChange={(c) => updatePart(p.id, { asCast: !!c })}
                              />
                              {auto06 && <Badge variant="secondary" className="text-[9px]">auto</Badge>}
                              {manual && <AlertTriangle className="size-3.5 text-amber-700" />}
                            </div>
                          </Td>
                          <Td right><Input className="h-7 w-24 text-right" type="number" step="0.01" value={p.basePrice} onChange={(e) => updatePart(p.id, { basePrice: Number(e.target.value) })} /></Td>
                          <Td>
                            <Select value={p.baseQuarter} onValueChange={(v) => updatePart(p.id, { baseQuarter: v })}>
                              <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                              <SelectContent>{quarters.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                            </Select>
                          </Td>
                          <Td>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removePart(p.id)}>
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* RM INDEX */}
          <TabsContent value="rm" className="mt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">RM Price Index</CardTitle>
                  <CardDescription>
                    Edit alloy rows and quarter columns. SCRAP in new quarter is auto-calculated:
                    <span className="font-semibold text-indigo-600 ml-1">(Old Scrap / Old SCM14) × New SCM14</span>
                    {autoScrap != null && displayRm["SCRAP"]?.[newQ] == null && (
                      <span className="ml-2 text-emerald-600 font-semibold">→ Auto: {autoScrap.toFixed(2)}</span>
                    )}
                  </CardDescription>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => downloadRmTemplate(undefined, alloys, quarters)}>
                    <FileSpreadsheet className="size-4 mr-1.5" />Empty Template
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadRmTemplate(displayRm, alloys, quarters)}>
                    <Download className="size-4 mr-1.5" />Export Current
                  </Button>
                  <UploadButton label="Bulk Upload" accept=".xlsx,.xls" onFile={handleRmUpload} />
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted text-muted-foreground">
                      <th className="px-2 py-2 text-left border sticky left-0 bg-muted z-10 min-w-[140px]">
                        <div className="flex items-center justify-between gap-1">
                          <span>Alloy / Grade</span>
                          <AddItemButton
                            placeholder="New alloy name"
                            onAdd={addAlloy}
                            trigger={<Button size="icon" variant="ghost" className="h-6 w-6"><Plus className="size-3" /></Button>}
                          />
                        </div>
                      </th>
                      {quarters.map((q) => (
                        <th key={q} className="px-2 py-2 text-center border min-w-[110px]">
                          <EditableLabel
                            value={q}
                            onSave={(v) => renameQuarter(q, v)}
                            onRemove={() => removeQuarter(q)}
                            highlight={q === prevQ ? "primary" : q === newQ ? "blue" : undefined}
                          />
                        </th>
                      ))}
                      <th className="px-2 py-2 border min-w-[80px]">
                        <AddItemButton
                          placeholder="New quarter"
                          onAdd={addQuarter}
                          trigger={<Button size="sm" variant="outline" className="h-7 text-xs"><Plus className="size-3 mr-1" />Quarter</Button>}
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {RM_ROWS.map((a) => {
                      const isScrap = a === "SCRAP";
                      return (
                        <tr key={a} className={`border-t ${isScrap ? "bg-yellow-50/60" : ""}`}>
                          <td className="px-2 py-1.5 border sticky left-0 bg-white z-10">
                            <div className="flex items-center justify-between gap-1">
                              {isScrap ? (
                                <span className="font-semibold text-amber-700">SCRAP</span>
                              ) : (
                                <EditableLabel
                                  value={a}
                                  onSave={(v) => renameAlloy(a, v)}
                                  onRemove={() => removeAlloy(a)}
                                />
                              )}
                            </div>
                          </td>
                          {quarters.map((q) => {
                            const isScrapNewQ = isScrap && q === newQ;
                            const isAutoValue = isScrapNewQ && autoScrap != null && displayRm["SCRAP"]?.[newQ] == null && rm["SCRAP"]?.[q] == null;
                            const val = isAutoValue ? autoScrap : (displayRm[a]?.[q] ?? null);
                            const isHighlighted = q === prevQ || q === newQ;
                            return (
                              <td key={q} className={`border px-2 py-1 ${isHighlighted ? "bg-primary/5" : ""}`}>
                                <div className="relative">
                                  <Input
                                    className={`h-7 w-full text-right text-xs ${isAutoValue ? "text-emerald-700 font-semibold bg-emerald-50" : ""}`}
                                    type="number"
                                    step="0.01"
                                    value={val ?? ""}
                                    placeholder={isAutoValue ? `Auto: ${autoScrap?.toFixed(2)}` : ""}
                                    onChange={(e) => updateRm(a, q, e.target.value)}
                                  />
                                  {isScrapNewQ && (
                                    <div className="text-[9px] text-muted-foreground mt-0.5 text-center">
                                      {isAutoValue
                                        ? "auto-calc"
                                        : scrapOverride[q]
                                          ? "manual"
                                          : "enter or auto"}
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                          <td className="border px-2 py-1" />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ─── Derivation Tab ───────────────────────────────────────────────────────────
function DerivationTab({ parts, rm, grnQty, quarters }: {
  parts: Part[]; rm: RmIndex; grnQty: Record<string, number>; quarters: string[];
}) {
  const [selectedId, setSelectedId] = useState(parts[0]?.id ?? "");
  const part = parts.find((p) => p.id === selectedId);
  const steps = useMemo(() => part ? deriveSeries(part, rm, quarters) : [], [part, rm, quarters]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Price Derivation — step by step</CardTitle>
          <CardDescription>Chain from base quarter to present using the RM Index.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-full max-w-md"><SelectValue placeholder="Select a part" /></SelectTrigger>
            <SelectContent>
              {parts.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.partNumber} — {p.description} (Plant {p.plant})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {part && (
            <div className="text-xs text-muted-foreground">
              Base: <b>₹{part.basePrice.toFixed(2)}</b> at <b>{part.baseQuarter}</b> · Alloy: <b>{part.alloy}</b> ·
              Cast: <b>{part.castWt}kg</b> · Vendor: <b>{part.vendorCode || "—"}</b> ·
              GRN Qty: <b>{grnQty[part.id] ?? 0}</b>
            </div>
          )}

          {steps.length === 0 && part && (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No RM data to chain from {part.baseQuarter}.
            </div>
          )}

          {steps.length > 0 && (
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse w-full">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <Th>From</Th><Th>To</Th>
                    <Th right>Old Price</Th><Th right>Prev RM</Th><Th right>New RM</Th>
                    <Th right>Melt Loss</Th><Th right>RM Impact</Th>
                    <Th right>Scrap Ded</Th><Th right>New Price</Th><Th>Note</Th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((s, i) => (
                    <tr key={i} className="border-t">
                      <Td>{s.fromQ}</Td><Td className="font-semibold">{s.toQ}</Td>
                      <Td right>₹{s.oldPrice.toFixed(2)}</Td>
                      <Td right>{s.prevBase?.toFixed(2) ?? "—"}</Td>
                      <Td right>{s.newBase?.toFixed(2) ?? "—"}</Td>
                      <Td right>{s.meltingLoss.toFixed(4)}</Td>
                      <Td right className={signColor(s.rmImpact)}>{s.rmImpact?.toFixed(4) ?? "—"}</Td>
                      <Td right>{s.scrapDeduction.toFixed(4)}</Td>
                      <Td right className="font-semibold">{s.newPrice != null ? `₹${s.newPrice.toFixed(2)}` : "—"}</Td>
                      <Td className="text-destructive text-[10px]">{s.note ?? ""}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function UploadButton({
  label, accept, onFile, variant = "outline",
}: { label: string; accept: string; onFile: (f: File) => void; variant?: "outline" | "destructive" }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => ref.current?.click()}>
        <Upload className="size-4 mr-1.5" />{label}
      </Button>
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]; if (f) onFile(f);
          if (ref.current) ref.current.value = "";
        }} />
    </>
  );
}

function AddItemButton({
  placeholder, onAdd, trigger,
}: { placeholder: string; onAdd: (name: string) => void; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add {placeholder.includes("quarter") ? "Quarter" : "Alloy"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder={placeholder}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { onAdd(val); setVal(""); setOpen(false); } }}
          />
          <Button className="w-full" onClick={() => { onAdd(val); setVal(""); setOpen(false); }}>Add</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditableLabel({
  value, onSave, onRemove, highlight,
}: { value: string; onSave: (v: string) => void; onRemove: () => void; highlight?: "primary" | "blue" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <div className="flex items-center gap-0.5">
        <Input
          className="h-6 text-xs w-24 px-1"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onSave(draft); setEditing(false); }
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
        />
        <button className="text-emerald-600 hover:text-emerald-700" onClick={() => { onSave(draft); setEditing(false); }}><Check className="size-3" /></button>
        <button className="text-muted-foreground hover:text-foreground" onClick={() => { setDraft(value); setEditing(false); }}><X className="size-3" /></button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 group">
      <span className={
        highlight === "primary" ? "text-primary font-semibold" :
        highlight === "blue" ? "text-blue-600 font-semibold" : ""
      }>{value}</span>
      <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground" onClick={() => { setDraft(value); setEditing(true); }}>
        <Pencil className="size-3" />
      </button>
      <button className="opacity-0 group-hover:opacity-100 text-destructive/60 hover:text-destructive" onClick={onRemove}>
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}
