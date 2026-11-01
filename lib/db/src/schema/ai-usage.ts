import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";

/** Shared counters only: never prompts, documents, cookies or model output. */
export const aiUsageWindowsTable = pgTable("ai_usage_windows", {
  key: text("key").primaryKey(),
  used: integer("used").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, table => [index("ai_usage_windows_expiry_idx").on(table.expiresAt)]);
