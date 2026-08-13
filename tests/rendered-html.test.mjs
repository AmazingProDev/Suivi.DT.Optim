import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);
const sourceData = JSON.parse(await readFile(new URL("lib/source-data.json", projectRoot), "utf8"));

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("renders the professional DT dashboard shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Suivi Parcours DT/);
  assert.match(html, /Tableau de bord opérationnel/);
  assert.match(html, /Vue d’ensemble/);
  assert.match(html, /Plan d’actions/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
});

test("locks the unfiltered Situation totals", () => {
  const passages = sourceData.parcours.reduce((sum, item) => sum + item.passCount, 0);
  const qualified = sourceData.parcours.filter((item) => item.qualificationStatus === "Qualifié").length;
  const anomalies = sourceData.situationAnomalies.reduce((sum, item) => sum + item.count, 0);
  const assignments = sourceData.situationActions.reduce((sum, item) => sum + item.count, 0);
  assert.deepEqual({ parcours: sourceData.parcours.length, passages, qualified, pending: sourceData.parcours.length - qualified, anomalies, assignments }, {
    parcours: 14, passages: 14, qualified: 0, pending: 14, anomalies: 281, assignments: 332,
  });
});

test("keeps anomalies and Situation assignments as separate measures", () => {
  const actionsByType = Object.fromEntries(["Voix libre", "Voix Volte", "Data libre"].map((type) => [type, sourceData.situationActions.filter((item) => item.testFamily === type).reduce((sum, item) => sum + item.count, 0)]));
  const anomaliesByType = Object.fromEntries(["Voix libre", "Voix Volte", "Data libre"].map((type) => [type, sourceData.situationAnomalies.filter((item) => item.testFamily === type).reduce((sum, item) => sum + item.count, 0)]));
  assert.deepEqual(actionsByType, { "Voix libre": 60, "Voix Volte": 171, "Data libre": 101 });
  assert.deepEqual(anomaliesByType, { "Voix libre": 64, "Voix Volte": 131, "Data libre": 86 });
  assert.equal(sourceData.situationActions.filter((item) => item.vendor === "Huawei").reduce((sum, item) => sum + item.count, 0), 243);
});

test("summarizes Situation by exact autoroute and measurement type", () => {
  const summarize = (highway, testFamily, rows) => rows
    .filter((item) => item.highway === highway && item.testFamily === testFamily)
    .reduce((sum, item) => sum + item.count, 0);
  assert.equal(summarize("Autoroute Rabat - DouarAtchane", "Voix Volte", sourceData.situationAnomalies), 19);
  assert.equal(summarize("Autoroute Rabat - DouarAtchane", "Voix Volte", sourceData.situationActions), 19);
  assert.equal(summarize("Autoroute Rabat - DouarAtchane", "Data libre", sourceData.situationAnomalies), 8);
  assert.equal(summarize("Autoroute Rabat - DouarAtchane", "Data libre", sourceData.situationActions), 14);
});

test("qualifies only an exact parcours with a strictly later measurement", () => {
  for (const parcours of sourceData.parcours) {
    const uniqueDates = [...new Set(parcours.measurementSequence)].sort();
    const expectedQualification = uniqueDates.find((date) => date > parcours.firstMeasurementDate) ?? "";
    assert.equal(parcours.qualificationDate, expectedQualification, parcours.highway);
    assert.equal(parcours.qualificationStatus === "Qualifié", Boolean(expectedQualification), parcours.highway);
  }
});

test("regression: Rabat - DouarAtchane Huawei has one DT on 06/08/2026", () => {
  const route = sourceData.parcours.find((item) => item.vendor === "Huawei" && item.highway === "Autoroute Rabat - DouarAtchane");
  assert.ok(route);
  assert.equal(route.firstMeasurementDate, "2026-08-06");
  assert.deepEqual(route.measurementSequence, ["2026-08-06"]);
  assert.equal(route.passCount, 1);
  assert.equal(route.qualificationStatus, "À reprogrammer");
});

test("dashboard implementation exposes cross filters and Situation drill-down", async () => {
  const [page, dashboard] = await Promise.all([
    readFile(new URL("app/page.tsx", projectRoot), "utf8"),
    readFile(new URL("lib/dashboard.ts", projectRoot), "utf8"),
  ]);
  assert.match(page, /Équipementier[\s\S]*Type de mesure[\s\S]*Parcours[\s\S]*Responsabilité/);
  assert.match(page, /openSituationCell/);
  assert.match(page, /showDetailedActions/);
  assert.match(page, /Autoroute × type de mesure/);
  assert.match(page, /routeMeasurementSummary/);
  assert.match(page, /aria-label="Filtres du dashboard"/);
  assert.match(dashboard, /export type DashboardFilters/);
  assert.match(dashboard, /export type SituationDashboardView/);
  assert.match(dashboard, /export function buildDashboardView/);
  assert.match(dashboard, /export function buildSituationDrilldown/);
  assert.match(dashboard, /routeMeasurementSummary/);
});
