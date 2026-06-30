import type { Part, PO, Vendor, Material, RmIndex, PremiumConfig } from "./pricing";

export const DEFAULT_QUARTERS = ["Q1'26 MAR", "Q2'26", "Q3'26", "Q4'26"];

/** Alloys whose rates are entered directly from MMR base rates */
export const BASE_ALLOYS = ["LM6", "ADC12"];

/** All alloys shown in the RM Index (excluding SCRAP which is special) */
export const DEFAULT_ALLOYS = ["SCM 14", "ADC12", "LM6", "LM 25", "JED 838", "JED 838 1", "Mazak", "M3", "M2"];

/**
 * Premium rules: derived alloy = base alloy rate ± premium (fixed per alloy, not per quarter)
 * From the MMR-6 reference table:
 *   SCM14   = ADC12 + 8
 *   LM 25   = LM6  - 7.5
 *   JED 838 = ADC12 + 10   (JED-838-1)
 *   JED 838 1 = ADC12 + 12 (JED-029M2)
 */
export const SEED_PREMIUMS: PremiumConfig[] = [
  { alloy: "SCM 14",    baseAlloy: "ADC12", premium:  8   },
  { alloy: "LM 25",     baseAlloy: "LM6",   premium: -7.5 },
  { alloy: "JED 838",   baseAlloy: "ADC12", premium:  10  },
  { alloy: "JED 838 1", baseAlloy: "ADC12", premium:  12  },
  // Mazak, M3, M2 — manual entry only (no formula)
];

export const SEED_RM_INDEX: RmIndex = {
  // ── Base alloys (entered per quarter from MMR) ──────────────────────
  "ADC12":    { "Q1'26 MAR": 231, "Q2'26": 325, "Q3'26": null, "Q4'26": null },
  "LM6":      { "Q1'26 MAR": 298, "Q2'26": 360, "Q3'26": null, "Q4'26": null },

  // ── Derived alloys (auto-computed via premium rules) ─────────────────
  // Values below are legacy / will be overridden by applyPremiums()
  "SCM 14":   { "Q1'26 MAR": 239, "Q2'26": 333, "Q3'26": null, "Q4'26": null },
  "LM 25":    { "Q1'26 MAR": 290, "Q2'26": 352.5, "Q3'26": null, "Q4'26": null },
  "JED 838":  { "Q1'26 MAR": 241, "Q2'26": 335, "Q3'26": null, "Q4'26": null },
  "JED 838 1":{ "Q1'26 MAR": 243, "Q2'26": 337, "Q3'26": null, "Q4'26": null },

  // ── Manual alloys (no formula) ───────────────────────────────────────
  "Mazak":    { "Q1'26 MAR": 258, "Q2'26": null, "Q3'26": null, "Q4'26": null },
  "M3":       { "Q1'26 MAR": 253, "Q2'26": null, "Q3'26": null, "Q4'26": null },
  "M2":       { "Q1'26 MAR": 250, "Q2'26": null, "Q3'26": null, "Q4'26": null },

  // ── SCRAP (auto-calc from existing logic) ────────────────────────────
  "SCRAP":    { "Q1'26 MAR": 154, "Q2'26": null, "Q3'26": null, "Q4'26": null },
};

export const SEED_MATERIALS: Material[] = DEFAULT_ALLOYS.map((a) => ({
  alloy: a,
  category: "Aluminium Casting",
  description: `${a} alloy grade`,
}));

export const SEED_VENDORS: Vendor[] = [
  { vendorCode: "250043", name: "Vendor 250043" },
  { vendorCode: "250044", name: "Vendor 250044" },
  { vendorCode: "250045", name: "Vendor 250045" },
  { vendorCode: "250046", name: "Vendor 250046" },
];

const raw = [
  { partNumber:"100275560", description:"FLANGE (CASTING)",         plant:"1030", vendorCode:"250043", alloy:"SCM 14", castWt:0.96,  scrapWt:0,     basePrice:243.81, baseQuarter:"Q1'26 MAR", poNum:"PO-1001" },
  { partNumber:"100275561", description:"FLANGE (ANODISING)",        plant:"1080", vendorCode:"250043", alloy:"SCM 14", castWt:0.96,  scrapWt:0.02,  basePrice:291.8,  baseQuarter:"Q1'26 MAR", poNum:"PO-1002" },
  { partNumber:"100277021", description:"Cylinder Machining (PDC)",  plant:"1020", vendorCode:"250043", alloy:"SCM 14", castWt:0.17,  scrapWt:0.012, basePrice:85.23,  baseQuarter:"Q1'26 MAR", poNum:"PO-1003" },
  { partNumber:"100279631", description:"Flange (Machined)",         plant:"1020", vendorCode:"250044", alloy:"SCM 14", castWt:0.715, scrapWt:0.038, basePrice:230.63, baseQuarter:"Q1'26 MAR", poNum:"PO-1004" },
  { partNumber:"100336760", description:"Top Cover (Casting)",       plant:"1080", vendorCode:"250044", alloy:"ADC12",  castWt:0.11,  scrapWt:0.004, basePrice:45.73,  baseQuarter:"Q1'26 MAR", poNum:"PO-1005" },
  { partNumber:"100339471", description:"Top Cover - Machining",     plant:"1030", vendorCode:"250044", alloy:"ADC12",  castWt:0.146, scrapWt:0,     basePrice:54.53,  baseQuarter:"Q1'26 MAR", poNum:"PO-1006" },
  { partNumber:"100343611", description:"TOP COVER (MACHINING)",     plant:"1080", vendorCode:"250045", alloy:"ADC12",  castWt:0.178, scrapWt:0.019, basePrice:85.65,  baseQuarter:"Q1'26 MAR", poNum:"PO-1007" },
  { partNumber:"100347280", description:"Top cover",                 plant:"1080", vendorCode:"250045", alloy:"ADC12",  castWt:0.11,  scrapWt:0.004, basePrice:46.18,  baseQuarter:"Q1'26 MAR", poNum:"PO-1008" },
  { partNumber:"100632980", description:"Upper Body -Casting",       plant:"1020", vendorCode:"250045", alloy:"ADC12",  castWt:0.518, scrapWt:0,     basePrice:145.88, baseQuarter:"Q1'26 MAR", poNum:"PO-1009" },
  { partNumber:"100632981", description:"Body Upper Part (PDC)",     plant:"1080", vendorCode:"250046", alloy:"ADC12",  castWt:0.518, scrapWt:0.048, basePrice:206.42, baseQuarter:"Q1'26 MAR", poNum:"PO-1010" },
];

export const SEED_PARTS: Part[] = raw.map((r, i) => ({
  id: `p${i + 1}`,
  partNumber: r.partNumber,
  description: r.description,
  alloy: r.alloy,
  castWt: r.castWt,
  machiningWt: Math.max(+(r.castWt - r.scrapWt).toFixed(4), 0),
  asCast: r.partNumber.endsWith("0") || r.partNumber.endsWith("6"),
}));

export const SEED_POS: PO[] = raw.map((r, i) => ({
  id: `po${i + 1}`,
  poNum: r.poNum,
  partNumber: r.partNumber,
  vendorCode: r.vendorCode,
  plant: r.plant,
  basePrice: r.basePrice,
  baseQuarter: r.baseQuarter,
  grnQty: 0,
}));
