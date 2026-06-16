export type RmIndex = Record<string, Record<string, number | null>>;

export interface Part {
  id: string;
  partNumber: string;
  description: string;
  plant: string;
  vendorCode?: string;
  alloy: string;
  castWt: number;
  machiningWt: number;
  asCast: boolean;
  basePrice: number;
  baseQuarter: string;
  poNum?: string;
}

export interface CalcRow {
  part: Part;
  oldPrice: number | null;
  prevBase: number | null;
  newBase: number | null;
  prevScrap: number | null;
  newScrap: number | null;
  meltingLoss: number;
  scrapWt: number;
  effectiveScrapWt: number;
  rmImpact: number | null;
  scrapDeduction: number | null;
  newPrice: number | null;
  note?: string;
}

export function endsIn0or6(pn: string) {
  const s = String(pn).trim();
  return s.endsWith("0") || s.endsWith("6");
}
export function cc(p: Pick<Part, "plant" | "partNumber">) {
  return `${p.plant ?? ""}${p.partNumber ?? ""}`;
}
export function isAsCast(p: Part) { return endsIn0or6(p.partNumber) || p.asCast; }
export function isManualAsCast(p: Part) { return p.asCast && !endsIn0or6(p.partNumber); }
export function derivedScrapWt(p: Part): number {
  return Math.max(+(p.castWt - p.machiningWt).toFixed(4), 0);
}
export function effectiveScrapWt(p: Part): number {
  return isAsCast(p) ? 0 : derivedScrapWt(p);
}

function stepCalc(oldPrice: number, p: Part, rm: RmIndex, prevQ: string, newQ: string): CalcRow {
  const prevBase = rm[p.alloy]?.[prevQ] ?? null;
  const newBase  = rm[p.alloy]?.[newQ]  ?? null;
  const prevScrap = rm["SCRAP"]?.[prevQ] ?? null;
  const newScrap  = rm["SCRAP"]?.[newQ]  ?? null;

  const meltingLoss = +(p.castWt * 1.06).toFixed(4);
  const scrapWt = derivedScrapWt(p);
  const eScrap  = isAsCast(p) ? 0 : scrapWt;

  let rmImpact: number | null = null;
  if (prevBase != null && newBase != null) {
    rmImpact = +((newBase - prevBase) * meltingLoss).toFixed(4);
  }

  // Scrap deduction = (newScrap − prevScrap) × effectiveScrapWt × 0.8
  // (change in scrap recovery value; subtracted from new price)
  let scrapDeduction: number | null = 0;
  if (eScrap > 0 && prevScrap != null && newScrap != null) {
    scrapDeduction = +((newScrap - prevScrap) * eScrap * 0.8).toFixed(4);
  }

  let newPrice: number | null = null;
  if (rmImpact != null) {
    newPrice = +(oldPrice + rmImpact - (scrapDeduction ?? 0)).toFixed(2);
  }

  const missing: string[] = [];
  if (prevBase == null) missing.push(`${p.alloy} ${prevQ}`);
  if (newBase == null) missing.push(`${p.alloy} ${newQ}`);

  return {
    part: p, oldPrice, prevBase, newBase, prevScrap, newScrap,
    meltingLoss, scrapWt, effectiveScrapWt: eScrap,
    rmImpact, scrapDeduction, newPrice,
    note: missing.length ? `Missing RM: ${missing.join(", ")}` : undefined,
  };
}

export function calcPart(p: Part, rm: RmIndex, prevQ: string, newQ: string, allQuarters: string[]): CalcRow {
  const baseIdx = allQuarters.indexOf(p.baseQuarter);
  const prevIdx = allQuarters.indexOf(prevQ);
  if (baseIdx < 0 || prevIdx < 0) return stepCalc(p.basePrice, p, rm, prevQ, newQ);

  if (prevIdx < baseIdx) {
    const r = stepCalc(p.basePrice, p, rm, prevQ, newQ);
    return { ...r, oldPrice: null, newPrice: null,
      note: `SAP price starts at ${p.baseQuarter}; select prev ≥ ${p.baseQuarter}.` };
  }

  let oldPrice = p.basePrice;
  for (let i = baseIdx + 1; i <= prevIdx; i++) {
    const step = stepCalc(oldPrice, p, rm, allQuarters[i - 1], allQuarters[i]);
    if (step.newPrice == null) {
      return { ...step, oldPrice: null, newPrice: null,
        note: step.note ?? "Cannot chain (missing RM)." };
    }
    oldPrice = step.newPrice;
  }
  return stepCalc(oldPrice, p, rm, prevQ, newQ);
}

