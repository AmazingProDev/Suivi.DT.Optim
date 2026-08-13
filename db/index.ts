import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export async function ensureActionSchema() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS action_updates (
    source_id TEXT PRIMARY KEY NOT NULL,
    status TEXT NOT NULL DEFAULT 'Non renseigné',
    priority TEXT NOT NULL DEFAULT 'À évaluer',
    owner TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL DEFAULT '',
    validation TEXT NOT NULL DEFAULT 'Non renseignée',
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}
