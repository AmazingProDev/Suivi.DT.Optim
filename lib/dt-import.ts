import * as XLSX from "xlsx";
import type { DashboardSource } from "./dashboard";

type Cell = string | number | boolean | Date | null | undefined;

const WORKFLOW = { status: "Non renseigné", priority: "À évaluer", owner: "", dueDate: "", validation: "Non renseignée" };
const MEASUREMENT_TYPES = ["Voix libre", "Voix Volte", "Data libre"] as const;

function text(value: Cell) { return String(value ?? "").trim(); }
function number(value: Cell) { const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0; }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }

function isoDate(value: Cell) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return XLSX.SSF.format("yyyy-mm-dd", value);
  const parsed = new Date(text(value));
  return Number.isNaN(parsed.valueOf()) ? "" : parsed.toISOString().slice(0, 10);
}

function vendorFrom(value: string, fileName: string) {
  const candidate = `${value} ${fileName}`.toLowerCase();
  if (candidate.includes("ericsson")) return "Ericsson";
  if (candidate.includes("huawei")) return "Huawei";
  return "Nokia";
}

function measurementType(value: string) {
  const candidate = normalize(value);
  if (candidate.includes("volte")) return "Voix Volte";
  if (candidate.includes("data")) return "Data libre";
  return candidate.includes("voix") ? "Voix libre" : "";
}

function responsibility(value: string) {
  const candidate = normalize(value);
  const parts = [
    candidate.includes("ingenier") ? "Ingénierie" : "",
    candidate.includes("maint") ? "Maintenance" : "",
    candidate.includes("optim") ? "Optimisation" : "",
    candidate.includes("deploi") ? "Déploiement" : "",
    candidate.includes("ras") ? "RAS" : "",
  ].filter(Boolean);
  return parts.join(" + ");
}

function issueFamilies(value: string) {
  const candidate = normalize(value);
  return [
    candidate.includes("coupure") ? "Coupure" : "",
    candidate.includes("echec") ? "Échec" : "",
    candidate.includes("couverture") ? "Couverture" : "",
    candidate.includes("qualite") ? "Qualité" : "",
  ].filter(Boolean);
}

function splitAnalysis(value: string) {
  const [, analysis = ""] = value.split(/analyse\s*:/i);
  const [beforeAction = "", action = ""] = analysis.split(/action\s*:/i);
  return { analysis: beforeAction.trim(), action: action.trim() };
}

function resolveRoute(raw: string, routes: string[]) {
  const key = normalize(raw.replace(/^autoroute/, ""));
  return routes.find((route) => normalize(route.replace(/^autoroute/, "")) === key) ?? raw;
}

export type ImportedDataset = DashboardSource & { importSummary: { files: string[]; importedAt: string } };

