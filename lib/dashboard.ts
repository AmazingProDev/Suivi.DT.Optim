import sourceData from "./source-data.json";

export type Vendor = "Tous" | "Nokia" | "Ericsson" | "Huawei";
export type MeasurementType = "Tous" | "Voix libre" | "Voix Volte" | "Data libre";

export type DashboardFilters = {
  vendor: Vendor;
  measurementType: MeasurementType;
  highway: string;
  responsibility: string;
};

export type SituationAction = (typeof sourceData.situationActions)[number];
export type SituationAnomaly = (typeof sourceData.situationAnomalies)[number];
export type Parcours = (typeof sourceData.parcours)[number];
export type DetailedAction = (typeof sourceData.actions)[number];

export type SituationDashboardView = {
  actions: SituationAction[];
  anomalies: SituationAnomaly[];
  parcours: Parcours[];
  passages: number;
  qualified: number;
  pending: number;
  qualificationRate: number;
  anomalyTotal: number;
  assignmentTotal: number;
  responsibilities: Array<{ label: string; value: number }>;
  measurementSeries: Array<{ type: string; anomalies: number; assignments: number }>;
  routeMeasurementSummary: Array<{ highway: string; measurementType: string; anomalies: number; assignments: number }>;
  vendorPipeline: Array<{ vendor: string; dt1: number; dt2: number; pending: number }>;
  matrix: Array<{ responsibility: string; counts: Record<string, number>; total: number }>;
};

export type SituationDrilldown = {
  responsibility: string;
  measurementType: string;
  rows: SituationAction[];
  situationTotal: number;
  detailedActions: DetailedAction[];
};

export const EMPTY_DASHBOARD_FILTERS: DashboardFilters = {
  vendor: "Tous",
  measurementType: "Tous",
  highway: "Tous",
  responsibility: "Tous",
};

export const MEASUREMENT_TYPES: MeasurementType[] = ["Voix libre", "Voix Volte", "Data libre"];

function baseMatch(item: { vendor: string; highway: string; testFamily?: string }, filters: DashboardFilters) {
  return (filters.vendor === "Tous" || item.vendor === filters.vendor)
    && (filters.highway === "Tous" || item.highway === filters.highway)
    && (filters.measurementType === "Tous" || item.testFamily === filters.measurementType);
}

export function filterSituationActions(filters: DashboardFilters) {
  return sourceData.situationActions.filter((item) => baseMatch(item, filters)
    && (filters.responsibility === "Tous" || item.responsibility === filters.responsibility));
}

export function filterSituationAnomalies(filters: DashboardFilters) {
  return sourceData.situationAnomalies.filter((item) => baseMatch(item, filters));
}

export function filterParcours(filters: DashboardFilters) {
  return sourceData.parcours.filter((item) => (filters.vendor === "Tous" || item.vendor === filters.vendor)
    && (filters.highway === "Tous" || item.highway === filters.highway));
}

function total<T extends { count: number }>(items: T[]) {
  return items.reduce((sum, item) => sum + item.count, 0);
}

export function buildDashboardView(filters: DashboardFilters): SituationDashboardView {
  const actions = filterSituationActions(filters);
  const anomalies = filterSituationAnomalies(filters);
  const parcours = filterParcours(filters);
  const responsibilityTotals: Record<string, number> = {};
  for (const item of actions) responsibilityTotals[item.responsibility] = (responsibilityTotals[item.responsibility] ?? 0) + item.count;

  const responsibilities = Object.entries(responsibilityTotals)
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value);
  const types = filters.measurementType === "Tous" ? MEASUREMENT_TYPES : [filters.measurementType];
  const measurementSeries = types.map((type) => ({
    type,
    anomalies: total(anomalies.filter((item) => item.testFamily === type)),
    assignments: total(actions.filter((item) => item.testFamily === type)),
  }));
  const routeMeasurementKeys = new Set([
    ...anomalies.map((item) => `${item.highway}\u0000${item.testFamily}`),
    ...actions.map((item) => `${item.highway}\u0000${item.testFamily}`),
  ]);
  const routeMeasurementSummary = [...routeMeasurementKeys].map((key) => {
    const [highway, measurementType] = key.split("\u0000");
    return {
      highway,
      measurementType,
      anomalies: total(anomalies.filter((item) => item.highway === highway && item.testFamily === measurementType)),
      assignments: total(actions.filter((item) => item.highway === highway && item.testFamily === measurementType)),
    };
  }).sort((left, right) => left.highway.localeCompare(right.highway, "fr")
    || MEASUREMENT_TYPES.indexOf(left.measurementType as MeasurementType) - MEASUREMENT_TYPES.indexOf(right.measurementType as MeasurementType));
  const vendors = filters.vendor === "Tous" ? ["Nokia", "Ericsson", "Huawei"] : [filters.vendor];
  const vendorPipeline = vendors.map((vendor) => {
    const vendorParcours = parcours.filter((item) => item.vendor === vendor);
    const qualified = vendorParcours.filter((item) => item.qualificationStatus === "Qualifié").length;
    return { vendor, dt1: vendorParcours.length, dt2: qualified, pending: vendorParcours.length - qualified };
  });
  const matrix = responsibilities.map(({ label }) => {
    const counts = Object.fromEntries(types.map((type) => [type, total(actions.filter((item) => item.responsibility === label && item.testFamily === type))]));
    return { responsibility: label, counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
  });
  const qualified = parcours.filter((item) => item.qualificationStatus === "Qualifié").length;

  return {
    actions,
    anomalies,
    parcours,
    passages: parcours.reduce((sum, item) => sum + item.passCount, 0),
    qualified,
    pending: parcours.length - qualified,
    qualificationRate: parcours.length ? Math.round((qualified / parcours.length) * 100) : 0,
    anomalyTotal: total(anomalies),
    assignmentTotal: total(actions),
    responsibilities,
    measurementSeries,
    routeMeasurementSummary,
    vendorPipeline,
    matrix,
  };
}

function detailedMeasurementMatches(testType: string, measurementType: string) {
  if (measurementType === "Voix Volte") return testType === "VoLTE" || testType === "CSFB";
  return testType === measurementType;
}

export function buildSituationDrilldown(filters: DashboardFilters, responsibility: string, measurementType: string): SituationDrilldown {
  const rows = sourceData.situationActions.filter((item) => baseMatch(item, {
    ...filters,
    measurementType: measurementType as MeasurementType,
  }) && item.responsibility === responsibility);
  const routeKeys = new Set(rows.map((item) => `${item.vendor}|${item.highway}`));
  const responsibilityParts = responsibility.split(" + ");
  const detailedActions = sourceData.actions.filter((item) => routeKeys.has(`${item.vendor}|${item.highway}`)
    && detailedMeasurementMatches(item.testType, measurementType)
    && responsibilityParts.every((part) => (item.qualifications as string[]).includes(part)));
  return { responsibility, measurementType, rows, situationTotal: total(rows), detailedActions };
}

export function latestMeasurementDate() {
  return sourceData.parcours.reduce((latest, item) => item.latestMeasurementDate > latest ? item.latestMeasurementDate : latest, "");
}

export function dashboardFilterCount(filters: DashboardFilters) {
  return Object.entries(filters).filter(([key, value]) => value !== "Tous" && !(key === "highway" && !value)).length;
}
