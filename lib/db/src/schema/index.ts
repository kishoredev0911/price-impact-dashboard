import { pgTable, text, serial, doublePrecision, boolean, jsonb, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Materials table
export const materialsTable = pgTable("materials", {
  alloy: text("alloy").primaryKey(),
  category: text("category").default("Aluminium Casting").notNull(),
  description: text("description").default("").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMaterialSchema = createInsertSchema(materialsTable);
export const selectMaterialSchema = createSelectSchema(materialsTable);
export type MaterialDb = typeof materialsTable.$inferSelect;
export type InsertMaterialDb = typeof materialsTable.$inferInsert;

// Vendors table
export const vendorsTable = pgTable("vendors", {
  vendorCode: text("vendor_code").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVendorSchema = createInsertSchema(vendorsTable);
export const selectVendorSchema = createSelectSchema(vendorsTable);
export type VendorDb = typeof vendorsTable.$inferSelect;
export type InsertVendorDb = typeof vendorsTable.$inferInsert;

// Parts table (normalized)
export const partsTable = pgTable("parts", {
  id: text("id").primaryKey(),
  partNumber: text("part_number").unique().notNull(),
  description: text("description").notNull(),
  alloy: text("alloy").notNull().references(() => materialsTable.alloy),
  castWt: doublePrecision("cast_wt").notNull(),
  machiningWt: doublePrecision("machining_wt").notNull(),
  asCast: boolean("as_cast").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPartSchema = createInsertSchema(partsTable);
export const selectPartSchema = createSelectSchema(partsTable);
export type PartDb = typeof partsTable.$inferSelect;
export type InsertPartDb = typeof partsTable.$inferInsert;

// Purchase Orders (PO) table
export const posTable = pgTable("pos", {
  id: text("id").primaryKey(),
  poNum: text("po_num").notNull(),
  partNumber: text("part_number").notNull().references(() => partsTable.partNumber),
  vendorCode: text("vendor_code").notNull().references(() => vendorsTable.vendorCode),
  plant: text("plant").notNull(),
  basePrice: doublePrecision("base_price").notNull(),
  baseQuarter: text("base_quarter").notNull(),
  grnQty: doublePrecision("grn_qty").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPOSchema = createInsertSchema(posTable);
export const selectPOSchema = createSelectSchema(posTable);
export type PODb = typeof posTable.$inferSelect;
export type InsertPODb = typeof posTable.$inferInsert;

// RM Index table (alloy rates per quarter)
export const rmIndexTable = pgTable("rm_index", {
  alloy: text("alloy").notNull(),
  quarter: text("quarter").notNull(),
  value: doublePrecision("value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.alloy, table.quarter] })
]);

export const insertRmIndexSchema = createInsertSchema(rmIndexTable);
export const selectRmIndexSchema = createSelectSchema(rmIndexTable);
export type RmIndexDb = typeof rmIndexTable.$inferSelect;
export type InsertRmIndexDb = typeof rmIndexTable.$inferInsert;

// Settings table
export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  quarters: text("quarters").array().notNull(),
  alloys: text("alloys").array().notNull(),
  prevQ: text("prev_q").notNull(),
  newQ: text("new_q").notNull(),
  amendmentReason: text("amendment_reason").default("").notNull(),
  scrapOverride: jsonb("scrap_override").$type<Record<string, boolean>>().default({}).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSettingsSchema = createInsertSchema(settingsTable);
export const selectSettingsSchema = createSelectSchema(settingsTable);
export type SettingsDb = typeof settingsTable.$inferSelect;
export type InsertSettingsDb = typeof settingsTable.$inferInsert;