export async function importDtWorkbooks(files: File[]): Promise<ImportedDataset> {
  if (!files.length) throw new Error("Sélectionnez au moins un fichier Excel.");
  const situationActions: DashboardSource["situationActions"] = [];
  const situationAnomalies: DashboardSource["situationAnomalies"] = [];
  const rawParcours: Array<{ vendor: string; highway: string; mappingMycom: string; date: string; sourceFile: string; sourceRow: number }> = [];
  const actions: DashboardSource["actions"] = [];
  const failures: string[] = [];

  for (const file of files) {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const situationName = workbook.SheetNames.find((name) => normalize(name).includes("situation"));
      if (!situationName) throw new Error("feuille Situation introuvable");
      const rows = XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[situationName], { header: 1, defval: null, raw: true });
      const groups = rows[0] ?? [];
      const headers = rows[1] ?? [];
      const fileVendor = vendorFrom("", file.name);
      const routeNames: string[] = [];

      rows.slice(2).forEach((row, index) => {
        const highway = text(row[0]);
        const date = isoDate(row[3]);
        if (!highway || !date) return;
        const vendor = fileVendor;
        routeNames.push(highway);
        rawParcours.push({ vendor, highway, mappingMycom: text(row[2]), date, sourceFile: file.name, sourceRow: index + 3 });
        let activeType = "";
        for (let column = 4; column < Math.max(groups.length, headers.length, row.length); column += 1) {
          activeType = measurementType(text(groups[column])) || activeType;
          if (!MEASUREMENT_TYPES.includes(activeType as typeof MEASUREMENT_TYPES[number])) continue;
          const header = normalize(text(headers[column]));
          const count = number(row[column]);
          if (!count) continue;
          if (header.includes("degrad") || header.includes("coupure") || header.includes("echec")) situationAnomalies.push({ vendor, highway, measurementDate: date, testFamily: activeType, count, sourceFile: file.name, sourceRow: index + 3 });
          const owner = responsibility(text(headers[column]));
          if (column >= 11 && owner) situationActions.push({ vendor, highway, measurementDate: date, testFamily: activeType, responsibility: owner, count, sourceFile: file.name, sourceRow: index + 3, sourceColumn: column + 1 });
        }
      });

      const detailedName = workbook.SheetNames.find((name) => normalize(name).includes("traitement") || normalize(name).includes("degradation"));
      if (!detailedName) continue;
      const detailedRows = XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[detailedName], { header: 1, defval: null, raw: true });
      detailedRows.slice(1).forEach((row, index) => {
        const highwayRaw = text(row[4]);
        const date = isoDate(row[2]);
        if (!highwayRaw || !date) return;
        const vendor = vendorFrom(text(row[0]), file.name);
        const rawAnalysisAction = text(row[14]);
        const analysisAction = splitAnalysis(rawAnalysisAction);
        const rawQualification = text(row[15]);
        const actionType = responsibility(rawQualification);
        const routeCandidates = rawParcours.filter((item) => item.vendor === vendor).map((item) => item.highway);
        const highway = resolveRoute(highwayRaw, routeCandidates.length ? routeCandidates : routeNames);
        actions.push({
          id: `${vendor.slice(0, 3).toUpperCase()}-${String(actions.length + 1).padStart(4, "0")}`,
          vendor,
          sourceFile: file.name,
          sourceRow: index + 2,
          month: text(row[1]),
          measurementDate: date,
          testType: text(row[3]) || "Non renseigné",
          highway,
          highwayKey: normalize(highway),
          issueNature: text(row[5]),
          issueFamilies: issueFamilies(text(row[5])),
          description: text(row[6]),
          servingCell: text(row[7]),
          ci: text(row[8]),
          signalLevel: number(row[9]) || null,
          signalQuality: number(row[10]) || null,
          sinr: number(row[11]) || null,
          latitude: number(row[13]) || null,
          longitude: number(row[12]) || null,
          analysis: analysisAction.analysis,
          action: analysisAction.action,
          rawAnalysisAction,
          rawQualification,
          qualifications: actionType ? [actionType] : [],
          workflow: WORKFLOW,
          dataQualityFlags: [!text(row[3]) ? "Type de test manquant" : "", !actionType ? "Qualification manquante" : ""].filter(Boolean),
        });
      });
    } catch (error) {
      failures.push(`${file.name} : ${error instanceof Error ? error.message : "fichier illisible"}`);
    }
  }
  if (!rawParcours.length) throw new Error(failures.length ? failures.join(" · ") : "Aucune ligne de parcours valide n’a été trouvée dans Situation.");

  const grouped = new Map<string, typeof rawParcours>();
  for (const item of rawParcours) {
    const key = `${item.vendor}\u0000${item.highway}`;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  const parcours = [...grouped.entries()].map(([key, entries], index) => {
    const [vendor, highway] = key.split("\u0000");
    const sequence = [...new Set(entries.map((item) => item.date))].sort();
    const firstMeasurementDate = sequence[0];
    const qualificationDate = sequence.find((date) => date > firstMeasurementDate) ?? "";
    const declaredAnomalies = situationAnomalies.filter((item) => item.vendor === vendor && item.highway === highway).reduce((sum, item) => sum + item.count, 0);
    const detailedItems = actions.filter((item) => item.vendor === vendor && item.highway === highway).length;
    return {
      id: `PAR-${String(index + 1).padStart(3, "0")}`,
      vendor,
      highway,
      highwayKey: normalize(highway),
      mappingMycom: entries[0].mappingMycom,
      firstMeasurementDate,
      latestMeasurementDate: sequence.at(-1) ?? firstMeasurementDate,
      measurementSequence: sequence,
      passCount: sequence.length,
      qualificationDate,
      qualificationStatus: qualificationDate ? "Qualifié" : "À reprogrammer",
      declaredAnomalies,
      detailedItems,
      detailGap: detailedItems - declaredAnomalies,
    };
  });
  const total = <T extends { count: number }>(items: T[]) => items.reduce((sum, item) => sum + item.count, 0);
  const actionsByMeasurementType = Object.fromEntries(MEASUREMENT_TYPES.map((type) => [type, total(situationActions.filter((item) => item.testFamily === type))]));
  const anomaliesByMeasurementType = Object.fromEntries(MEASUREMENT_TYPES.map((type) => [type, total(situationAnomalies.filter((item) => item.testFamily === type))]));
  const byQualification = Object.fromEntries(["Non qualifié", ...new Set(actions.flatMap((item) => item.qualifications))].map((label) => [label, actions.filter((item) => label === "Non qualifié" ? !item.qualifications.length : item.qualifications.includes(label)).length]));
  const actionsByResponsibility = Object.fromEntries([...new Set(situationActions.map((item) => item.responsibility))].map((label) => [label, total(situationActions.filter((item) => item.responsibility === label))]));
  const vendors = Object.fromEntries([...new Set(parcours.map((item) => item.vendor))].map((vendor) => {
    const vendorParcours = parcours.filter((item) => item.vendor === vendor);
    return [vendor, { parcours: vendorParcours.length, measurementEvents: vendorParcours.reduce((sum, item) => sum + item.passCount, 0), qualifiedParcours: vendorParcours.filter((item) => item.qualificationStatus === "Qualifié").length, declaredAnomalies: total(situationAnomalies.filter((item) => item.vendor === vendor)), situationActions: total(situationActions.filter((item) => item.vendor === vendor)), detailedActions: actions.filter((item) => item.vendor === vendor).length }];
  }));
  return {
    parcours,
    situationActions,
    situationAnomalies,
    actions,
    sourceSummary: {
      workbooks: files.length,
      parcours: parcours.length,
      qualifiedParcours: parcours.filter((item) => item.qualificationStatus === "Qualifié").length,
      unqualifiedParcours: parcours.filter((item) => item.qualificationStatus !== "Qualifié").length,
      measurementEvents: parcours.reduce((sum, item) => sum + item.passCount, 0),
      declaredAnomalies: total(situationAnomalies),
      situationActions: total(situationActions),
      actionsByMeasurementType,
      anomaliesByMeasurementType,
      detailedActions: actions.length,
      actionsWithQualification: actions.filter((item) => item.qualifications.length).length,
      actionsWithoutWorkflowStatus: actions.length,
      actionsWithQualityFlags: actions.filter((item) => item.dataQualityFlags.length).length,
      vendors,
      actionsByResponsibility,
      byQualification,
    },
    importSummary: { files: files.map((file) => file.name), importedAt: new Date().toISOString() },
  } as ImportedDataset;
}
