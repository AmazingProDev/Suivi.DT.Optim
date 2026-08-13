import { desc } from "drizzle-orm";
import { ensureActionSchema, getDb } from "../../../db";
import { actionUpdates } from "../../../db/schema";
import sourceData from "../../../lib/source-data.json";

const validIds = new Set(sourceData.actions.map((item) => item.id));
const statuses = new Set(["Non renseigné", "À lancer", "En cours", "Bloquée", "Terminée", "Validée"]);
const priorities = new Set(["À évaluer", "Basse", "Moyenne", "Haute", "Critique"]);
const validations = new Set(["Non renseignée", "À valider", "Rejetée", "Validée"]);

export async function GET() {
  try {
    await ensureActionSchema();
    const updates = await getDb().select().from(actionUpdates).orderBy(desc(actionUpdates.updatedAt));
    return Response.json({ updates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inattendue";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await ensureActionSchema();
    const payload = (await request.json()) as {
      sourceId?: string;
      status?: string;
      priority?: string;
      owner?: string;
      dueDate?: string;
      validation?: string;
      note?: string;
    };
    const sourceId = payload.sourceId?.trim() ?? "";
    if (!validIds.has(sourceId)) {
      return Response.json({ error: "Identifiant source invalide" }, { status: 400 });
    }

    const status = statuses.has(payload.status ?? "") ? payload.status! : "Non renseigné";
    const priority = priorities.has(payload.priority ?? "") ? payload.priority! : "À évaluer";
    const validation = validations.has(payload.validation ?? "") ? payload.validation! : "Non renseignée";
    const values = {
      sourceId,
      status,
      priority,
      owner: (payload.owner ?? "").trim().slice(0, 120),
      dueDate: (payload.dueDate ?? "").trim().slice(0, 10),
      validation,
      note: (payload.note ?? "").trim().slice(0, 1200),
      updatedAt: new Date().toISOString(),
    };

    const [update] = await getDb()
      .insert(actionUpdates)
      .values(values)
      .onConflictDoUpdate({
        target: actionUpdates.sourceId,
        set: values,
      })
      .returning();

    return Response.json({ update });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inattendue";
    return Response.json({ error: message }, { status: 500 });
  }
}
