import type { Part, RmIndex } from "./pricing";

export const DEFAULT_QUARTERS = ["Q1'26 MAR", "Q2'26"];

export const DEFAULT_ALLOYS = ["SCM 14", "ADC 12", "JED 838", "JED 838 1", "LM 25", "Mazak", "M3", "M2"];

export const SEED_RM_INDEX: RmIndex = {
  "SCM 14":   { "Q1'26 MAR": 239, "Q2'26": 283 },
  "ADC 12":   { "Q1'26 MAR": 231, "Q2'26": 275 },
  "JED 838":  { "Q1'26 MAR": 241, "Q2'26": 287 },
  "JED 838 1":{ "Q1'26 MAR": 241, "Q2'26": 285 },
  "LM 25":    { "Q1'26 MAR": 248, "Q2'26": null },
  "Mazak":    { "Q1'26 MAR": 258, "Q2'26": null },
  "M3":       { "Q1'26 MAR": 253, "Q2'26": null },
  "M2":       { "Q1'26 MAR": 250, "Q2'26": null },
  "SCRAP":    { "Q1'26 MAR": 154, "Q2'26": null },
};

const raw: Array<Omit<Part, "id" | "asCast" | "machiningWt"> & { scrapWt: number }> = [
  { partNumber:"100275560", description:"FLANGE (CASTING)", plant:"1030", vendorCode:"250043", alloy:"SCM 14", castWt:0.96, scrapWt:0, basePrice:243.81, baseQuarter:"Q1'26 MAR", poNum:"" },
  { partNumber:"100275561", description:"FLANGE (ANODISING)", plant:"1080", vendorCode:"250043", alloy:"SCM 14", castWt:0.96, scrapWt:0.02, basePrice:291.8, baseQuarter:"Q1'26 MAR", poNum:"" },
  { partNumber:"100277021", description:"Cylinder Machining (PDC)", plant:"1020", vendorCode:"250043", alloy:"SCM 14", castWt:0.17, scrapWt:0.012, basePrice:85.23, baseQuarter:"Q1'26 MAR", poNum:"" },
  { partNumber:"100279631", description:"Flange (Machined)", plant:"1020", vendorCode:"250044", alloy:"SCM 14", castWt:0.715, scrapWt:0.038, basePrice:230.63, baseQuarter:"Q1'26 MAR", poNum:"" },
  { partNumber:"100336760", description:"Top Cover (Casting)", plant:"1080", vendorCode:"250044", alloy:"ADC 12", castWt:0.11, scrapWt:0.004, basePrice:45.73, baseQuarter:"Q1'26 MAR", poNum:"" },
  { partNumber:"100339471", description:"Top Cover - Machining", plant:"1030", vendorCode:"250044", alloy:"ADC 12", castWt:0.146, scrapWt:0, basePrice:54.53, baseQuarter:"Q1'26 MAR", poNum:"" },
  { partNumber:"100343611", description:"TOP COVER (MACHINING)", plant:"1080", vendorCode:"250045", alloy:"ADC 12", castWt:0.178, scrapWt:0.019, basePrice:85.65, baseQuarter:"Q1'26 MAR", poNum:"" },
  { partNumber:"100347280", description:"Top cover", plant:"1080", vendorCode:"250045", alloy:"ADC 12", castWt:0.11, scrapWt:0.004, basePrice:46.18, baseQuarter:"Q1'26 MAR", poNum:"" },
  { partNumber:"100632980", description:"Upper Body -Casting", plant:"1020", vendorCode:"250045", alloy:"ADC 12", castWt:0.518, scrapWt:0, basePrice:145.88, baseQuarter:"Q1'26 MAR", poNum:"" },
  { partNumber:"100632981", description:"Body Upper Part (PDC)", plant:"1080", vendorCode:"250046", alloy:"ADC 12", castWt:0.518, scrapWt:0.048, basePrice:206.42, baseQuarter:"Q1'26 MAR", poNum:"" },
];

export const SEED_PARTS: Part[] = raw.map((r, i) => ({
  id: `p${i + 1}`,
  partNumber: r.partNumber,
  description: r.description,
  plant: r.plant,
  vendorCode: r.vendorCode ?? "",
  alloy: r.alloy,
  castWt: r.castWt,
  machiningWt: Math.max(+(r.castWt - r.scrapWt).toFixed(4), 0),
  asCast: r.partNumber.endsWith("0") || r.partNumber.endsWith("6"),
  basePrice: r.basePrice,
  baseQuarter: r.baseQuarter,
  poNum: r.poNum ?? "",
}));
