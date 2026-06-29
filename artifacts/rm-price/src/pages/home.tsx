import { useMemo, useRef, useState, useEffect } from "react";
import {
  calcAll, cc, computeHistory, deriveSeries, derivedScrapWt,
  findInconsistencies, inconsistentIds, isManualAsCast, computeAutoScrap,
  type Part, type PO, type Vendor, type Material, type POCalc, type RmIndex,
} from "@/lib/pricing";
import { supabase } from "@/lib/supabase";
import {
  downloadCalcExport, downloadHistoryExport, downloadPartsExport, downloadPartsTemplate,
  downloadRmTemplate, downloadPOsExport, parsePartsExcel, parseRmExcel,
} from "@/lib/excel";
import {
  SEED_PARTS, SEED_POS, SEED_VENDORS, SEED_MATERIALS, SEED_RM_INDEX,
  DEFAULT_QUARTERS, DEFAULT_ALLOYS,
} from "@/lib/seed-data";
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
import { PriceTicker } from "@/components/price-ticker";

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
  const isSupabaseConfigured = Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  );

  // Fallback states for Sandbox Mode
  const [quartersRaw, setQuartersRaw] = useState<string[]>(DEFAULT_QUARTERS);
  const [alloysRaw, setAlloysRaw] = useState<string[]>(DEFAULT_ALLOYS);
  const [rmRaw, setRmRaw] = useState<RmIndex>(() => {
    const init: RmIndex = {};
    for (const a of [...DEFAULT_ALLOYS, "SCRAP"]) {
      init[a] = {};
      for (const q of DEFAULT_QUARTERS) {
        init[a][q] = SEED_RM_INDEX[a]?.[q] ?? null;
      }
    }
    return init;
  });

  const [partsRaw, setPartsRaw] = useState<Part[]>(SEED_PARTS);
  const [posRaw, setPosRaw] = useState<PO[]>(SEED_POS);
  const [vendorsRaw, setVendorsRaw] = useState<Vendor[]>(SEED_VENDORS);
  const [materialsRaw, setMaterialsRaw] = useState<Material[]>(SEED_MATERIALS);

  const [prevQRaw, setPrevQRaw] = useState<string>(DEFAULT_QUARTERS[0]);
  const [newQRaw, setNewQRaw] = useState<string>(DEFAULT_QUARTERS[1] ?? DEFAULT_QUARTERS[0]);
  const [amendmentReasonRaw, setAmendmentReasonRaw] = useState("");
  const [scrapOverrideRaw, setScrapOverrideRaw] = useState<Record<string, boolean>>({});

  // DB Sync states
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [dbError, setDbError] = useState<string | null>(null);

  const [quartersDb, setQuartersDb] = useState<string[]>([]);
  const [alloysDb, setAlloysDb] = useState<string[]>([]);
  const [rmDb, setRmDb] = useState<RmIndex>({});

  const [partsDb, setPartsDb] = useState<Part[]>([]);
  const [posDb, setPosDb] = useState<PO[]>([]);
  const [vendorsDb, setVendorsDb] = useState<Vendor[]>([]);
  const [materialsDb, setMaterialsDb] = useState<Material[]>([]);

  const [prevQDb, setPrevQDb] = useState<string>("");
  const [newQDb, setNewQDb] = useState<string>("");
  const [amendmentReasonDb, setAmendmentReasonDb] = useState("");
  const [scrapOverrideDb, setScrapOverrideDb] = useState<Record<string, boolean>>({});

  // Unified getters
  const quarters = isSupabaseConfigured ? quartersDb : quartersRaw;
  const alloys = isSupabaseConfigured ? alloysDb : alloysRaw;
  const rm = isSupabaseConfigured ? rmDb : rmRaw;

  const partsMaster = isSupabaseConfigured ? partsDb : partsRaw;
  const posMaster = isSupabaseConfigured ? posDb : posRaw;
  const vendorsMaster = isSupabaseConfigured ? vendorsDb : vendorsRaw;
  const materialsMaster = isSupabaseConfigured ? materialsDb : materialsRaw;

  const prevQ = isSupabaseConfigured ? prevQDb : prevQRaw;
  const newQ = isSupabaseConfigured ? newQDb : newQRaw;
  const amendmentReason = isSupabaseConfigured ? amendmentReasonDb : amendmentReasonRaw;
  const scrapOverride = isSupabaseConfigured ? scrapOverrideDb : scrapOverrideRaw;

  // Unified setters
  const setQuarters = isSupabaseConfigured ? setQuartersDb : setQuartersRaw;
  const setAlloys = isSupabaseConfigured ? setAlloysDb : setAlloysRaw;
  const setRm = isSupabaseConfigured ? setRmDb : setRmRaw;

  const setPartsMaster = isSupabaseConfigured ? setPartsDb : setPartsRaw;
  const setPosMaster = isSupabaseConfigured ? setPosDb : setPosRaw;
  const setVendorsMaster = isSupabaseConfigured ? setVendorsDb : setVendorsRaw;
  const setMaterialsMaster = isSupabaseConfigured ? setMaterialsDb : setMaterialsRaw;

  const setPrevQ = isSupabaseConfigured ? setPrevQDb : setPrevQRaw;
  const setNewQ = isSupabaseConfigured ? setNewQDb : setNewQRaw;
  const setAmendmentReason = isSupabaseConfigured ? setAmendmentReasonDb : setAmendmentReasonRaw;
  const setScrapOverride = isSupabaseConfigured ? setScrapOverrideDb : setScrapOverrideRaw;

  // Derive combined PO + physical Part fields (acts as virtual parts list for downstream calculations)
  const parts = useMemo<POCalc[]>(() => {
    return posMaster.map((po) => {
      const part = partsMaster.find((p) => p.partNumber === po.partNumber);
      return {
        ...po,
        description: part?.description ?? "Unknown Part",
        alloy: part?.alloy ?? "SCM 14",
        castWt: part?.castWt ?? 0,
        machiningWt: part?.machiningWt ?? 0,
        asCast: part?.asCast ?? false,
      };
    });
  }, [posMaster, partsMaster]);

  const RM_ROWS = useMemo(() => [...alloys, "SCRAP"], [alloys]);

  // Load from Supabase on mount
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    async function loadData() {
      try {
        setLoading(true);

        // 1. Fetch settings
        let { data: settingsData, error: settingsErr } = await supabase
          .from("settings")
          .select("*")
          .eq("id", 1)
          .single();

        if (settingsErr && settingsErr.code === "PGRST116") {
          const defaultSettings = {
            id: 1,
            quarters: DEFAULT_QUARTERS,
            alloys: DEFAULT_ALLOYS,
            prev_q: DEFAULT_QUARTERS[0],
            new_q: DEFAULT_QUARTERS[1] ?? DEFAULT_QUARTERS[0],
            amendment_reason: "",
            scrap_override: {},
          };
          const { data: inserted, error: insertErr } = await supabase
            .from("settings")
            .insert(defaultSettings)
            .select()
            .single();

          if (insertErr) throw insertErr;
          settingsData = inserted;
        } else if (settingsErr) {
          throw settingsErr;
        }

        // 2. Fetch materials
        let { data: materialsData, error: materialsErr } = await supabase
          .from("materials")
          .select("*");
        if (materialsErr) throw materialsErr;
        if (!materialsData || materialsData.length === 0) {
          const { data: seeded, error: seedErr } = await supabase
            .from("materials")
            .insert(SEED_MATERIALS)
            .select();
          if (seedErr) throw seedErr;
          materialsData = seeded;
        }

        // 3. Fetch vendors
        let { data: vendorsData, error: vendorsErr } = await supabase
          .from("vendors")
          .select("*");
        if (vendorsErr) throw vendorsErr;
        if (!vendorsData || vendorsData.length === 0) {
          const { data: seeded, error: seedErr } = await supabase
            .from("vendors")
            .insert(SEED_VENDORS.map(v => ({ vendor_code: v.vendorCode, name: v.name })))
            .select();
          if (seedErr) throw seedErr;
          vendorsData = seeded;
        }

        // 4. Fetch parts
        let { data: partsData, error: partsErr } = await supabase
          .from("parts")
          .select("*")
          .order("created_at", { ascending: true });
        if (partsErr) throw partsErr;
        if (!partsData || partsData.length === 0) {
          const { data: seeded, error: seedErr } = await supabase
            .from("parts")
            .insert(SEED_PARTS.map(p => ({
              id: p.id,
              part_number: p.partNumber,
              description: p.description,
              alloy: p.alloy,
              cast_wt: p.castWt,
              machining_wt: p.machiningWt,
              as_cast: p.asCast,
            })))
            .select();
          if (seedErr) throw seedErr;
          partsData = seeded;
        }

        // 5. Fetch POs
        let { data: posData, error: posErr } = await supabase
          .from("pos")
          .select("*")
          .order("created_at", { ascending: true });
        if (posErr) throw posErr;
        if (!posData || posData.length === 0) {
          const { data: seeded, error: seedErr } = await supabase
            .from("pos")
            .insert(SEED_POS.map(po => ({
              id: po.id,
              po_num: po.poNum,
              part_number: po.partNumber,
              vendor_code: po.vendorCode,
              plant: po.plant,
              base_price: po.basePrice,
              base_quarter: po.baseQuarter,
              grn_qty: po.grnQty,
            })))
            .select();
          if (seedErr) throw seedErr;
          posData = seeded;
        }

        // 6. Fetch RM index
        let { data: rmData, error: rmErr } = await supabase
          .from("rm_index")
          .select("*");

        if (rmErr) throw rmErr;

        if (!rmData || rmData.length === 0) {
          const toInsert: any[] = [];
          for (const alloy of Object.keys(SEED_RM_INDEX)) {
            for (const quarter of Object.keys(SEED_RM_INDEX[alloy])) {
              toInsert.push({
                alloy,
                quarter,
                value: SEED_RM_INDEX[alloy][quarter],
              });
            }
          }
          const { data: seededRm, error: seedRmErr } = await supabase
            .from("rm_index")
            .insert(toInsert)
            .select();

          if (seedRmErr) throw seedRmErr;
          rmData = seededRm;
        }

        if (!active) return;

        setQuartersDb(settingsData.quarters);
        setAlloysDb(settingsData.alloys);
        setPrevQDb(settingsData.prev_q);
        setNewQDb(settingsData.new_q);
        setAmendmentReasonDb(settingsData.amendment_reason || "");
        setScrapOverrideDb(settingsData.scrap_override || {});

        setMaterialsDb(materialsData.map((m: any) => ({
          alloy: m.alloy,
          category: m.category,
          description: m.description,
        })));

        setVendorsDb(vendorsData.map((v: any) => ({
          vendorCode: v.vendor_code,
          name: v.name,
        })));

        setPartsDb(partsData.map((p: any) => ({
          id: p.id,
          partNumber: p.part_number,
          description: p.description,
          alloy: p.alloy,
          castWt: Number(p.cast_wt),
          machiningWt: Number(p.machining_wt),
          asCast: p.as_cast,
        })));

        setPosDb(posData.map((po: any) => ({
          id: po.id,
          poNum: po.po_num,
          partNumber: po.part_number,
          vendorCode: po.vendor_code,
          plant: po.plant,
          basePrice: Number(po.base_price),
          baseQuarter: po.base_quarter,
          grnQty: Number(po.grn_qty || 0),
        })));

        const parsedRm: RmIndex = {};
        for (const a of [...settingsData.alloys, "SCRAP"]) {
          parsedRm[a] = {};
          for (const q of settingsData.quarters) {
            parsedRm[a][q] = null;
          }
        }
        for (const item of rmData) {
          if (!parsedRm[item.alloy]) parsedRm[item.alloy] = {};
          parsedRm[item.alloy][item.quarter] = item.value != null ? Number(item.value) : null;
        }
        setRmDb(parsedRm);
        setDbError(null);
      } catch (err: any) {
        console.error("Error loading data from Supabase:", err);
        if (active) {
          setDbError(err.message || String(err));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, []);

  // Real-time updates subscription
  useEffect(() => {
    if (!isSupabaseConfigured || loading || dbError) return;

    const materialsChannel = supabase
      .channel("materials-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "materials" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const m = payload.new;
            setMaterialsDb(prev => {
              if (prev.some(x => x.alloy === m.alloy)) return prev;
              return [...prev, { alloy: m.alloy, category: m.category, description: m.description }];
            });
          } else if (payload.eventType === "UPDATE") {
            const m = payload.new;
            setMaterialsDb(prev => prev.map(x => x.alloy === m.alloy ? { alloy: m.alloy, category: m.category, description: m.description } : x));
          } else if (payload.eventType === "DELETE") {
            const alloy = payload.old.alloy;
            setMaterialsDb(prev => prev.filter(x => x.alloy !== alloy));
          }
        }
      )
      .subscribe();

    const vendorsChannel = supabase
      .channel("vendors-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vendors" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const v = payload.new;
            setVendorsDb(prev => {
              if (prev.some(x => x.vendorCode === v.vendor_code)) return prev;
              return [...prev, { vendorCode: v.vendor_code, name: v.name }];
            });
          } else if (payload.eventType === "UPDATE") {
            const v = payload.new;
            setVendorsDb(prev => prev.map(x => x.vendorCode === v.vendor_code ? { vendorCode: v.vendor_code, name: v.name } : x));
          } else if (payload.eventType === "DELETE") {
            const vendorCode = payload.old.vendor_code;
            setVendorsDb(prev => prev.filter(x => x.vendorCode !== vendorCode));
          }
        }
      )
      .subscribe();

    const partsChannel = supabase
      .channel("parts-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "parts" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const p = payload.new;
            const newPart: Part = {
              id: p.id,
              partNumber: p.part_number,
              description: p.description,
              alloy: p.alloy,
              castWt: Number(p.cast_wt),
              machiningWt: Number(p.machining_wt),
              asCast: p.as_cast,
            };
            setPartsDb(prev => {
              if (prev.some(x => x.id === newPart.id)) return prev;
              return [...prev, newPart];
            });
          } else if (payload.eventType === "UPDATE") {
            const p = payload.new;
            const updated: Part = {
              id: p.id,
              partNumber: p.part_number,
              description: p.description,
              alloy: p.alloy,
              castWt: Number(p.cast_wt),
              machiningWt: Number(p.machining_wt),
              asCast: p.as_cast,
            };
            setPartsDb(prev => prev.map(x => x.id === updated.id ? updated : x));
          } else if (payload.eventType === "DELETE") {
            const id = payload.old.id;
            setPartsDb(prev => prev.filter(x => x.id !== id));
          }
        }
      )
      .subscribe();

    const posChannel = supabase
      .channel("pos-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pos" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const po = payload.new;
            const newPO: PO = {
              id: po.id,
              poNum: po.po_num,
              partNumber: po.part_number,
              vendorCode: po.vendor_code,
              plant: po.plant,
              basePrice: Number(po.base_price),
              baseQuarter: po.base_quarter,
              grnQty: Number(po.grn_qty || 0),
            };
            setPosDb(prev => {
              if (prev.some(x => x.id === newPO.id)) return prev;
              return [...prev, newPO];
            });
          } else if (payload.eventType === "UPDATE") {
            const po = payload.new;
            const updated: PO = {
              id: po.id,
              poNum: po.po_num,
              partNumber: po.part_number,
              vendorCode: po.vendor_code,
              plant: po.plant,
              basePrice: Number(po.base_price),
              baseQuarter: po.base_quarter,
              grnQty: Number(po.grn_qty || 0),
            };
            setPosDb(prev => prev.map(x => x.id === updated.id ? updated : x));
          } else if (payload.eventType === "DELETE") {
            const id = payload.old.id;
            setPosDb(prev => prev.filter(x => x.id !== id));
          }
        }
      )
      .subscribe();

    const rmChannel = supabase
      .channel("rm-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rm_index" },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const item = payload.new;
            setRmDb(prev => {
              const next = { ...prev };
              if (!next[item.alloy]) next[item.alloy] = {};
              next[item.alloy][item.quarter] = item.value != null ? Number(item.value) : null;
              return next;
            });
          } else if (payload.eventType === "DELETE") {
            const item = payload.old;
            setRmDb(prev => {
              const next = { ...prev };
              if (next[item.alloy]) {
                delete next[item.alloy][item.quarter];
              }
              return next;
            });
          }
        }
      )
      .subscribe();

    const settingsChannel = supabase
      .channel("settings-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "settings", filter: "id=eq.1" },
        (payload) => {
          const s = payload.new;
          setQuartersDb(s.quarters);
          setAlloysDb(s.alloys);
          setPrevQDb(s.prev_q);
          setNewQDb(s.new_q);
          setAmendmentReasonDb(s.amendment_reason || "");
          setScrapOverrideDb(s.scrap_override || {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(materialsChannel);
      supabase.removeChannel(vendorsChannel);
      supabase.removeChannel(partsChannel);
      supabase.removeChannel(posChannel);
      supabase.removeChannel(rmChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, [loading, dbError]);

  // Sync amendment reason to DB debounced
  useEffect(() => {
    if (!isSupabaseConfigured || loading || dbError) return;
    const t = setTimeout(async () => {
      const { data } = await supabase.from("settings").select("amendment_reason").eq("id", 1).single();
      if (data && data.amendment_reason !== amendmentReason) {
        await supabase.from("settings").update({ amendment_reason: amendmentReason }).eq("id", 1);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [amendmentReason, loading, dbError]);

  // Derived GRN Qty from virtual parts (POCalc[])
  const grnQty = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of parts) {
      if (p.grnQty) map[p.id] = p.grnQty;
    }
    return map;
  }, [parts]);

  async function setGrnQty(next: Record<string, number>) {
    if (!isSupabaseConfigured) {
      setPosRaw((prev) =>
        prev.map((po) => {
          const newVal = next[po.id] ?? 0;
          return { ...po, grnQty: newVal };
        })
      );
      return;
    }

    for (const po of posMaster) {
      const oldVal = po.grnQty ?? 0;
      const newVal = next[po.id] ?? 0;
      if (newVal !== oldVal) {
        setPosDb((prev) => prev.map((x) => (x.id === po.id ? { ...x, grnQty: newVal } : x)));
        supabase.from("pos").update({ grn_qty: newVal }).eq("id", po.id).then(({ error }) => {
          if (error) console.error("Error updating grnQty:", error);
        });
      }
    }
  }

  async function updateSettings(patch: any) {
    if (!isSupabaseConfigured) return;
    const dbPatch: any = {};
    if (patch.quarters !== undefined) dbPatch.quarters = patch.quarters;
    if (patch.alloys !== undefined) dbPatch.alloys = patch.alloys;
    if (patch.prevQ !== undefined) dbPatch.prev_q = patch.prevQ;
    if (patch.newQ !== undefined) dbPatch.new_q = patch.newQ;
    if (patch.amendmentReason !== undefined) dbPatch.amendment_reason = patch.amendmentReason;
    if (patch.scrapOverride !== undefined) dbPatch.scrap_override = patch.scrapOverride;

    const { error } = await supabase.from("settings").update(dbPatch).eq("id", 1);
    if (error) console.error("Error updating settings:", error);
  }

  async function handleSetPrevQ(q: string) {
    setPrevQ(q);
    if (isSupabaseConfigured) {
      await updateSettings({ prevQ: q });
    }
  }

  async function handleSetNewQ(q: string) {
    setNewQ(q);
    if (isSupabaseConfigured) {
      await updateSettings({ newQ: q });
    }
  }

  const inconsistencies = useMemo(() => findInconsistencies(parts), [parts]);
  const badIds = useMemo(() => inconsistentIds(parts), [parts]);

  const autoScrap = useMemo(() => {
    return computeAutoScrap(rm, prevQ, newQ);
  }, [rm, prevQ, newQ]);

  async function updateRm(alloy: string, q: string, v: string) {
    const val = v === "" ? null : Number(v);
    const isScrapNewQ = alloy === "SCRAP" && q === newQ;

    setRm((prev) => ({ ...prev, [alloy]: { ...prev[alloy], [q]: val } }));

    let nextOverride = { ...scrapOverride };
    if (isScrapNewQ) {
      const isOverride = v !== "";
      nextOverride = { ...scrapOverride, [q]: isOverride };
      setScrapOverride(nextOverride);
    }

    if (isSupabaseConfigured) {
      const { error: rmErr } = await supabase
        .from("rm_index")
        .upsert({ alloy, quarter: q, value: val }, { onConflict: "alloy,quarter" });
      if (rmErr) console.error("Error upserting RM index:", rmErr);

      if (isScrapNewQ) {
        await updateSettings({ scrapOverride: nextOverride });
      }
    }
  }

  const effectiveRm = useMemo(() => {
    if (autoScrap == null || scrapOverride[newQ]) return rm;
    if (rm["SCRAP"]?.[newQ] != null) return rm;
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

  // ─── Material Master CRUD ─────────────────────────────────────────
  async function addMaterial() {
    const newMaterial: Material = { alloy: `ALLOY-${Date.now().toString(36).toUpperCase()}`, category: "Aluminium Casting", description: "" };
    setMaterialsMaster((prev) => [...prev, newMaterial]);
    if (isSupabaseConfigured) {
      const { error } = await supabase.from("materials").insert(newMaterial);
      if (error) console.error("Error inserting material:", error);
    }
  }

  async function updateMaterial(alloy: string, patch: Partial<Material>) {
    setMaterialsMaster((prev) => prev.map((m) => (m.alloy === alloy ? { ...m, ...patch } : m)));
    if (isSupabaseConfigured) {
      const { error } = await supabase.from("materials").update(patch).eq("alloy", alloy);
      if (error) console.error("Error updating material:", error);
    }
  }

  async function removeMaterial(alloy: string) {
    setMaterialsMaster((prev) => prev.filter((m) => m.alloy !== alloy));
    if (isSupabaseConfigured) {
      const { error } = await supabase.from("materials").delete().eq("alloy", alloy);
      if (error) console.error("Error deleting material:", error);
    }
  }

  // ─── Vendor Master CRUD ───────────────────────────────────────────
  async function addVendor() {
    const newVendor: Vendor = { vendorCode: `V-${Date.now()}`, name: "New Vendor" };
    setVendorsMaster((prev) => [...prev, newVendor]);
    if (isSupabaseConfigured) {
      const { error } = await supabase.from("vendors").insert({ vendor_code: newVendor.vendorCode, name: newVendor.name });
      if (error) console.error("Error inserting vendor:", error);
    }
  }

  async function updateVendor(vendorCode: string, patch: Partial<Vendor>) {
    setVendorsMaster((prev) => prev.map((v) => (v.vendorCode === vendorCode ? { ...v, ...patch } : v)));
    if (isSupabaseConfigured) {
      const dbPatch: any = {};
      if (patch.name !== undefined) dbPatch.name = patch.name;
      const { error } = await supabase.from("vendors").update(dbPatch).eq("vendor_code", vendorCode);
      if (error) console.error("Error updating vendor:", error);
    }
  }

  async function removeVendor(vendorCode: string) {
    setVendorsMaster((prev) => prev.filter((v) => v.vendorCode !== vendorCode));
    if (isSupabaseConfigured) {
      const { error } = await supabase.from("vendors").delete().eq("vendor_code", vendorCode);
      if (error) console.error("Error deleting vendor:", error);
    }
  }

  // ─── Part Master CRUD ─────────────────────────────────────────────
  async function addPart() {
    const newId = `p${Date.now()}`;
    const newPart: Part = {
      id: newId, partNumber: `PN-${Date.now()}`, description: "", alloy: alloys[0] ?? "SCM 14", castWt: 0, machiningWt: 0, asCast: false
    };
    setPartsMaster((prev) => [...prev, newPart]);
    if (isSupabaseConfigured) {
      const { error } = await supabase.from("parts").insert({
        id: newPart.id,
        part_number: newPart.partNumber,
        description: newPart.description,
        alloy: newPart.alloy,
        cast_wt: newPart.castWt,
        machining_wt: newPart.machiningWt,
        as_cast: newPart.asCast,
      });
      if (error) console.error("Error inserting part:", error);
    }
  }

  async function updatePart(id: string, patch: Partial<Part>) {
    setPartsMaster((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    if (isSupabaseConfigured) {
      const dbPatch: any = {};
      if (patch.partNumber !== undefined) dbPatch.part_number = patch.partNumber;
      if (patch.description !== undefined) dbPatch.description = patch.description;
      if (patch.alloy !== undefined) dbPatch.alloy = patch.alloy;
      if (patch.castWt !== undefined) dbPatch.cast_wt = patch.castWt;
      if (patch.machiningWt !== undefined) dbPatch.machining_wt = patch.machiningWt;
      if (patch.asCast !== undefined) dbPatch.as_cast = patch.asCast;

      const { error } = await supabase.from("parts").update(dbPatch).eq("id", id);
      if (error) console.error("Error updating part:", error);
    }
  }

  async function removePart(id: string) {
    setPartsMaster((prev) => prev.filter((p) => p.id !== id));
    if (isSupabaseConfigured) {
      const { error } = await supabase.from("parts").delete().eq("id", id);
      if (error) console.error("Error deleting part:", error);
    }
  }

  // ─── PO Master CRUD ───────────────────────────────────────────────
  async function addPO() {
    const newId = `po${Date.now()}`;
    const firstPart = partsMaster[0]?.partNumber ?? "";
    const firstVendor = vendorsMaster[0]?.vendorCode ?? "";
    const newPO: PO = {
      id: newId, poNum: `PO-${Date.now()}`, partNumber: firstPart, vendorCode: firstVendor, plant: "1020", basePrice: 0, baseQuarter: prevQ || quarters[0] || "", grnQty: 0
    };
    setPosMaster((prev) => [...prev, newPO]);
    if (isSupabaseConfigured) {
      const { error } = await supabase.from("pos").insert({
        id: newPO.id,
        po_num: newPO.poNum,
        part_number: newPO.partNumber,
        vendor_code: newPO.vendorCode,
        plant: newPO.plant,
        base_price: newPO.basePrice,
        base_quarter: newPO.baseQuarter,
        grn_qty: newPO.grnQty,
      });
      if (error) console.error("Error inserting PO:", error);
    }
  }

  async function updatePO(id: string, patch: Partial<PO>) {
    setPosMaster((prev) => prev.map((po) => (po.id === id ? { ...po, ...patch } : po)));
    if (isSupabaseConfigured) {
      const dbPatch: any = {};
      if (patch.poNum !== undefined) dbPatch.po_num = patch.poNum;
      if (patch.partNumber !== undefined) dbPatch.part_number = patch.partNumber;
      if (patch.vendorCode !== undefined) dbPatch.vendor_code = patch.vendorCode;
      if (patch.plant !== undefined) dbPatch.plant = patch.plant;
      if (patch.basePrice !== undefined) dbPatch.base_price = patch.basePrice;
      if (patch.baseQuarter !== undefined) dbPatch.base_quarter = patch.baseQuarter;
      if (patch.grnQty !== undefined) dbPatch.grn_qty = patch.grnQty;

      const { error } = await supabase.from("pos").update(dbPatch).eq("id", id);
      if (error) console.error("Error updating PO:", error);
    }
  }

  async function removePO(id: string) {
    setPosMaster((prev) => prev.filter((po) => po.id !== id));
    if (isSupabaseConfigured) {
      const { error } = await supabase.from("pos").delete().eq("id", id);
      if (error) console.error("Error deleting PO:", error);
    }
  }

  async function handlePartsUpload(file: File, mode: "append" | "replace") {
    const incoming = await parsePartsExcel(file, prevQ);

    const newMaterials: Material[] = [];
    const newVendors: Vendor[] = [];
    const newParts: Part[] = [];
    const newPOs: PO[] = [];

    const materialMap = new Set(materialsMaster.map(m => m.alloy));
    const vendorMap = new Set(vendorsMaster.map(v => v.vendorCode));
    const partMap = new Set(partsMaster.map(p => p.partNumber));

    incoming.forEach((row, i) => {
      if (row.alloy && !materialMap.has(row.alloy) && !newMaterials.some(m => m.alloy === row.alloy)) {
        newMaterials.push({ alloy: row.alloy, category: "Aluminium Casting", description: `${row.alloy} alloy` });
      }
      if (row.vendorCode && !vendorMap.has(row.vendorCode) && !newVendors.some(v => v.vendorCode === row.vendorCode)) {
        newVendors.push({ vendorCode: row.vendorCode, name: `Vendor ${row.vendorCode}` });
      }
      if (row.partNumber && !partMap.has(row.partNumber) && !newParts.some(p => p.partNumber === row.partNumber)) {
        newParts.push({
          id: `p-${row.partNumber}`,
          partNumber: row.partNumber,
          description: row.description,
          alloy: row.alloy,
          castWt: row.castWt,
          machiningWt: row.machiningWt,
          asCast: row.asCast,
        });
      }
      newPOs.push({
        id: row.id,
        poNum: row.poNum || `PO-${Date.now()}-${i}`,
        partNumber: row.partNumber,
        vendorCode: row.vendorCode,
        plant: row.plant,
        basePrice: row.basePrice,
        baseQuarter: row.baseQuarter,
        grnQty: row.grnQty,
      });
    });

    if (mode === "replace") {
      setMaterialsMaster(newMaterials);
      setVendorsMaster(newVendors);
      setPartsMaster(newParts);
      setPosMaster(newPOs);
    } else {
      setMaterialsMaster(prev => [...prev, ...newMaterials]);
      setVendorsMaster(prev => [...prev, ...newVendors]);
      setPartsMaster(prev => [...prev, ...newParts]);
      setPosMaster(prev => [...prev, ...newPOs]);
    }

    if (isSupabaseConfigured) {
      if (mode === "replace") {
        await supabase.from("pos").delete().neq("id", "0");
        await supabase.from("parts").delete().neq("id", "0");
        await supabase.from("vendors").delete().neq("vendor_code", "0");
        await supabase.from("materials").delete().neq("alloy", "0");
      }

      if (newMaterials.length > 0) {
        await supabase.from("materials").insert(newMaterials);
      }
      if (newVendors.length > 0) {
        await supabase.from("vendors").insert(newVendors.map(v => ({ vendor_code: v.vendorCode, name: v.name })));
      }
      if (newParts.length > 0) {
        await supabase.from("parts").insert(newParts.map(p => ({
          id: p.id,
          part_number: p.partNumber,
          description: p.description,
          alloy: p.alloy,
          cast_wt: p.castWt,
          machining_wt: p.machiningWt,
          as_cast: p.asCast,
        })));
      }
      if (newPOs.length > 0) {
        await supabase.from("pos").insert(newPOs.map(po => ({
          id: po.id,
          po_num: po.poNum,
          part_number: po.partNumber,
          vendor_code: po.vendorCode,
          plant: po.plant,
          base_price: po.basePrice,
          base_quarter: po.baseQuarter,
          grn_qty: po.grnQty,
        })));
      }
    }
  }

  async function handleRmUpload(file: File) {
    const incoming = await parseRmExcel(file);

    const newAlloyList = Object.keys(incoming).filter(k => k !== "SCRAP");
    let nextAlloys = [...alloys];
    if (newAlloyList.length > 0) {
      for (const a of newAlloyList) if (!nextAlloys.includes(a)) nextAlloys.push(a);
    }
    const allQtrs = Object.values(incoming).flatMap(v => Object.keys(v ?? {}));
    const uniqueQtrs = [...new Set(allQtrs)];
    let nextQuarters = [...quarters];
    if (uniqueQtrs.length > 0) {
      for (const q of uniqueQtrs) if (!nextQuarters.includes(q)) nextQuarters.push(q);
    }

    setAlloys(nextAlloys);
    setQuarters(nextQuarters);

    setRm((prev) => {
      const merged: RmIndex = { ...prev };
      for (const alloy of Object.keys(incoming)) {
        merged[alloy] = { ...(merged[alloy] ?? {}), ...incoming[alloy] };
      }
      return merged;
    });

    if (isSupabaseConfigured) {
      const toInsert: any[] = [];
      for (const alloy of Object.keys(incoming)) {
        for (const quarter of Object.keys(incoming[alloy])) {
          toInsert.push({
            alloy,
            quarter,
            value: incoming[alloy][quarter],
          });
        }
      }
      const { error: rmErr } = await supabase.from("rm_index").upsert(toInsert, { onConflict: "alloy,quarter" });
      if (rmErr) console.error("Error upserting RM index from upload:", rmErr);

      await updateSettings({ alloys: nextAlloys, quarters: nextQuarters });
    }
  }

  // Quarter management
  async function addQuarter(name: string) {
    if (!name || quarters.includes(name)) return;
    const nextQtrs = [...quarters, name];

    setQuarters(nextQtrs);
    setRm(prev => {
      const next = { ...prev };
      for (const a of RM_ROWS) {
        next[a] = { ...next[a], [name]: null };
      }
      return next;
    });

    if (isSupabaseConfigured) {
      await updateSettings({ quarters: nextQtrs });
      const toInsert = alloys.map(a => ({ alloy: a, quarter: name, value: null }));
      toInsert.push({ alloy: "SCRAP", quarter: name, value: null });
      await supabase.from("rm_index").insert(toInsert);
    }
  }

  async function renameQuarter(oldName: string, newName: string) {
    if (!newName || newName === oldName || quarters.includes(newName)) return;
    const nextQtrs = quarters.map(q => q === oldName ? newName : q);
    const nextPrev = prevQ === oldName ? newName : prevQ;
    const nextNew = newQ === oldName ? newName : newQ;

    setQuarters(nextQtrs);
    setPosMaster(prev => prev.map(po => po.baseQuarter === oldName ? { ...po, baseQuarter: newName } : po));
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
    if (prevQ === oldName) handleSetPrevQ(newName);
    if (newQ === oldName) handleSetNewQ(newName);

    if (isSupabaseConfigured) {
      await updateSettings({ quarters: nextQtrs, prevQ: nextPrev, newQ: nextNew });
      await supabase.from("pos").update({ base_quarter: newName }).eq("base_quarter", oldName);
      await supabase.from("rm_index").update({ quarter: newName }).eq("quarter", oldName);
    }
  }

  async function removeQuarter(name: string) {
    if (quarters.length <= 1) return;
    const nextQtrs = quarters.filter(q => q !== name);
    const nextPrev = prevQ === name ? nextQtrs[0] || "" : prevQ;
    const nextNew = newQ === name ? nextQtrs[0] || "" : newQ;

    setQuarters(nextQtrs);
    setRm(prev => {
      const next = { ...prev };
      for (const a of Object.keys(next)) {
        next[a] = { ...next[a] };
        delete next[a][name];
      }
      return next;
    });
    if (prevQ === name) handleSetPrevQ(nextPrev);
    if (newQ === name) handleSetNewQ(nextNew);

    if (isSupabaseConfigured) {
      await updateSettings({ quarters: nextQtrs, prevQ: nextPrev, newQ: nextNew });
      await supabase.from("rm_index").delete().eq("quarter", name);
    }
  }

  // Alloy management
  async function addAlloy(name: string) {
    if (!name || alloys.includes(name)) return;
    const nextAlloys = [...alloys, name];

    setAlloys(nextAlloys);
    setRm(prev => ({ ...prev, [name]: Object.fromEntries(quarters.map(q => [q, null])) }));

    if (isSupabaseConfigured) {
      await updateSettings({ alloys: nextAlloys });
      const toInsert = quarters.map(q => ({ alloy: name, quarter: q, value: null }));
      await supabase.from("rm_index").insert(toInsert);
    }
  }

  async function renameAlloy(oldName: string, newName: string) {
    if (!newName || newName === oldName || alloys.includes(newName)) return;
    const nextAlloys = alloys.map(a => a === oldName ? newName : a);

    setAlloys(nextAlloys);
    setPartsMaster(prev => prev.map(p => p.alloy === oldName ? { ...p, alloy: newName } : p));
    setRm(prev => {
      const next = { ...prev, [newName]: prev[oldName] ?? {} };
      delete next[oldName];
      return next;
    });

    if (isSupabaseConfigured) {
      await updateSettings({ alloys: nextAlloys });
      await supabase.from("parts").update({ alloy: newName }).eq("alloy", oldName);
      await supabase.from("rm_index").update({ alloy: newName }).eq("alloy", oldName);
    }
  }

  async function removeAlloy(name: string) {
    if (alloys.length <= 1) return;
    const nextAlloys = alloys.filter(a => a !== name);

    setAlloys(nextAlloys);
    setRm(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });

    if (isSupabaseConfigured) {
      await updateSettings({ alloys: nextAlloys });
      await supabase.from("rm_index").delete().eq("alloy", name);
    }
  }

  const displayRm = effectiveRm;

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center space-y-4">
        <div className="rounded-md bg-primary text-primary-foreground p-3 animate-bounce">
          <Factory className="size-8" />
        </div>
        <div className="text-sm font-semibold animate-pulse text-muted-foreground">Loading dashboard data from Supabase...</div>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
        <Card className="max-w-md w-full border-destructive animate-in fade-in zoom-in-95 duration-200">
          <CardHeader className="pb-3 flex flex-row items-center gap-3">
            <div className="rounded-md bg-destructive/10 text-destructive p-2">
              <AlertTriangle className="size-6" />
            </div>
            <div>
              <CardTitle className="text-lg">Database Error</CardTitle>
              <CardDescription>Could not load data from Supabase</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-xs font-mono bg-destructive/5 text-destructive p-3 rounded border border-destructive/10 break-all">
              {dbError}
            </div>
            <div className="text-xs text-muted-foreground space-y-2">
              <p>Please check that:</p>
              <ul className="list-disc list-inside">
                <li>Your Supabase URL & Anon Key are set in your local environment.</li>
                <li>Your database schemas have been pushed to the database.</li>
              </ul>
            </div>
            <Button className="w-full" variant="outline" onClick={() => window.location.reload()}>
              Retry Connection
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {!isSupabaseConfigured && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-600 px-4 py-2 text-center text-xs flex items-center justify-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            <strong>Sandbox Mode:</strong> Supabase environment variables are missing. App is running with static in-memory data. Edits will not persist.
          </span>
        </div>
      )}
      <PriceTicker alloys={alloys} rm={effectiveRm} quarters={quarters} />
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
            <Badge variant="secondary">{parts.length} PO rows</Badge>
            <Badge variant="secondary">{partsMaster.length} parts</Badge>
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
              <Select value={prevQ} onValueChange={handleSetPrevQ}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{quarters.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>New Quarter</Label>
              <Select value={newQ} onValueChange={handleSetNewQ}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{quarters.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Export</Label>
              <Button className="w-full" onClick={async () =>
                downloadCalcExport(parts, effectiveRows, displayRm, prevQ, newQ, { amendmentReason }, quarters, alloys, grnQty)
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
            <TabsTrigger value="parts">Part Master ({partsMaster.length})</TabsTrigger>
            <TabsTrigger value="pos">PO Master ({posMaster.length})</TabsTrigger>
            <TabsTrigger value="vendors">Vendor Master ({vendorsMaster.length})</TabsTrigger>
            <TabsTrigger value="materials">Material Master ({materialsMaster.length})</TabsTrigger>
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
                    New Price = Old Price + RM Impact − Scrap Deduction. Scrap Ded = (New Scrap Rate − Prev Scrap Rate) × Eff Scrap Wt × 0.8
                  </CardDescription>
                </div>
                <Button onClick={async () => downloadCalcExport(parts, effectiveRows, displayRm, prevQ, newQ, { amendmentReason }, quarters, alloys, grnQty)} size="sm">
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
                  <CardDescription>Chain-computed from each PO's base quarter using the RM Index.</CardDescription>
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
                    Physical component properties. Parts ending in <b>0</b> or <b>6</b> are forced AS CAST.
                  </CardDescription>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={downloadPartsTemplate}>
                    <FileSpreadsheet className="size-4 mr-1.5" />Template
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadPartsExport(partsMaster)}>
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
                      <Th>Part #</Th><Th>Description</Th><Th>Alloy</Th>
                      <Th right>Cast Wt</Th><Th right>Mach Wt</Th><Th right>Scrap Wt</Th>
                      <Th>AS CAST</Th><Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {partsMaster.map((p) => {
                      const manual = isManualAsCast(p);
                      const auto06 = /[06]$/.test(p.partNumber);
                      return (
                        <tr key={p.id} className={`border-t ${manual ? "bg-amber-100/70" : ""}`}>
                          <Td><Input className="h-7 font-mono w-40" value={p.partNumber} onChange={(e) => updatePart(p.id, { partNumber: e.target.value })} /></Td>
                          <Td><Input className="h-7 w-64" value={p.description} onChange={(e) => updatePart(p.id, { description: e.target.value })} /></Td>
                          <Td>
                            <Select value={p.alloy} onValueChange={(v) => updatePart(p.id, { alloy: v })}>
                              <SelectTrigger className="h-7 w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>{alloys.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                            </Select>
                          </Td>
                          <Td right><Input className="h-7 w-24 text-right" type="number" step="0.001" value={p.castWt} onChange={(e) => updatePart(p.id, { castWt: Number(e.target.value) })} /></Td>
                          <Td right><Input className="h-7 w-24 text-right" type="number" step="0.001" value={p.machiningWt} onChange={(e) => updatePart(p.id, { machiningWt: Number(e.target.value) })} /></Td>
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

          {/* PO MASTER */}
          <TabsContent value="pos" className="mt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">PO Master</CardTitle>
                  <CardDescription>
                    Purchase Orders mapping parts to plants, vendors, base pricing, and quarters.
                  </CardDescription>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => downloadPOsExport(posMaster)}>
                    <Download className="size-4 mr-1.5" />Export POs
                  </Button>
                  <Button onClick={addPO} size="sm"><Plus className="size-4 mr-1.5" />Add PO</Button>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-muted text-muted-foreground">
                    <tr className="text-left">
                      <Th>PO Num</Th><Th>Part Number</Th><Th>Vendor Code</Th><Th>Plant</Th>
                      <Th right>SAP Price (₹)</Th><Th>Base Quarter</Th><Th right>GRN Qty</Th><Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {posMaster.map((po) => {
                      const bad = badIds.has(po.id);
                      return (
                        <tr key={po.id} className={`border-t ${bad ? "bg-red-100/70" : ""}`}>
                          <Td><Input className="h-7 font-mono w-28" value={po.poNum} onChange={(e) => updatePO(po.id, { poNum: e.target.value })} /></Td>
                          <Td>
                            <Select value={po.partNumber} onValueChange={(v) => updatePO(po.id, { partNumber: v })}>
                              <SelectTrigger className="h-7 w-40 font-mono"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {partsMaster.map((p) => (
                                  <SelectItem key={p.id} value={p.partNumber}>{p.partNumber} ({p.description.slice(0, 15)})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Td>
                          <Td>
                            <Select value={po.vendorCode} onValueChange={(v) => updatePO(po.id, { vendorCode: v })}>
                              <SelectTrigger className="h-7 w-32 font-mono"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {vendorsMaster.map((v) => (
                                  <SelectItem key={v.vendorCode} value={v.vendorCode}>{v.vendorCode} — {v.name.slice(0, 15)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Td>
                          <Td><Input className="h-7 w-16" value={po.plant} onChange={(e) => updatePO(po.id, { plant: e.target.value })} /></Td>
                          <Td right><Input className="h-7 w-24 text-right" type="number" step="0.01" value={po.basePrice} onChange={(e) => updatePO(po.id, { basePrice: Number(e.target.value) })} /></Td>
                          <Td>
                            <Select value={po.baseQuarter} onValueChange={(v) => updatePO(po.id, { baseQuarter: v })}>
                              <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                              <SelectContent>{quarters.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                            </Select>
                          </Td>
                          <Td right><Input className="h-7 w-20 text-right" type="number" step="1" value={po.grnQty} onChange={(e) => updatePO(po.id, { grnQty: Number(e.target.value) })} /></Td>
                          <Td>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removePO(po.id)}>
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

          {/* VENDOR MASTER */}
          <TabsContent value="vendors" className="mt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">Vendor Master</CardTitle>
                  <CardDescription>
                    Registered component suppliers.
                  </CardDescription>
                </div>
                <Button onClick={addVendor} size="sm"><Plus className="size-4 mr-1.5" />Add Vendor</Button>
              </CardHeader>
              <CardContent className="max-w-md overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-muted text-muted-foreground">
                    <tr className="text-left">
                      <Th>Vendor Code</Th><Th>Vendor Name</Th><Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorsMaster.map((v) => (
                      <tr key={v.vendorCode} className="border-t">
                        <Td className="font-mono">{v.vendorCode}</Td>
                        <Td><Input className="h-7 w-48" value={v.name} onChange={(e) => updateVendor(v.vendorCode, { name: e.target.value })} /></Td>
                        <Td>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeVendor(v.vendorCode)}>
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MATERIAL MASTER */}
          <TabsContent value="materials" className="mt-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">Material Master</CardTitle>
                  <CardDescription>
                    Alloy index configurations.
                  </CardDescription>
                </div>
                <Button onClick={addMaterial} size="sm"><Plus className="size-4 mr-1.5" />Add Material</Button>
              </CardHeader>
              <CardContent className="max-w-xl overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-muted text-muted-foreground">
                    <tr className="text-left">
                      <Th>Alloy Grade</Th><Th>Category</Th><Th>Description</Th><Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {materialsMaster.map((m) => (
                      <tr key={m.alloy} className="border-t">
                        <Td className="font-semibold">{m.alloy}</Td>
                        <Td><Input className="h-7 w-40" value={m.category} onChange={(e) => updateMaterial(m.alloy, { category: e.target.value })} /></Td>
                        <Td><Input className="h-7 w-48" value={m.description} onChange={(e) => updateMaterial(m.alloy, { description: e.target.value })} /></Td>
                        <Td>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeMaterial(m.alloy)}>
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </Td>
                      </tr>
                    ))}
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
  parts: POCalc[]; rm: RmIndex; grnQty: Record<string, number>; quarters: string[];
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
            <SelectTrigger className="w-full max-w-md"><SelectValue placeholder="Select a part/PO" /></SelectTrigger>
            <SelectContent>
              {parts.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.poNum} — {p.partNumber} ({p.description.slice(0, 15)}) — Plant {p.plant}
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
