import * as XLSX from "xlsx";
import {
  cc, deriveSeries, derivedScrapWt,
  type CalcRow, type Part, type RmIndex, endsIn0or6,
} from "./pricing";

// ─── Utilities ────────────────────────────────────────────────────────────────

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

// Column letter(s) from 0-based index
function colLetter(idx: number): string {
  let s = "";
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

// Build a cell address string
function addr(col: number, row: number) { return `${colLetter(col)}${row}`; }

// ─── Cell builder helpers ─────────────────────────────────────────────────────

type XlsxCell = { v?: string | number | null; t?: string; f?: string; z?: string };

function strCell(v: string): XlsxCell { return { v, t: "s" }; }
function numCell(v: number | null | undefined): XlsxCell {
  if (v == null || Number.isNaN(v)) return { v: "", t: "s" };
  return { v, t: "n" };
}
function formulaCell(f: string, cached?: number | null): XlsxCell {
  // xlsx writes formula without leading "=" — we strip it if present
  const fstr = f.startsWith("=") ? f.slice(1) : f;
  if (cached != null && !Number.isNaN(cached)) return { f: fstr, v: cached, t: "n" };
  return { f: fstr, t: "n" };
}
function pctCell(f: string, cached?: number | null): XlsxCell {
  const cell = formulaCell(f, cached);
  return { ...cell, z: "0.00%" };
}

/** Write an array of XLSX cells to a worksheet at the given row (1-indexed) */
function writeRow(ws: Record<string, XlsxCell | unknown>, rowIdx: number, cells: XlsxCell[]) {
  for (let c = 0; c < cells.length; c++) {
    ws[addr(c, rowIdx)] = cells[c];
  }
}

/** Set worksheet range !ref */
function setRef(ws: Record<string, unknown>, maxCol: number, maxRow: number) {
  ws["!ref"] = `A1:${colLetter(maxCol - 1)}${maxRow}`;
}

/** Set column widths */
function setCols(ws: Record<string, unknown>, widths: number[]) {
  ws["!cols"] = widths.map((w) => ({ wch: w }));
}

// ─── RM Index sheet ───────────────────────────────────────────────────────────

function buildRmSheet(rm: RmIndex, alloys: string[], quarters: string[]): Record<string, unknown> {
  const ws: Record<string, unknown> = {};
  const allRows = [...alloys, "SCRAP"];
  // Header row: col 0 = "Alloy / Grade", then quarters
  writeRow(ws, 1, [strCell("Alloy / Grade"), ...quarters.map(strCell)]);
  for (let r = 0; r < allRows.length; r++) {
    const a = allRows[r];
    writeRow(ws, r + 2, [
      strCell(a),
      ...quarters.map((q) => numCell(rm[a]?.[q] ?? null)),
    ]);
  }
  setRef(ws, quarters.length + 1, allRows.length + 1);
  setCols(ws, [18, ...quarters.map(() => 14)]);
  return ws;
}

// ─── Calculated Prices sheet with formulas ───────────────────────────────────

/**
 * Column layout (0-indexed):
 *  A=0  CC (formula)
 *  B=1  PO Num
 *  C=2  Vendor Code
 *  D=3  Part #
 *  E=4  Description
 *  F=5  Plant
 *  G=6  Alloy
 *  H=7  Cast Wt
 *  I=8  Mach Wt
 *  J=9  Scrap Wt        =MAX(H-I,0)
 *  K=10 AS CAST (Y/N)
 *  L=11 Old Price       (input)
 *  M=12 Prev RM Base    VLOOKUP → RM Index
 *  N=13 New RM Base     VLOOKUP → RM Index
 *  O=14 Melt Loss       =H*1.06
 *  P=15 Eff Scrap Wt    =IF(K="Y",0,J)
 *  Q=16 Prev Scrap Rate VLOOKUP "SCRAP" → RM Index
 *  R=17 New Scrap Rate  VLOOKUP "SCRAP" → RM Index
 *  S=18 RM Impact       =(N-M)*O
 *  T=19 Scrap Ded       =(R-Q)*P*0.8
 *  U=20 New Price       =L+S-T
 *  V=21 Δ ₹             =U-L
 *  W=22 Δ %             =(U-L)/L
 *  X=23 Δ Lakhs         =(U-L)*GRN Qty (if provided, else blank)
 *  Y=24 Note            (static)
 */
const CAL_HEADERS = [
  "CC","PO Num","Vendor Code","Part #","Description","Plant","Alloy",
  "Cast Wt","Mach Wt",
  "Scrap Wt\n=MAX(Cast-Mach,0)",
  "AS CAST",
  `Old Price`,
  "Prev RM Base\n(VLOOKUP)",
  "New RM Base\n(VLOOKUP)",
  "Melt Loss\n=Cast×1.06",
  "Eff Scrap Wt\n=IF(AS CAST,0,Scrap Wt)",
  "Prev Scrap Rate\n(VLOOKUP)",
  "New Scrap Rate\n(VLOOKUP)",
  "RM Impact\n=(New RM−Prev RM)×Melt Loss",
  "Scrap Ded\n=(New Scrap−Prev Scrap)×Eff Scrap×0.8",
  "New Price\n=Old+RM Impact−Scrap Ded",
  "Δ ₹\n=New−Old",
  "Δ %\n=(New−Old)/Old",
  "Note",
];

function buildCalcSheet(
  rows: CalcRow[],
  grnQty: Record<string, number>,
  rmSheetName: string,
  alloys: string[],
  quarters: string[],
  prevQ: string,
  newQ: string,
): Record<string, unknown> {
  const ws: Record<string, unknown> = {};

  // Freeze first row + first 4 cols
  ws["!freeze"] = { xSplit: 4, ySplit: 1 };

  // Find column indices for prevQ and newQ in RM Index sheet (1-based for VLOOKUP)
  const allRmRows = [...alloys, "SCRAP"];
  // In RM Index sheet: col A = alloy name (col 1 in VLOOKUP), col B = Q[0] (col 2), ...
  const prevQColIdx = quarters.indexOf(prevQ) + 2; // 2 = 1-based offset after alloy col
  const newQColIdx  = quarters.indexOf(newQ)  + 2;
  const rmTotalCols = quarters.length + 1; // alloy col + quarter cols

  const rmRef = `'${rmSheetName}'!$A:${colLetter(rmTotalCols - 1)}`;
  const rmRow1 = `'${rmSheetName}'!$1:$1`; // header row for MATCH

  // Helper: VLOOKUP for a given alloy ref cell and column index
  const vlookupAlloy = (alloyCellAddr: string, qColIdx: number) =>
    `IFERROR(VLOOKUP(${alloyCellAddr},${rmRef},${qColIdx},0),"")`;

  // Header row
  writeRow(ws, 1, CAL_HEADERS.map(strCell));

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowIdx = i + 2; // 1-based, row 1 = header
    const R = rowIdx; // shorthand

    // Column letters for this row
    const H = `H${R}`, I = `I${R}`, J = `J${R}`, K = `K${R}`;
    const L = `L${R}`, M = `M${R}`, N = `N${R}`, O = `O${R}`;
    const P = `P${R}`, Q = `Q${R}`, Rcell = `R${R}`;
    const S = `S${R}`, T = `T${R}`, U = `U${R}`;
    const G = `G${R}`;

    // A: CC = plant & part number
    const ccVal = cc(r.part);
    writeRow(ws, R, [
      formulaCell(`F${R}&D${R}`, undefined),                          // A: CC
      strCell(r.part.poNum ?? ""),                                    // B: PO Num
      strCell(r.part.vendorCode ?? ""),                               // C: Vendor Code
      strCell(r.part.partNumber),                                     // D: Part #
      strCell(r.part.description),                                    // E: Description
      strCell(r.part.plant),                                          // F: Plant
      strCell(r.part.alloy),                                          // G: Alloy
      numCell(r.part.castWt),                                         // H: Cast Wt
      numCell(r.part.machiningWt),                                    // I: Mach Wt
      formulaCell(`MAX(${H}-${I},0)`, r.scrapWt),                    // J: Scrap Wt
      strCell(r.part.asCast ? "Y" : "N"),                            // K: AS CAST
      numCell(r.oldPrice),                                            // L: Old Price
      formulaCell(vlookupAlloy(G, prevQColIdx), r.prevBase ?? undefined), // M: Prev RM
      formulaCell(vlookupAlloy(G, newQColIdx),  r.newBase  ?? undefined), // N: New RM
      formulaCell(`${H}*1.06`, r.meltingLoss),                       // O: Melt Loss
      formulaCell(`IF(${K}="Y",0,${J})`, r.effectiveScrapWt),        // P: Eff Scrap Wt
      formulaCell(vlookupAlloy('"SCRAP"', prevQColIdx), r.prevScrap ?? undefined), // Q: Prev Scrap
      formulaCell(vlookupAlloy('"SCRAP"', newQColIdx),  r.newScrap  ?? undefined), // R: New Scrap
      formulaCell(`IF(AND(ISNUMBER(${M}),ISNUMBER(${N})),(${N}-${M})*${O},"")`, r.rmImpact ?? undefined), // S: RM Impact
      formulaCell(`IF(AND(ISNUMBER(${Q}),ISNUMBER(${Rcell}),${P}>0),(${Rcell}-${Q})*${P}*0.8,0)`, r.scrapDeduction ?? 0), // T: Scrap Ded
      formulaCell(`IF(ISNUMBER(${S}),${L}+${S}-${T},"")`, r.newPrice ?? undefined), // U: New Price
      formulaCell(`IF(ISNUMBER(${U}),${U}-${L},"")`, r.newPrice != null && r.oldPrice != null ? r.newPrice - r.oldPrice : undefined), // V: Δ₹
      pctCell(`IF(AND(ISNUMBER(${U}),${L}>0),(${U}-${L})/${L},"")`,
        r.newPrice != null && r.oldPrice ? (r.newPrice - r.oldPrice) / r.oldPrice : undefined), // W: Δ%
      strCell(r.note ?? ""),                                          // X: Note
    ]);
  }

  const totalRows = rows.length + 1;
  setRef(ws, CAL_HEADERS.length, totalRows);
  setCols(ws, [
    14,  // CC
    10,  // PO
    12,  // Vendor
    14,  // Part#
    28,  // Desc
    8,   // Plant
    12,  // Alloy
    9,   // CastWt
    9,   // MachWt
    10,  // ScrapWt
    9,   // AsCast
    11,  // OldPrice
    12,  // PrevRM
    12,  // NewRM
    12,  // MeltLoss
    14,  // EffScrap
    14,  // PrevScrap
    14,  // NewScrap
    14,  // RMImpact
    16,  // ScrapDed
    12,  // NewPrice
    10,  // Δ₹
    8,   // Δ%
    20,  // Note
  ]);

  return ws;
}

