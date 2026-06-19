import { pgTable, text, serial, doublePrecision, boolean, jsonb, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Parts table
export const partsTable = pgTable("parts", {
  id: text("id").primaryKey(),
  partNumber: text("part_number").notNull(),
  description: text("description").notNull(),
  plant: text("plant").notNull(),
  vendorCode: text("vendor_code"),
  alloy: text("alloy").notNull(),
  castWt: doublePrecision("cast_wt").notNull(),
  machiningWt: doublePrecision("machining_wt").notNull(),
  asCast: boolean("as_cast").default(false).notNull(),
  basePrice: doublePrecision("base_price").notNull(),
  baseQuarter: text("base_quarter").notNull(),
  poNum: text("po_num"),
  grnQty: doublePrecision("grn_qty").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPartSchema = createInsertSchema(partsTable);
export const selectPartSchema = createSelectSchema(partsTable);
export type PartDb = typeof partsTable.$inferSelect;
export type InsertPartDb = typeof partsTable.$inferInsert;

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