import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import {
  cc, derivedScrapWt,
  type CalcRow, type Part, type PO, type Vendor, type Material, type POCalc, type RmIndex, endsIn0or6,
} from "./pricing";

// ─── Utilities ────────────────────────────────────────────────────────────────

function saveBlob(filename: string, data: ArrayBuffer | Uint8Array | Buffer) {
  const blob = new Blob([data as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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
function sortKey(p: Pick<POCalc,"poNum"|"plant"|"partNumber">) {
  return `${p.poNum ?? ""}|${p.plant ?? ""}|${p.partNumber ?? ""}`;
}
function colLetter(zeroIdx: number): string {
  let s = "", n = zeroIdx;
  while (n >= 0) { s = String.fromCharCode((n % 26) + 65) + s; n = Math.floor(n / 26) - 1; }
  return s;
}

// ─── ExcelJS Style Palette ────────────────────────────────────────────────────

const PAL = {
  NAVY:         "FF1E3A5F",
  NAVY_MED:     "FF2E5D9C",
  NAVY_LIGHT:   "FF4472C4",
  STEEL:        "FFD6E4F7",
  ALT_ROW:      "FFEBF5FB",
  TOTAL_BG:     "FFFFF3CD",
  TOTAL_VAL:    "FF00B050",
  WHITE:        "FFFFFFFF",
  DARK_TEXT:    "FF1A1A2E",
  LIGHT_TEXT:   "FFCCDDEE",
  BORDER_THIN:  "FFB8CCE4",
  BORDER_MED:   "FF2E5D9C",
  GREEN_FILL:   "FFE2EFDA",
  RED_FILL:     "FFFCE4D6",
  AMBER:        "FFFFF2CC",
  GRAY_FILL:    "FFF2F2F2",
  SCRAP_FILL:   "FFFEF9E7",
} as const;

type BorderType = Partial<ExcelJS.Borders>;
type FontType = Partial<ExcelJS.Font>;
type AlignType = Partial<ExcelJS.Alignment>;

const fill = (argb: string): ExcelJS.Fill =>
  ({ type: "pattern", pattern: "solid", fgColor: { argb } });

const thinBorder = (): BorderType => {
  const s = { style: "thin" as const, color: { argb: PAL.BORDER_THIN } };
  return { top: s, left: s, bottom: s, right: s };
};
const hdrBorder = (): BorderType => {
  const s = { style: "thin" as const, color: { argb: PAL.BORDER_THIN } };
  const med = { style: "medium" as const, color: { argb: PAL.BORDER_MED } };
  return { top: s, left: s, bottom: med, right: s };
};

const navyFont = (size = 10, bold = true): FontType =>
  ({ bold, color: { argb: PAL.WHITE }, size, name: "Calibri" });
const darkFont = (size = 10, bold = false): FontType =>
  ({ bold, color: { argb: PAL.DARK_TEXT }, size, name: "Calibri" });

const center: AlignType = { vertical: "middle", horizontal: "center", wrapText: false };
const left: AlignType   = { vertical: "middle", horizontal: "left" };
const right: AlignType  = { vertical: "middle", horizontal: "right" };

function styleCell(
  cell: ExcelJS.Cell,
  opts: {
    fillArgb?: string; fontOpts?: FontType;
    border?: BorderType; align?: AlignType;
    numFmt?: string;
  },
) {
  if (opts.fillArgb) cell.fill = fill(opts.fillArgb);
  if (opts.fontOpts) cell.font = opts.fontOpts as ExcelJS.Font;
  if (opts.border) cell.border = opts.border as ExcelJS.Borders;
  if (opts.align) cell.alignment = opts.align as ExcelJS.Alignment;
  if (opts.numFmt) cell.numFmt = opts.numFmt;
}

// ─── Column Definitions ───────────────────────────────────────────────────────

const COL = {
  SNO: 1, CC: 2, VEN: 3, PART: 4, DESC: 5, CAST: 6, MACH: 7, PLANT: 8,
  ALLY: 9, PO: 10, MELT: 11, OLDP: 12, PRMB: 13, NRMB: 14,
  RMIP: 15, ESCP: 16, PSCR: 17, NSCR: 18, SDED: 19, NEWP: 20,
  DELR: 21, DELP: 22, NOTE: 23,
};
const TOTAL_COLS = 23;
const LAST_COL = colLetter(TOTAL_COLS - 1); // "W"

const HEADER_LABELS: Record<number, (prevQ: string, newQ: string) => string> = {
  [COL.SNO]:  () => "S.No",
  [COL.CC]:   () => "CC",
  [COL.VEN]:  () => "Vendor",
  [COL.PART]: () => "Part #",
  [COL.DESC]: () => "Description",
  [COL.CAST]: () => "Cast Wt\n(kg)",
  [COL.MACH]: () => "Mach Wt\n(kg)",
  [COL.PLANT]:() => "Plant",
  [COL.ALLY]: () => "Alloy",
  [COL.PO]:   () => "PO Num",
  [COL.MELT]: () => "Melt Loss\n=Cast×1.06",
  [COL.OLDP]: (p) => `Old Price\n(${p})`,
  [COL.PRMB]: (p) => `${p}\nRM Base`,
  [COL.NRMB]: (_,n) => `${n}\nRM Base`,
  [COL.RMIP]: () => "RM Impact\n=(New−Prev)×Melt",
  [COL.ESCP]: () => "Eff Scrap Wt\n(0 if AS CAST)",
  [COL.PSCR]: (p) => `${p}\nScrap Rate`,
  [COL.NSCR]: (_,n) => `${n}\nScrap Rate`,
  [COL.SDED]: () => "Scrap Ded\n=(ΔScrap)×EffScrp×0.8",
  [COL.NEWP]: (_,n) => `New Price\n(${n})`,
  [COL.DELR]: () => "Δ ₹\n=New−Old",
  [COL.DELP]: () => "Δ %",
  [COL.NOTE]: () => "Note",
};

const COL_WIDTHS: Record<number, number> = {
  [COL.SNO]: 5, [COL.CC]: 16, [COL.VEN]: 10, [COL.PART]: 15, [COL.DESC]: 30,
  [COL.CAST]: 9, [COL.MACH]: 9, [COL.PLANT]: 7, [COL.ALLY]: 10, [COL.PO]: 12,
  [COL.MELT]: 11, [COL.OLDP]: 11, [COL.PRMB]: 11, [COL.NRMB]: 11,
  [COL.RMIP]: 13, [COL.ESCP]: 13, [COL.PSCR]: 13, [COL.NSCR]: 13,
  [COL.SDED]: 14, [COL.NEWP]: 11, [COL.DELR]: 11, [COL.DELP]: 8, [COL.NOTE]: 22,
};

// ─── RM Index sheet builder ───────────────────────────────────────────────────

function addRmSheet(wb: ExcelJS.Workbook, rm: RmIndex, alloys: string[], quarters: string[]) {
  const ws = wb.addWorksheet("RM Index");
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

  ws.getColumn(1).width = 20;
  quarters.forEach((_, i) => { ws.getColumn(i + 2).width = 13; });

  const hRow = ws.addRow(["Alloy / Grade", ...quarters]);
  hRow.height = 22;
  hRow.eachCell((cell) => {
    styleCell(cell, {
      fillArgb: PAL.NAVY, fontOpts: navyFont(10, true),
      border: hdrBorder(), align: center,
    });
  });

  const allRows = [...alloys, "SCRAP"];
  allRows.forEach((a, ri) => {
    const isScrap = a === "SCRAP";
    const row = ws.addRow([a, ...quarters.map((q) => rm[a]?.[q] ?? null)]);
    row.height = 18;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const isFirst = colNumber === 1;
      styleCell(cell, {
        fillArgb: isScrap ? PAL.SCRAP_FILL : ri % 2 === 0 ? PAL.ALT_ROW : PAL.WHITE,
        fontOpts: darkFont(10, isFirst || isScrap),
        border: thinBorder(),
        align: isFirst ? left : right,
        numFmt: colNumber > 1 ? '#,##0.00' : undefined,
      });
    });
  });

  ws.getColumn(1).width = 20;
}

// ─── Cover / Amendment sheet ──────────────────────────────────────────────────

function addCoverSheet(
  wb: ExcelJS.Workbook,
  prevQ: string, newQ: string,
  amendmentReason: string,
  partsCount: number,
) {
  const ws = wb.addWorksheet("Amendment");
  ws.getColumn(1).width = 32;
  ws.getColumn(2).width = 40;

  const title = ws.addRow(["RM Price Amendment — Quarterly Recompute"]);
  ws.mergeCells(`A1:B1`);
  styleCell(title.getCell(1), { fillArgb: PAL.NAVY, fontOpts: navyFont(14, true), align: center });
  title.height = 32;

  const lines: [string, string][] = [
    ["", ""],
    ["Amendment Reason", amendmentReason || "—"],
    ["From Quarter", prevQ],
    ["To Quarter", newQ],
    ["Parts in Scope", String(partsCount)],
    ["Generated On", new Date().toLocaleString("en-IN")],
    ["", ""],
    ["FORMULA REFERENCE", ""],
    ["Melt Loss",             "= Cast Wt × 1.06"],
    ["Scrap Wt",              "= MAX(Cast Wt − Mach Wt, 0)"],
    ["Eff Scrap Wt",          "= IF(AS CAST, 0, Scrap Wt)"],
    ["RM Base",               "= VLOOKUP(Alloy, RM Index, Quarter Column, 0)"],
    ["RM Impact",             "= (New RM Base − Prev RM Base) × Melt Loss"],
    ["New Scrap (auto)",      "= (Old Scrap ÷ Old SCM14) × New SCM14"],
    ["Scrap Deduction",       "= (New Scrap − Prev Scrap) × Eff Scrap Wt × 0.8"],
    ["New Price",             "= Old Price + RM Impact − Scrap Deduction"],
  ];
  lines.forEach(([k, v], i) => {
    const row = ws.addRow([k, v]);
    row.height = 18;
    const isSection = k === "FORMULA REFERENCE";
    const isBlank = !k && !v;
    if (isBlank) return;
    styleCell(row.getCell(1), {
      fillArgb: isSection ? PAL.NAVY_MED : i < 7 ? PAL.STEEL : PAL.GRAY_FILL,
      fontOpts: isSection ? navyFont(10, true) : darkFont(10, i < 7),
      border: thinBorder(), align: left,
    });
    styleCell(row.getCell(2), {
      fillArgb: isSection ? PAL.NAVY_MED : PAL.WHITE,
      fontOpts: isSection ? navyFont(10, false) : darkFont(10, false),
      border: thinBorder(), align: left,
    });
  });
}

// ─── Core styled calc sheet ───────────────────────────────────────────────────

function addStyledCalcSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  rows: CalcRow[],
  grnQty: Record<string, number>,
  alloys: string[],
  quarters: string[],
  prevQ: string, newQ: string,
  vendorLabel: string,
) {
  const ws = wb.addWorksheet(sheetName);

  for (let c = 1; c <= TOTAL_COLS; c++) {
    ws.getColumn(c).width = COL_WIDTHS[c] ?? 12;
  }

  const titleRow = ws.addRow([`${vendorLabel}   •   ${prevQ}  →  ${newQ}   •   RM Price Derivation`]);
  ws.mergeCells(`A1:${LAST_COL}1`);
  titleRow.height = 28;
  styleCell(titleRow.getCell(1), {
    fillArgb: PAL.NAVY,
    fontOpts: { bold: true, color: { argb: PAL.WHITE }, size: 13, name: "Calibri" },
    align: { vertical: "middle", horizontal: "center" },
  });

  const byId = new Map(rows.map((r) => [r.part.id, r]));
  let grnTotal = 0;
  for (const [id, qty] of Object.entries(grnQty)) {
    const r = byId.get(id);
    if (!r || !qty) continue;
    const old = r.oldPrice ?? null, np = r.newPrice ?? null;
    if (old != null && np != null) grnTotal += (np - old) * qty;
  }
  const grnTotalLakh = (grnTotal / 100000).toFixed(2);

  const totalRow = ws.addRow([
    "Total Quarterly GRN Impact (₹ Lakhs)",
    ...Array(TOTAL_COLS - 2).fill(null),
    null,
  ]);
  ws.mergeCells(`A2:L2`);
  ws.mergeCells(`M2:${LAST_COL}2`);
  totalRow.height = 22;

  styleCell(totalRow.getCell(1), {
    fillArgb: PAL.NAVY_MED,
    fontOpts: { bold: true, color: { argb: PAL.WHITE }, size: 11, name: "Calibri" },
    align: { vertical: "middle", horizontal: "right" },
    border: thinBorder(),
  });
  const totalValCell = totalRow.getCell(13); // M2
  totalValCell.value = parseFloat(grnTotalLakh);
  styleCell(totalValCell, {
    fillArgb: grnTotal >= 0 ? PAL.TOTAL_BG : PAL.RED_FILL,
    fontOpts: { bold: true, color: { argb: grnTotal >= 0 ? "FF375623" : "FF9C0006" }, size: 12, name: "Calibri" },
    align: center,
    numFmt: '#,##0.00" L"',
    border: { ...thinBorder(), bottom: { style: "medium", color: { argb: PAL.BORDER_MED } } },
  });

  const hdrValues = Array.from({ length: TOTAL_COLS }, (_, i) =>
    (HEADER_LABELS[i + 1] ?? (() => ""))(prevQ, newQ)
  );
  const hdrRow = ws.addRow(hdrValues);
  hdrRow.height = 36;
  hdrRow.eachCell({ includeEmpty: true }, (cell, c) => {
    styleCell(cell, {
      fillArgb: PAL.NAVY_MED,
      fontOpts: navyFont(9, true),
      border: hdrBorder(),
      align: { vertical: "middle", horizontal: c > 5 ? "center" : "left", wrapText: true },
    });
  });

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: TOTAL_COLS } };
  ws.views = [{ state: "frozen", xSplit: 4, ySplit: 3, showGridLines: false }];

  const prevQColIdx = quarters.indexOf(prevQ) + 2;
  const newQColIdx  = quarters.indexOf(newQ)  + 2;
  const rmRange = `'RM Index'!$A:${colLetter(quarters.length)}`;

  rows.forEach((r, i) => {
    const rowNum = i + 4;
    const isAlt = i % 2 === 1;
    const baseArgb = isAlt ? PAL.ALT_ROW : PAL.WHITE;

    const castWt = r.part.castWt;
    const machWt = r.part.machiningWt;
    const asCast = r.part.asCast;
    const eScrap = r.effectiveScrapWt;
    const meltLoss = r.meltingLoss;
    const oldPrice = r.oldPrice ?? null;
    const newPrice = r.newPrice ?? null;
    const delta = oldPrice != null && newPrice != null ? newPrice - oldPrice : null;
    const deltaPct = oldPrice && delta != null ? delta / oldPrice : null;
    const rmImpact = r.rmImpact ?? null;
    const scrapDed = r.scrapDeduction ?? 0;

    const rowFill = delta == null ? baseArgb : delta > 0.005 ? (isAlt ? "FFFFE8E8" : PAL.RED_FILL) :
                    delta < -0.005 ? (isAlt ? "FFE8F8EE" : PAL.GREEN_FILL) : baseArgb;

    const F = `F${rowNum}`, G = `G${rowNum}`, K = `K${rowNum}`;
    const L = `L${rowNum}`, M = `M${rowNum}`, N = `N${rowNum}`;
    const O = `O${rowNum}`, P = `P${rowNum}`, Q = `Q${rowNum}`;
    const Rc = `R${rowNum}`, S = `S${rowNum}`, T = `T${rowNum}`;
    const U = `U${rowNum}`, I = `I${rowNum}`;

    const cellVals: Record<number, unknown> = {
      [COL.SNO]:  i + 1,
      [COL.CC]:   { formula: `H${rowNum}&D${rowNum}`, result: cc(r.part) },
      [COL.VEN]:  r.part.vendorCode ?? "",
      [COL.PART]: r.part.partNumber,
      [COL.DESC]: r.part.description,
      [COL.CAST]: castWt,
      [COL.MACH]: machWt,
      [COL.PLANT]:r.part.plant,
      [COL.ALLY]: r.part.alloy,
      [COL.PO]:   r.part.poNum ?? "",
      [COL.MELT]: { formula: `${F}*1.06`, result: meltLoss },
      [COL.OLDP]: oldPrice,
      [COL.PRMB]: { formula: `IFERROR(VLOOKUP(${I},${rmRange},${prevQColIdx},0),"")`, result: r.prevBase ?? "" },
      [COL.NRMB]: { formula: `IFERROR(VLOOKUP(${I},${rmRange},${newQColIdx},0),"")`, result: r.newBase ?? "" },
      [COL.RMIP]: { formula: `IF(AND(ISNUMBER(${M}),ISNUMBER(${N})),(${N}-${M})*${K},"")`, result: rmImpact ?? "" },
      [COL.ESCP]: { formula: asCast ? `0` : `MAX(${F}-${G},0)`, result: eScrap },
      [COL.PSCR]: { formula: `IFERROR(VLOOKUP("SCRAP",${rmRange},${prevQColIdx},0),"")`, result: r.prevScrap ?? "" },
      [COL.NSCR]: { formula: `IFERROR(VLOOKUP("SCRAP",${rmRange},${newQColIdx},0),"")`, result: r.newScrap ?? "" },
      [COL.SDED]: { formula: `IF(AND(ISNUMBER(${Q}),ISNUMBER(${Rc}),${P}>0),(${Rc}-${Q})*${P}*0.8,0)`, result: scrapDed },
      [COL.NEWP]: { formula: `IF(ISNUMBER(${O}),${L}+${O}-${S},"")`, result: newPrice ?? "" },
      [COL.DELR]: { formula: `IF(ISNUMBER(${T}),${T}-${L},"")`, result: delta ?? "" },
      [COL.DELP]: { formula: `IF(AND(ISNUMBER(${U}),${L}>0),(${U})/${L},"")`, result: deltaPct ?? "" },
      [COL.NOTE]: r.note ?? "",
    };

    const row = ws.addRow([]);
    row.height = 18;

    for (let c = 1; c <= TOTAL_COLS; c++) {
      const cell = ws.getCell(rowNum, c);
      const val = cellVals[c];
      if (val !== undefined) cell.value = val as ExcelJS.CellValue;

      const numericCols = new Set([COL.CAST,COL.MACH,COL.MELT,COL.OLDP,COL.PRMB,COL.NRMB,
        COL.RMIP,COL.ESCP,COL.PSCR,COL.NSCR,COL.SDED,COL.NEWP,COL.DELR]);
      const isRight = c > COL.DESC && c !== COL.NOTE;
      const isNum = numericCols.has(c);
      const isDelta = c === COL.DELR;
      const isPct = c === COL.DELP;
      const isDesc = c === COL.DESC;

      styleCell(cell, {
        fillArgb: c === COL.DELR && delta != null
          ? (delta > 0.005 ? "FFFCE4D6" : delta < -0.005 ? "FFE2EFDA" : rowFill)
          : c === COL.NEWP ? (isAlt ? "FFE8F0FE" : "FFD9E6FB")
          : c === COL.PRMB || c === COL.NRMB ? (isAlt ? "FFEFF6FF" : "FFE8F2FF")
          : rowFill,
        fontOpts: {
          bold: c === COL.NEWP || c === COL.SNO,
          color: {
            argb: c === COL.DELR && delta != null
              ? (delta > 0.005 ? "FF9C0006" : delta < -0.005 ? "FF375623" : PAL.DARK_TEXT)
              : PAL.DARK_TEXT,
          },
          size: 9, name: "Calibri",
        },
        border: thinBorder(),
        align: isDesc ? { ...left, wrapText: false } : isRight ? right : left,
        numFmt: isPct ? "0.00%" : isNum || isDelta ? "#,##0.00" : undefined,
      });
    }
  });

  if (rows.length > 0) {
    const totalDataRow = ws.addRow([]);
    const tR = totalDataRow.number;
    ws.mergeCells(`A${tR}:K${tR}`);
    styleCell(ws.getCell(tR, 1), {
      fillArgb: PAL.NAVY_MED,
      fontOpts: navyFont(10, true),
      align: { vertical: "middle", horizontal: "right" },
      border: thinBorder(),
    });
    ws.getCell(tR, 1).value = "TOTALS";

    const sumCols: [number, string][] = [
      [COL.RMIP, "RM Impact"],
      [COL.SDED, "Scrap Ded"],
      [COL.DELR, "Δ ₹"],
    ];
    for (let c = 1; c <= TOTAL_COLS; c++) {
      const match = sumCols.find(([col]) => col === c);
      const cell = ws.getCell(tR, c);
      if (match) {
        const colLet = colLetter(c - 1);
        cell.value = { formula: `SUM(${colLet}4:${colLet}${tR - 1})`, result: 0 };
        styleCell(cell, {
          fillArgb: PAL.NAVY_LIGHT,
          fontOpts: navyFont(10, true),
          border: thinBorder(),
          align: right,
          numFmt: "#,##0.00",
        });
      } else if (c > 11 && c !== COL.NOTE) {
        styleCell(cell, { fillArgb: PAL.NAVY_MED, border: thinBorder() });
      }
    }
    totalDataRow.height = 20;
  }

  return ws;
}

