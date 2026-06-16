import * as XLSX from "xlsx";
import {
  cc, deriveSeries, derivedScrapWt,
  type CalcRow, type Part, type RmIndex, endsIn0or6,
} from "./pricing";

function saveBlob(filename: string, data: unknown) {
  let ab: ArrayBuffer;
  if (data instanceof ArrayBuffer) ab = data;
  else if (ArrayBuffer.isView(data)) {
    const v = data as ArrayBufferView;
    ab = v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
  } else throw new Error("saveBlob: unsupported data type");
  const blob = new Blob([ab], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const VENDOR_FALLBACK = "_NoVendor";
function vKey(v?: string) { return (v ?? "").trim() || VENDOR_FALLBACK; }
function sanitizeSheet(name: string) {
  return name.replace(/[:\\/?*[\]]/g, "_").slice(0, 31) || "Sheet";
}
function groupByVendor<T extends { vendorCode?: string }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = vKey(it.vendorCode);
    const arr = map.get(k) ?? []; arr.push(it); map.set(k, arr);
  }
  return [...map.entries()].sort(([a],[b]) => a.localeCompare(b));
}
function sortKey(p: Pick<Part,"poNum"|"plant"|"partNumber">) {
  return `${p.poNum ?? ""}|${p.plant ?? ""}|${p.partNumber ?? ""}`;
}

export const PART_HEADERS = [
  "PartNo","Description","Plant","VendorCode","PoNum","Alloy",
  "CastWt","MachiningWt","AsCast(Y/N)","BasePrice","BaseQuarter",
] as const;

export function downloadPartsTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    [...PART_HEADERS],
    ["100275560","FLANGE (CASTING)","1030","V10234","PO4567","SCM 14",0.96,0.96,"Y",243.81,"Q1'26 MAR"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Parts");
  saveBlob("parts-template.xlsx", XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

export function downloadPartsExport(parts: Part[]) {
  const wb = XLSX.utils.book_new();
  const all = parts
    .slice()
    .sort((a,b) => (vKey(a.vendorCode)).localeCompare(vKey(b.vendorCode)) || sortKey(a).localeCompare(sortKey(b)));
  const allRows = all.map((p) => [
    p.partNumber, p.description, p.plant, p.vendorCode ?? "", p.poNum ?? "", p.alloy,
    p.castWt, p.machiningWt, p.asCast ? "Y" : "N", p.basePrice, p.baseQuarter,
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...PART_HEADERS], ...allRows]), "All Parts");
  for (const [vendor, items] of groupByVendor(parts)) {
    const sorted = items.slice().sort((a,b)=> sortKey(a).localeCompare(sortKey(b)));
    const rows = sorted.map((p) => [
      p.partNumber, p.description, p.plant, p.vendorCode ?? "", p.poNum ?? "", p.alloy,
      p.castWt, p.machiningWt, p.asCast ? "Y" : "N", p.basePrice, p.baseQuarter,
    ]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...PART_HEADERS], ...rows]),
      sanitizeSheet(`V_${vendor}`));
  }
  saveBlob("parts.xlsx", XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

export async function parsePartsExcel(file: File, defaultQuarter: string): Promise<Part[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  const out: Part[] = [];
  for (const r of rows) {
    const partNumber = String(r["PartNo"] ?? r["Part Number"] ?? "").trim();
    if (!partNumber) continue;
    const userAsCast = /^(y|yes|true|1)$/i.test(
      String(r["AsCast(Y/N)"] ?? r["AsCast"] ?? r["AS CAST"] ?? "").trim()
    );
    const castWt = Number(r["CastWt"] ?? r["Cast Wt"] ?? 0) || 0;
    let mach = Number(r["MachiningWt"] ?? r["Mach Wt"] ?? r["Machining Wt"] ?? NaN);
    if (Number.isNaN(mach)) {
      const sw = Number(r["ScrapWt"] ?? r["Scrap Wt"] ?? 0) || 0;
      mach = Math.max(castWt - sw, 0);
    }
    out.push({
      id: `p${Date.now()}-${out.length}-${Math.random().toString(36).slice(2, 6)}`,
      partNumber,
      description: String(r["Description"] ?? ""),
      plant: String(r["Plant"] ?? "1020"),
      vendorCode: String(r["VendorCode"] ?? r["Vendor Code"] ?? "").trim(),
      alloy: String(r["Alloy"] ?? "SCM 14"),
      castWt,
      machiningWt: +mach.toFixed(4),
      asCast: endsIn0or6(partNumber) ? true : userAsCast,
      basePrice: Number(r["BasePrice"] ?? r["Base Price"] ?? 0) || 0,
      baseQuarter: String(r["BaseQuarter"] ?? r["Base Quarter"] ?? defaultQuarter),
      poNum: String(r["PoNum"] ?? r["PO Num"] ?? "").trim(),
    });
  }
  return out;
}

export function downloadRmTemplate(rm?: RmIndex, alloys?: string[], quarters?: string[]) {
  const rmAlloys = alloys ?? (rm ? Object.keys(rm).filter(k => k !== "SCRAP") : ["SCM 14","ADC 12"]);
  const rmRows = [...rmAlloys, "SCRAP"];
  const qtrs = quarters ?? (rm ? Object.keys(rm[rmAlloys[0]] ?? {}) : ["Q1'26 MAR","Q2'26"]);
  const header = ["Alloy / Grade", ...qtrs];
  const body = rmRows.map((a) => [a, ...qtrs.map((q) => rm?.[a]?.[q] ?? "")]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "RM Index");
  saveBlob(rm ? "rm-index.xlsx" : "rm-index-template.xlsx",
    XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

export async function parseRmExcel(file: File): Promise<RmIndex> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (!aoa.length) return {};
  const headerRow = aoa[0] as string[];
  const quarters = headerRow.slice(1).map((q) => String(q).trim());
  const out: RmIndex = {};
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] as unknown[];
    const alloy = String(row[0] ?? "").trim();
    if (!alloy) continue;
    out[alloy] = out[alloy] ?? {};
    quarters.forEach((q, idx) => {
      const v = row[idx + 1];
      if (v === "" || v == null) return;
      const n = Number(v);
      if (!Number.isNaN(n)) out[alloy][q] = n;
    });
  }
  return out;
}