// ─── GRN Impact sheet with formulas ──────────────────────────────────────────

/**
 * GRN Impact columns:
 *  A Vendor | B PO | C Plant | D Part# | E Desc | F Alloy
 *  G Old Price | H New Price (=from Calc sheet, or static) | I Δ₹ =H-G
 *  J GRN Qty (user input — left blank for user to fill if not provided)
 *  K Impact (₹) =IF(ISNUMBER(J),(H-G)*J,"")
 *  L Impact (Lakhs) =IF(ISNUMBER(K),K/100000,"")
 */
const GRN_HEADERS = [
  "Vendor Code","PO Num","Plant","Part #","Description","Alloy",
  "Old Price","New Price","Δ ₹\n=New−Old",
  "GRN Qty\n(enter here)",
  "Impact (₹)\n=(New−Old)×GRN Qty",
  "Impact (₹ Lakhs)\n=Impact÷1,00,000",
];

function buildGrnSheet(rows: CalcRow[], grnQty: Record<string, number>): Record<string, unknown> {
  const ws: Record<string, unknown> = {};
  writeRow(ws, 1, GRN_HEADERS.map(strCell));

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowIdx = i + 2;
    const R = rowIdx;
    const G = `G${R}`, H = `H${R}`, J = `J${R}`, K = `K${R}`;
    const qty = grnQty[r.part.id] ?? null;
    const delta = r.oldPrice != null && r.newPrice != null ? r.newPrice - r.oldPrice : null;
    const impact = delta != null && qty ? delta * qty : null;

    writeRow(ws, R, [
      strCell(r.part.vendorCode ?? ""),                                       // A Vendor
      strCell(r.part.poNum ?? ""),                                            // B PO
      strCell(r.part.plant),                                                  // C Plant
      strCell(r.part.partNumber),                                             // D Part#
      strCell(r.part.description),                                            // E Desc
      strCell(r.part.alloy),                                                  // F Alloy
      numCell(r.oldPrice),                                                    // G Old Price
      numCell(r.newPrice),                                                    // H New Price
      formulaCell(`IF(AND(ISNUMBER(${G}),ISNUMBER(${H})),${H}-${G},"")`, delta ?? undefined), // I Δ₹
      qty ? numCell(qty) : strCell(""),                                       // J GRN Qty
      formulaCell(`IF(ISNUMBER(${J}),(${H}-${G})*${J},"")`,
        impact ?? undefined),                                                 // K Impact ₹
      formulaCell(`IF(ISNUMBER(${K}),${K}/100000,"")`,
        impact != null ? impact / 100000 : undefined),                       // L Lakhs
    ]);
  }

  const totalRows = rows.length + 1;
  setRef(ws, GRN_HEADERS.length, totalRows);
  setCols(ws, [12,10,8,14,28,12,11,11,10,12,16,16]);
  return ws;
}