// ─── GRN Impact sheet ─────────────────────────────────────────────────────────

const GRN_COLS = {
  SNO: 1, VEN: 2, PO: 3, PLANT: 4, PART: 5, DESC: 6, ALLOY: 7,
  OLD: 8, NEW: 9, DELTA: 10, QTY: 11, IMPACT: 12, LAKHS: 13,
};
const GRN_TOTAL = 13;

function addGrnSheet(
  wb: ExcelJS.Workbook,
  rows: CalcRow[],
  grnQty: Record<string, number>,
  prevQ: string, newQ: string,
) {
  const ws = wb.addWorksheet("GRN Impact");
  const colWidths = [5, 12, 10, 8, 15, 30, 10, 11, 11, 11, 12, 14, 14];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const lastGrnCol = colLetter(GRN_TOTAL - 1); // "M"
  const titleRow = ws.addRow([`GRN Impact  •  ${prevQ}  →  ${newQ}  •  Enter GRN Qty in column K`]);
  ws.mergeCells(`A1:${lastGrnCol}1`);
  titleRow.height = 26;
  styleCell(titleRow.getCell(1), {
    fillArgb: PAL.NAVY,
    fontOpts: navyFont(12, true),
    align: center,
  });

  let totalImpact = 0, totalLakhs = 0;
  for (const r of rows) {
    const qty = grnQty[r.part.id] ?? 0;
    const old = r.oldPrice ?? null, np = r.newPrice ?? null;
    if (!qty || old == null || np == null) continue;
    const impact = (np - old) * qty;
    totalImpact += impact; totalLakhs += impact / 100000;
  }

  const sumRow = ws.addRow(["Total GRN Impact (₹ Lakhs)", ...Array(GRN_TOTAL - 2).fill(null)]);
  ws.mergeCells(`A2:J2`);
  ws.mergeCells(`K2:M2`);
  sumRow.height = 22;
  styleCell(sumRow.getCell(1), {
    fillArgb: PAL.NAVY_MED, fontOpts: navyFont(11, true),
    align: { vertical: "middle", horizontal: "right" }, border: thinBorder(),
  });
  const sumValCell = sumRow.getCell(11);
  sumValCell.value = parseFloat(totalLakhs.toFixed(2));
  styleCell(sumValCell, {
    fillArgb: totalLakhs >= 0 ? PAL.TOTAL_BG : PAL.RED_FILL,
    fontOpts: { bold: true, size: 12, name: "Calibri", color: { argb: totalLakhs >= 0 ? "FF375623" : "FF9C0006" } },
    align: center, numFmt: '#,##0.00" L"', border: thinBorder(),
  });

  const grnHeaders = [
    "S.No","Vendor","PO Num","Plant","Part #","Description","Alloy",
    `Old Price\n(${prevQ})`,`New Price\n(${newQ})`, "Δ ₹\n=New−Old",
    "GRN Qty\n← enter here",
    "Impact (₹)\n=(New−Old)×Qty",
    "Impact\n(₹ Lakhs)",
  ];
  const hRow = ws.addRow(grnHeaders);
  hRow.height = 36;
  hRow.eachCell((cell, c) => {
    styleCell(cell, {
      fillArgb: c === GRN_COLS.QTY ? PAL.NAVY_LIGHT : PAL.NAVY_MED,
      fontOpts: navyFont(9, true),
      border: hdrBorder(),
      align: { vertical: "middle", horizontal: c > 7 ? "center" : c > 1 ? "left" : "center", wrapText: true },
    });
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: GRN_TOTAL } };
  ws.views = [{ state: "frozen", xSplit: 5, ySplit: 3, showGridLines: false }];

  rows.forEach((r, i) => {
    const rowNum = i + 4;
    const isAlt = i % 2 === 1;
    const qty = grnQty[r.part.id] ?? null;
    const old = r.oldPrice ?? null, np = r.newPrice ?? null;
    const delta = old != null && np != null ? np - old : null;
    const impact = delta != null && qty ? delta * qty : null;

    const H = `H${rowNum}`, I = `I${rowNum}`;
    const J = `J${rowNum}`, K = `K${rowNum}`, L = `L${rowNum}`;

    const row = ws.addRow([]);
    row.height = 18;

    const vals: Record<number, unknown> = {
      [GRN_COLS.SNO]:   i + 1,
      [GRN_COLS.VEN]:   r.part.vendorCode ?? "",
      [GRN_COLS.PO]:    r.part.poNum ?? "",
      [GRN_COLS.PLANT]: r.part.plant,
      [GRN_COLS.PART]:  r.part.partNumber,
      [GRN_COLS.DESC]:  r.part.description,
      [GRN_COLS.ALLOY]: r.part.alloy,
      [GRN_COLS.OLD]:   old,
      [GRN_COLS.NEW]:   np,
      [GRN_COLS.DELTA]: { formula: `IF(AND(ISNUMBER(${H}),ISNUMBER(${I})),${I}-${H},"")`, result: delta ?? "" },
      [GRN_COLS.QTY]:   qty ?? null,
      [GRN_COLS.IMPACT]:{ formula: `IF(AND(ISNUMBER(${J}),ISNUMBER(${K})),(${I}-${H})*${K},"")`, result: impact ?? "" },
      [GRN_COLS.LAKHS]: { formula: `IF(ISNUMBER(${L}),${L}/100000,"")`, result: impact != null ? impact / 100000 : "" },
    };

    for (let c = 1; c <= GRN_TOTAL; c++) {
      const cell = ws.getCell(rowNum, c);
      const val = vals[c];
      if (val !== undefined) cell.value = val as ExcelJS.CellValue;

      const isQty = c === GRN_COLS.QTY;
      const isImpact = c === GRN_COLS.IMPACT;
      const isLakhs = c === GRN_COLS.LAKHS;
      const isDelta = c === GRN_COLS.DELTA;

      styleCell(cell, {
        fillArgb: isQty ? (isAlt ? "FFFDFFCD" : PAL.AMBER) :
                  isImpact || isLakhs ? (isAlt ? "FFE8F5E9" : "FFD4EDDA") :
                  isAlt ? PAL.ALT_ROW : PAL.WHITE,
        fontOpts: { size: 9, name: "Calibri", bold: isLakhs,
          color: { argb: isImpact || isLakhs || isDelta
            ? (delta != null && delta > 0 ? "FF9C0006" : delta != null && delta < 0 ? "FF375623" : PAL.DARK_TEXT)
            : PAL.DARK_TEXT },
        },
        border: thinBorder(),
        align: c > GRN_COLS.ALLOY ? right : c > 1 ? left : center,
        numFmt: isLakhs ? '#,##0.0000" L"' : (c >= GRN_COLS.OLD) ? "#,##0.00" : undefined,
      });
    }
  });

  const totalDataRow = ws.addRow([]);
  const tR = totalDataRow.number;
  ws.mergeCells(`A${tR}:J${tR}`);
  styleCell(ws.getCell(tR, 1), {
    fillArgb: PAL.NAVY_MED, fontOpts: navyFont(10, true),
    align: { vertical: "middle", horizontal: "right" }, border: thinBorder(),
  });
  ws.getCell(tR, 1).value = "GRAND TOTAL";
  [GRN_COLS.IMPACT, GRN_COLS.LAKHS].forEach((c) => {
    const colLet = colLetter(c - 1);
    const cell = ws.getCell(tR, c);
    cell.value = { formula: `SUM(${colLet}4:${colLet}${tR - 1})`, result: 0 };
    styleCell(cell, {
      fillArgb: PAL.NAVY_LIGHT, fontOpts: navyFont(10, true),
      border: thinBorder(), align: right,
      numFmt: c === GRN_COLS.LAKHS ? '#,##0.0000" L"' : "#,##0.00",
    });
  });
  styleCell(ws.getCell(tR, GRN_COLS.QTY), { fillArgb: PAL.NAVY_MED, border: thinBorder() });
  totalDataRow.height = 20;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function downloadCalcExport(
  parts: POCalc[],
  rows: CalcRow[],
  rm: RmIndex,
  prevQ: string, newQ: string,
  header: { amendmentReason: string },
  quarters: string[],
  alloys: string[],
  grnQty: Record<string, number> = {},
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RM Price Calculator";
  wb.created = new Date();

  addCoverSheet(wb, prevQ, newQ, header.amendmentReason, parts.length);
  addRmSheet(wb, rm, alloys, quarters);

  const sortedRows = rows.slice().sort((a, b) =>
    vKey(a.part.vendorCode).localeCompare(vKey(b.part.vendorCode)) ||
    sortKey(a.part).localeCompare(sortKey(b.part))
  );

  addStyledCalcSheet(wb, "All Vendors", sortedRows, grnQty, alloys, quarters, prevQ, newQ, "All Vendors");

  for (const [vendor, vr] of groupByVendor(sortedRows.map(r => r.part)).map(([v, _]) => {
    const vr = sortedRows.filter(r => vKey(r.part.vendorCode) === v);
    return [v, vr] as [string, CalcRow[]];
  })) {
    const label = vendor === VENDOR_FALLBACK ? "No Vendor" : `Vendor ${vendor}`;
    addStyledCalcSheet(wb, sanitizeSheet(`V_${vendor}`), vr, grnQty, alloys, quarters, prevQ, newQ, label);
  }

  addGrnSheet(wb, sortedRows, grnQty, prevQ, newQ);

  const buf = await wb.xlsx.writeBuffer();
  const file = `price-calc-${prevQ}-to-${newQ}.xlsx`.replace(/'/g, "");
  saveBlob(file, buf as ArrayBuffer);
}

export async function downloadGrnTemplate(
  parts: POCalc[], rows: CalcRow[], grnQty: Record<string, number>,
  prevQ: string, newQ: string,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RM Price Calculator";
  addGrnSheet(wb, rows.slice().sort((a, b) =>
    vKey(a.part.vendorCode).localeCompare(vKey(b.part.vendorCode)) ||
    sortKey(a.part).localeCompare(sortKey(b.part))
  ), grnQty, prevQ, newQ);

  const buf = await wb.xlsx.writeBuffer();
  saveBlob(`grn-impact-${prevQ}-to-${newQ}.xlsx`.replace(/'/g, ""), buf as ArrayBuffer);
}

// ─── Simple XLSX-based helpers (no styling needed) ────────────────────────────

function saveXlsxBlob(filename: string, data: unknown) {
  let ab: ArrayBuffer;
  if (data instanceof ArrayBuffer) ab = data;
  else if (ArrayBuffer.isView(data)) {
    const v = data as ArrayBufferView;
    ab = v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
  } else throw new Error("saveXlsxBlob: unsupported type");
  const blob = new Blob([ab], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Master Data Templates Headers
export const PART_HEADERS = [
  "PartNo","Description","Alloy","CastWt","MachiningWt","AsCast(Y/N)",
] as const;

export const PO_HEADERS = [
  "PoNum","PartNo","VendorCode","Plant","BasePrice","BaseQuarter","GrnQty"
] as const;

export const VENDOR_HEADERS = [
  "VendorCode","Name"
] as const;

export const MATERIAL_HEADERS = [
  "Alloy","Category","Description"
] as const;

export function downloadPartsTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    [...PART_HEADERS],
    ["100275559","FLANGE (CASTING)","SCM 14",0.96,0.96,"Y"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Part Master");
  saveXlsxBlob("part-master-template.xlsx", XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

export function downloadPartsExport(parts: Part[]) {
  const wb = XLSX.utils.book_new();
  const allRows = parts.map((p) => [
    p.partNumber, p.description, p.alloy, p.castWt, p.machiningWt, p.asCast ? "Y" : "N"
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...PART_HEADERS], ...allRows]), "Part Master");
  saveXlsxBlob("parts-master.xlsx", XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

export function downloadPOsExport(pos: PO[]) {
  const wb = XLSX.utils.book_new();
  const allRows = pos.map((p) => [
    p.poNum, p.partNumber, p.vendorCode, p.plant, p.basePrice, p.baseQuarter, p.grnQty
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...PO_HEADERS], ...allRows]), "PO Master");
  saveXlsxBlob("po-master.xlsx", XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

// Flat parser remains for backwards compatibility, parsing 11 columns into combined POCalc records
export async function parsePartsExcel(file: File, defaultQuarter: string): Promise<POCalc[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  const out: POCalc[] = [];
  for (const r of rows) {
    // Detect flat format or normalized format
    const partNumber = String(r["PartNo"] ?? r["Part Number"] ?? r["PartNo"] ?? "").trim();
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
    
    // Read PO fields if present, else fallback
    const plant = String(r["Plant"] ?? "1020");
    const vendorCode = String(r["VendorCode"] ?? r["Vendor Code"] ?? "250043").trim();
    const poNum = String(r["PoNum"] ?? r["PO Num"] ?? `PO-${Date.now()}`).trim();
    const basePrice = Number(r["BasePrice"] ?? r["Base Price"] ?? 0) || 0;
    const baseQuarter = String(r["BaseQuarter"] ?? r["Base Quarter"] ?? defaultQuarter);
    const grnQty = Number(r["GrnQty"] ?? r["GRN Qty"] ?? 0) || 0;

    out.push({
      id: `po-${Date.now()}-${out.length}-${Math.random().toString(36).slice(2, 6)}`,
      poNum,
      partNumber,
      vendorCode,
      plant,
      basePrice,
      baseQuarter,
      grnQty,
      description: String(r["Description"] ?? ""),
      alloy: String(r["Alloy"] ?? "SCM 14"),
      castWt,
      machiningWt: +mach.toFixed(4),
      asCast: endsIn0or6(partNumber) ? true : userAsCast,
    });
  }
  return out;
}

export function downloadRmTemplate(rm?: RmIndex, alloys?: string[], quarters?: string[]) {
  const rmAlloys = alloys ?? (rm ? Object.keys(rm).filter(k => k !== "SCRAP") : ["SCM 14","ADC 12"]);
  const rmRows = [...rmAlloys, "SCRAP"];
  const qtrs = quarters ?? (rm ? Object.keys(rm[rmAlloys[0]] ?? {}) : ["Q1'26 MAR","Q2'26"]);
  const hdr = ["Alloy / Grade", ...qtrs];
  const body = rmRows.map((a) => [a, ...qtrs.map((q) => rm?.[a]?.[q] ?? "")]);
  const ws = XLSX.utils.aoa_to_sheet([hdr, ...body]);
  const wbx = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbx, ws, "RM Index");
  saveXlsxBlob(rm ? "rm-index.xlsx" : "rm-index-template.xlsx",
    XLSX.write(wbx, { type: "array", bookType: "xlsx" }));
}

export async function parseRmExcel(file: File): Promise<RmIndex> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (!aoa.length) return {};
  const headerRow = aoa[0] as string[];
  const qs = headerRow.slice(1).map((q) => String(q).trim());
  const out: RmIndex = {};
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] as unknown[];
    const alloy = String(row[0] ?? "").trim();
    if (!alloy) continue;
    out[alloy] = out[alloy] ?? {};
    qs.forEach((q, idx) => {
      const v = row[idx + 1];
      if (v === "" || v == null) return;
      const n = Number(v);
      if (!Number.isNaN(n)) out[alloy][q] = n;
    });
  }
  return out;
}

export function downloadHistoryExport(
  parts: POCalc[],
  history: Record<string, Record<string, number | null>>,
  quarters: string[],
) {
  const hdr = ["CC","PO Num","Vendor Code","Part Number","Description","Plant","Alloy", ...quarters];
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
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([hdr, ...bodyAll]), "All Vendors");
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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([hdr, ...body]),
      sanitizeSheet(`V_${vendor}`));
  }
  saveXlsxBlob("price-history.xlsx", XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

export function grnKey(p: Pick<POCalc, 'vendorCode' | 'poNum' | 'plant' | 'partNumber'>) {
  return `${p.vendorCode ?? ""}|${p.poNum ?? ""}|${p.plant}|${p.partNumber}`;
}

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

export { derivedScrapWt };