export function downloadHistoryExport(
  parts: Part[],
  history: Record<string, Record<string, number | null>>,
  quarters: string[],
) {
  const header = ["CC","PO Num","Vendor Code","Part Number","Description","Plant","Alloy", ...quarters];
  const wb = XLSX.utils.book_new();
  const sortedAll = parts.slice().sort((a,b) =>
    vKey(a.vendorCode).localeCompare(vKey(b.vendorCode)) ||
    (a.poNum ?? "").localeCompare(b.poNum ?? "") ||
    (a.plant ?? "").localeCompare(b.plant ?? "") ||
    (a.partNumber ?? "").localeCompare(b.partNumber ?? "")
  );
  const bodyAll = sortedAll.map((p) => [
    cc(p), p.poNum ?? "", p.vendorCode ?? "", p.partNumber, p.description, p.plant, p.alloy,
    ...quarters.map((q) => history[p.id]?.[q] ?? ""),
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...bodyAll]), "All Vendors");
  for (const [vendor, items] of groupByVendor(parts)) {
    const sorted = items.slice().sort((a,b)=>
      (a.poNum ?? "").localeCompare(b.poNum ?? "") ||
      (a.plant ?? "").localeCompare(b.plant ?? "") ||
      (a.partNumber ?? "").localeCompare(b.partNumber ?? "")
    );
    const body = sorted.map((p) => [
      cc(p), p.poNum ?? "", p.vendorCode ?? "", p.partNumber, p.description, p.plant, p.alloy,
      ...quarters.map((q) => history[p.id]?.[q] ?? ""),
    ]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...body]),
      sanitizeSheet(`V_${vendor}`));
  }
  saveBlob("price-history.xlsx", XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

export function downloadCalcExport(
  parts: Part[],
  rows: CalcRow[],
  rm: RmIndex,
  prevQ: string, newQ: string,
  header: { amendmentReason: string },
  quarters: string[],
  alloys: string[],
) {
  const wb = XLSX.utils.book_new();
  const cover = XLSX.utils.aoa_to_sheet([
    ["AMENDMENT — Quarterly Price Recompute"],
    [],
    ["Reason", header.amendmentReason],
    ["From Quarter", prevQ],
    ["To Quarter", newQ],
    ["Parts in scope", parts.length],
    ["Generated", new Date().toISOString()],
  ]);
  XLSX.utils.book_append_sheet(wb, cover, "Amendment");

  const calcHeader = [
    "CC","PO Num","Vendor Code","Part #","Description","Plant","Alloy",
    "Cast Wt","Mach Wt","Scrap Wt","AS CAST",
    `Old Price (${prevQ})`,"Prev RM","New RM","Melting Loss",
    "Eff Scrap Wt","Prev Scrap","SCM14 Prev","RM Impact","Scrap Deduction",
    `New Price (${newQ})`,"Δ ₹","Δ %","Note",
  ];
  const calcRow = (r: CalcRow) => {
    const old = r.oldPrice ?? null;
    const delta = old != null && r.newPrice != null ? +(r.newPrice - old).toFixed(2) : null;
    const pct = old && r.newPrice != null ? +(((r.newPrice - old) / old) * 100).toFixed(2) : null;
    return [
      cc(r.part), r.part.poNum ?? "", r.part.vendorCode ?? "",
      r.part.partNumber, r.part.description, r.part.plant, r.part.alloy,
      r.part.castWt, r.part.machiningWt, r.scrapWt, r.part.asCast ? "Y" : "N",
      old, r.prevBase, r.newBase, r.meltingLoss,
      r.effectiveScrapWt, r.prevScrap, r.scm14Prev, r.rmImpact, r.scrapDeduction,
      r.newPrice, delta, pct, r.note ?? "",
    ];
  };
  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.aoa_to_sheet([calcHeader, ...rows.map(calcRow)]),
    "Calculated Prices");

  const rowsByVendor = new Map<string, CalcRow[]>();
  for (const r of rows) {
    const k = vKey(r.part.vendorCode);
    const arr = rowsByVendor.get(k) ?? []; arr.push(r); rowsByVendor.set(k, arr);
  }
  for (const [vendor, vrows] of [...rowsByVendor.entries()].sort(([a],[b])=>a.localeCompare(b))) {
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.aoa_to_sheet([calcHeader, ...vrows.map(calcRow)]),
      sanitizeSheet(`Calc_${vendor}`));
  }

  // RM Index snapshot
  const rmAlloys = [...alloys, "SCRAP"];
  const rmHeader = ["Alloy / Grade", ...quarters];
  const rmBody = rmAlloys.map((a) => [a, ...quarters.map((q) => rm[a]?.[q] ?? "")]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([rmHeader, ...rmBody]), "RM Index");

  const file = `price-calc-${prevQ}-to-${newQ}.xlsx`.replace(/'/g, "");
  saveBlob(file, XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

export const GRN_HEADERS = [
  "Vendor Code","PO Num","Plant","Part Number","Description","Alloy",
  "Old Price","New Price","Δ ₹","GRN Qty","Impact (Δ × GRN)","Impact (₹ Lakhs)",
] as const;

export function downloadGrnTemplate(
  parts: Part[], rows: CalcRow[], grnQty: Record<string, number>,
  prevQ: string, newQ: string,
) {
  const wb = XLSX.utils.book_new();
  const byId = new Map(rows.map((r) => [r.part.id, r]));
  const buildRows = (items: Part[]) => items.map((p) => {
    const r = byId.get(p.id);
    const old = r?.oldPrice ?? null;
    const np = r?.newPrice ?? null;
    const delta = old != null && np != null ? +(np - old).toFixed(2) : "";
    const qty = grnQty[p.id] ?? "";
    const impact = (typeof delta === "number" && typeof qty === "number")
      ? +(delta * qty).toFixed(2) : "";
    const impactLakh = typeof impact === "number" ? +(impact / 100000).toFixed(4) : "";
    return [
      p.vendorCode ?? "", p.poNum ?? "", p.plant, p.partNumber, p.description, p.alloy,
      old ?? "", np ?? "", delta, qty, impact, impactLakh,
    ];
  });
  const sortedAll = parts.slice().sort((a,b) =>
    vKey(a.vendorCode).localeCompare(vKey(b.vendorCode)) || sortKey(a).localeCompare(sortKey(b))
  );
  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.aoa_to_sheet([
      [`GRN Impact — fill column "GRN Qty". Prices = ${prevQ} → ${newQ}.`],
      [...GRN_HEADERS], ...buildRows(sortedAll),
    ]), "All Vendors");
  for (const [vendor, items] of groupByVendor(parts)) {
    const sorted = items.slice().sort((a,b)=> sortKey(a).localeCompare(sortKey(b)));
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.aoa_to_sheet([[...GRN_HEADERS], ...buildRows(sorted)]),
      sanitizeSheet(`V_${vendor}`));
  }
  saveBlob(`grn-impact-${prevQ}-to-${newQ}.xlsx`.replace(/'/g,""),
    XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

export const GRN_QTY_COL = 9; // 0-indexed column for GRN Qty in template
export function grnKey(p: Part) { return `${p.vendorCode ?? ""}|${p.poNum ?? ""}|${p.plant}|${p.partNumber}`; }

export async function parseGrnExcel(file: File): Promise<Record<string, number>> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  const out: Record<string, number> = {};
  // Find header row
  let hdr = 0;
  for (let i = 0; i < Math.min(aoa.length, 5); i++) {
    const row = aoa[i] as string[];
    if (row.some((c) => String(c).toLowerCase().includes("vendor"))) { hdr = i; break; }
  }
  const headers = (aoa[hdr] as string[]).map((h) => String(h).toLowerCase().trim());
  const vendorIdx = headers.findIndex((h) => h.includes("vendor"));
  const poIdx = headers.findIndex((h) => h.includes("po"));
  const plantIdx = headers.findIndex((h) => h.includes("plant"));
  const partIdx = headers.findIndex((h) => h.includes("part"));
  const qtyIdx = headers.findIndex((h) => h.includes("grn qty") || h === "grn qty");
  if (vendorIdx < 0 || partIdx < 0 || qtyIdx < 0) return out;
  for (let i = hdr + 1; i < aoa.length; i++) {
    const row = aoa[i] as unknown[];
    const qty = Number(row[qtyIdx]);
    if (!qty || Number.isNaN(qty)) continue;
    const key = `${String(row[vendorIdx] ?? "")}|${String(row[poIdx] ?? "")}|${String(row[plantIdx] ?? "")}|${String(row[partIdx] ?? "")}`;
    out[key] = qty;
  }
  return out;
}

export function quickScrapWt(p: Part) { return derivedScrapWt(p); }

// Alias for usage in vendor derivation export
export { deriveSeries };