// ─── Public export functions ──────────────────────────────────────────────────

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
  const all = parts.slice().sort((a,b) =>
    vKey(a.vendorCode).localeCompare(vKey(b.vendorCode)) || sortKey(a).localeCompare(sortKey(b))
  );
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
  grnQty: Record<string, number> = {},
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Cover
  const cover = XLSX.utils.aoa_to_sheet([
    ["AMENDMENT — Quarterly Price Recompute"],
    [],
    ["Reason", header.amendmentReason],
    ["From Quarter", prevQ],
    ["To Quarter", newQ],
    ["Parts in scope", parts.length],
    ["Generated", new Date().toISOString()],
    [],
    ["FORMULA REFERENCE"],
    ["Melt Loss",            "= Cast Wt × 1.06"],
    ["Scrap Wt",             "= MAX(Cast Wt − Mach Wt, 0)"],
    ["Eff Scrap Wt",         "= IF(AS CAST = Y, 0, Scrap Wt)"],
    ["RM Impact",            "= (New RM Base − Prev RM Base) × Melt Loss"],
    ["Scrap Deduction",      "= (New Scrap Rate − Prev Scrap Rate) × Eff Scrap Wt × 0.8"],
    ["New Price",            "= Old Price + RM Impact − Scrap Deduction"],
    ["New Scrap Rate (auto)","= (Old Scrap Rate ÷ Old SCM14 Rate) × New SCM14 Rate"],
  ]);
  XLSX.utils.book_append_sheet(wb, cover, "Amendment");

  // Sheet 2: RM Index (used by VLOOKUP formulas in Calculated Prices)
  const RM_SHEET = "RM Index";
  const rmSheet = buildRmSheet(rm, alloys, quarters);
  XLSX.utils.book_append_sheet(wb, rmSheet as XLSX.WorkSheet, RM_SHEET);

  // Sort rows same as display (by vendor, then part)
  const sortedRows = rows.slice().sort((a, b) =>
    vKey(a.part.vendorCode).localeCompare(vKey(b.part.vendorCode)) ||
    sortKey(a.part).localeCompare(sortKey(b.part))
  );

  // Sheet 3: All Vendors — Calculated Prices with formulas
  const calcSheet = buildCalcSheet(sortedRows, grnQty, RM_SHEET, alloys, quarters, prevQ, newQ);
  XLSX.utils.book_append_sheet(wb, calcSheet as XLSX.WorkSheet, "Calculated Prices");

  // Per-vendor calc sheets
  const byVendor = new Map<string, CalcRow[]>();
  for (const r of sortedRows) {
    const k = vKey(r.part.vendorCode);
    const arr = byVendor.get(k) ?? []; arr.push(r); byVendor.set(k, arr);
  }
  for (const [vendor, vrows] of [...byVendor.entries()].sort(([a],[b])=>a.localeCompare(b))) {
    const vs = buildCalcSheet(vrows, grnQty, RM_SHEET, alloys, quarters, prevQ, newQ);
    XLSX.utils.book_append_sheet(wb, vs as XLSX.WorkSheet, sanitizeSheet(`Calc_${vendor}`));
  }

  // Sheet: GRN Impact with formulas
  const grnSheet = buildGrnSheet(sortedRows, grnQty);
  XLSX.utils.book_append_sheet(wb, grnSheet as XLSX.WorkSheet, "GRN Impact");

  const file = `price-calc-${prevQ}-to-${newQ}.xlsx`.replace(/'/g, "");
  saveBlob(file, XLSX.write(wb, { type: "array", bookType: "xlsx", cellStyles: true }));
}

