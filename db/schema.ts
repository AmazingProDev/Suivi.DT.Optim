import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const actionUpdates = sqliteTable("action_updates", {
  sourceId: text("source_id").primaryKey(),
  status: text("status").notNull().default("Non renseigné"),
  priority: text("priority").notNull().default("À évaluer"),
  owner: text("owner").notNull().default(""),
  dueDate: text("due_date").notNull().default(""),
  validation: text("validation").notNull().default("Non renseignée"),
  note: text("note").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