export function calcAll(parts: Part[], rm: RmIndex, prevQ: string, newQ: string, allQuarters: string[]): CalcRow[] {
  return parts.map((p) => calcPart(p, rm, prevQ, newQ, allQuarters));
}

export interface DerivStep {
  fromQ: string; toQ: string;
  oldPrice: number;
  prevBase: number | null; newBase: number | null;
  prevScrap: number | null; newScrap: number | null;
  meltingLoss: number; scrapWt: number;
  rmImpact: number | null; scrapDeduction: number;
  newPrice: number | null; note?: string;
}

export function deriveSeries(p: Part, rm: RmIndex, allQuarters: string[]): DerivStep[] {
  const out: DerivStep[] = [];
  const baseIdx = allQuarters.indexOf(p.baseQuarter);
  if (baseIdx < 0) return out;
  let oldPrice = p.basePrice;
  for (let i = baseIdx + 1; i < allQuarters.length; i++) {
    const r = stepCalc(oldPrice, p, rm, allQuarters[i - 1], allQuarters[i]);
    out.push({
      fromQ: allQuarters[i - 1], toQ: allQuarters[i],
      oldPrice, prevBase: r.prevBase, newBase: r.newBase,
      prevScrap: r.prevScrap, newScrap: r.newScrap,
      meltingLoss: r.meltingLoss, scrapWt: r.effectiveScrapWt,
      rmImpact: r.rmImpact, scrapDeduction: r.scrapDeduction ?? 0,
      newPrice: r.newPrice, note: r.note,
    });
    if (r.newPrice == null) break;
    oldPrice = r.newPrice;
  }
  return out;
}

export function computeHistory(p: Part, rm: RmIndex, allQuarters: string[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const baseIdx = allQuarters.indexOf(p.baseQuarter);
  if (baseIdx < 0) return out;
  out[p.baseQuarter] = p.basePrice;
  let cur = p.basePrice;
  for (let i = baseIdx + 1; i < allQuarters.length; i++) {
    const r = stepCalc(cur, p, rm, allQuarters[i - 1], allQuarters[i]);
    out[allQuarters[i]] = r.newPrice;
    if (r.newPrice == null) break;
    cur = r.newPrice;
  }
  return out;
}

export interface PartInconsistency {
  partNumber: string;
  field: "alloy" | "castWt" | "machiningWt";
  values: Array<{ value: string | number; ids: string[] }>;
}

export function findInconsistencies(parts: Part[]): PartInconsistency[] {
  const groups = new Map<string, Part[]>();
  for (const p of parts) {
    if (!p.partNumber) continue;
    const arr = groups.get(p.partNumber) ?? [];
    arr.push(p); groups.set(p.partNumber, arr);
  }
  const out: PartInconsistency[] = [];
  for (const [, arr] of groups) {
    if (arr.length < 2) continue;
    for (const field of ["alloy", "castWt", "machiningWt"] as const) {
      const byVal = new Map<string, string[]>();
      for (const p of arr) {
        const k = String(p[field]);
        const ids = byVal.get(k) ?? []; ids.push(p.id); byVal.set(k, ids);
      }
      if (byVal.size > 1) {
        out.push({
          partNumber: arr[0].partNumber, field,
          values: [...byVal.entries()].map(([v, ids]) => ({
            value: field === "alloy" ? v : Number(v), ids,
          })),
        });
      }
    }
  }
  return out;
}

export function inconsistentIds(parts: Part[]): Set<string> {
  const set = new Set<string>();
  for (const inc of findInconsistencies(parts)) {
    for (const v of inc.values) for (const id of v.ids) set.add(id);
  }
  return set;
}

/** Auto-compute new SCRAP from RM index: (oldScrap / oldSCM14) × newSCM14 */
export function computeAutoScrap(rm: RmIndex, prevQ: string, newQ: string): number | null {
  const oldScrap = rm["SCRAP"]?.[prevQ] ?? null;
  const oldScm14 = rm["SCM 14"]?.[prevQ] ?? null;
  const newScm14 = rm["SCM 14"]?.[newQ] ?? null;
  if (oldScrap == null || oldScm14 == null || newScm14 == null || oldScm14 === 0) return null;
  return +((oldScrap / oldScm14) * newScm14).toFixed(2);
}