export const GRN_QTY_COL = 9;
export function grnKey(p: Part) { return `${p.vendorCode ?? ""}|${p.poNum ?? ""}|${p.plant}|${p.partNumber}`; }

export async function parseGrnExcel(file: File): Promise<Record<string, number>> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  const out: Record<string, number> = {};
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
export { deriveSeries };

export function downloadGrnTemplate(
  parts: Part[], rows: CalcRow[], grnQty: Record<string, number>,
  prevQ: string, newQ: string,
) {
  const wb = XLSX.utils.book_new();

  const sortedRows = rows.slice().sort((a, b) =>
    vKey(a.part.vendorCode).localeCompare(vKey(b.part.vendorCode)) ||
    sortKey(a.part).localeCompare(sortKey(b.part))
  );

  const grnSheet = buildGrnSheet(sortedRows, grnQty);
  XLSX.utils.book_append_sheet(wb, grnSheet as XLSX.WorkSheet, "GRN Impact");

  // Per-vendor sheets
  const byVendor = new Map<string, CalcRow[]>();
  for (const r of sortedRows) {
    const k = vKey(r.part.vendorCode);
    const arr = byVendor.get(k) ?? []; arr.push(r); byVendor.set(k, arr);
  }
  for (const [vendor, vrows] of [...byVendor.entries()].sort(([a],[b])=>a.localeCompare(b))) {
    const vs = buildGrnSheet(vrows, grnQty);
    XLSX.utils.book_append_sheet(wb, vs as XLSX.WorkSheet, sanitizeSheet(`V_${vendor}`));
  }

  saveBlob(`grn-impact-${prevQ}-to-${newQ}.xlsx`.replace(/'/g,""),
    XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}
