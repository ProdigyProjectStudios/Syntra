import { pgTable, serial, integer, text, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { conversationsTable } from "./conversations";

/** Retry receipts: same request ID returns the original turn, never generates duplicate messages. */
export const turnsTable = pgTable("consultation_turns", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  requestId: text("request_id").notNull(),
  response: jsonb("response").notNull(),
}, table => [uniqueIndex("consultation_turn_request").on(table.conversationId, table.requestId)]);
