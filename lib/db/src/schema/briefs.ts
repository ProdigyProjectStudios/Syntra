import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conversationsTable } from "./conversations";

export const briefsTable = pgTable("briefs", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().unique().references(() => conversationsTable.id, { onDelete: "cascade" }),
  objective: text("objective"),
  service: text("service"),
  proposedSolution: text("proposed_solution"),
  requirements: text("requirements"),
  integrations: text("integrations"),
  budget: text("budget"),
  timeline: text("timeline"),
  nextStep: text("next_step"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBriefSchema = createInsertSchema(briefsTable).omit({ id: true, updatedAt: true });
export type InsertBrief = z.infer<typeof insertBriefSchema>;
export type BriefRow = typeof briefsTable.$inferSelect;
