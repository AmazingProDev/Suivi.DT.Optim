"use client";

import { useEffect, useMemo, useState } from "react";
import sourceData from "../lib/source-data.json";
import {
  buildDashboardView,
  buildSituationDrilldown,
  dashboardFilterCount,
  EMPTY_DASHBOARD_FILTERS,
  latestMeasurementDate,
  MEASUREMENT_TYPES,
  type DashboardFilters,
  type MeasurementType,
  type SituationDrilldown,
  type Vendor,
} from "../lib/dashboard";

type Tab = "synthese" | "parcours" | "actions";
type Workflow = { status: string; priority: string; owner: string; dueDate: string; validation: string; note?: string; updatedAt?: string };
type ActionItem = (typeof sourceData.actions)[number] & { workflow: Workflow };

const statusOptions = ["Non renseigné", "À lancer", "En cours", "Bloquée", "Terminée", "Validée"];
const priorityOptions = ["À évaluer", "Basse", "Moyenne", "Haute", "Critique"];
const validationOptions = ["Non renseignée", "À valider", "Rejetée", "Validée"];
const vendors: Vendor[] = ["Tous", "Nokia", "Ericsson", "Huawei"];
const highways = [...new Set(sourceData.parcours.map((item) => item.highway))].sort((a, b) => a.localeCompare(b, "fr"));
const responsibilities = [...new Set(sourceData.situationActions.map((item) => item.responsibility))].sort((a, b) => a.localeCompare(b, "fr"));

function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function statusClass(value: string) {
  return `status status-${value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]+/g, "-")}`;
}

function vendorClass(value: string) { return `vendor-dot vendor-${value.toLowerCase()}`; }

function KpiButton({ label, value, detail, meta, tone, onClick }: { label: string; value: string | number; detail: string; meta: string; tone: string; onClick: () => void }) {
  return <button className={`kpi-card tone-${tone}`} onClick={onClick} title={meta} aria-label={`${label} : ${value}. ${meta}`}>
    <span className="kpi-top"><span className="kpi-label">{label}</span><span className="kpi-arrow">↗</span></span>
    <strong>{value}</strong><span className="kpi-detail">{detail}</span>
  </button>;
}

function EmptyChart() { return <div className="empty-chart">Aucune donnée dans ce périmètre</div>; }

export default function Home() {
  const [tab, setTab] = useState<Tab>("synthese");
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_DASHBOARD_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [qualification, setQualification] = useState("Toutes");
  const [routeQualification, setRouteQualification] = useState("Tous");
  const [status, setStatus] = useState("Tous");
  const [search, setSearch] = useState("");
  const [updates, setUpdates] = useState<Record<string, Workflow>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [situationDrilldown, setSituationDrilldown] = useState<SituationDrilldown | null>(null);
  const [drillActionIds, setDrillActionIds] = useState<Set<string> | null>(null);
  const [routeSummaryExpanded, setRouteSummaryExpanded] = useState(false);
  const [visibleRows, setVisibleRows] = useState(40);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [persistenceReady, setPersistenceReady] = useState(true);

  useEffect(() => {
    fetch("/api/actions").then(async (response) => {
      if (!response.ok) throw new Error("persistence unavailable");
      const body = await response.json() as { updates?: Array<Workflow & { sourceId: string }> };
      setUpdates(Object.fromEntries((body.updates ?? []).map((item: Workflow & { sourceId: string }) => [item.sourceId, item])));
    }).catch(() => setPersistenceReady(false));
  }, []);

  const dashboard = useMemo(() => buildDashboardView(filters), [filters]);
  const activeFilterCount = dashboardFilterCount(filters);
  const actions = useMemo<ActionItem[]>(() => sourceData.actions.map((item) => ({ ...item, workflow: updates[item.id] ?? item.workflow })), [updates]);
  const filteredActions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return actions.filter((item) => (filters.vendor === "Tous" || item.vendor === filters.vendor)
      && (qualification === "Toutes" || (qualification === "Non qualifié" ? item.qualifications.length === 0 : (item.qualifications as string[]).includes(qualification)))
      && (status === "Tous" || item.workflow.status === status)
      && (!drillActionIds || drillActionIds.has(item.id))
      && (!query || `${item.id} ${item.highway} ${item.servingCell} ${item.issueNature} ${item.action}`.toLocaleLowerCase("fr").includes(query)));
  }, [actions, drillActionIds, filters.vendor, qualification, search, status]);
  const filteredParcours = useMemo(() => sourceData.parcours.filter((item) => {
    const query = search.trim().toLocaleLowerCase("fr");
    return (filters.vendor === "Tous" || item.vendor === filters.vendor)
      && (filters.highway === "Tous" || item.highway === filters.highway)
      && (routeQualification === "Tous" || item.qualificationStatus === routeQualification)
      && (!query || `${item.highway} ${item.mappingMycom}`.toLocaleLowerCase("fr").includes(query));
  }), [filters.highway, filters.vendor, routeQualification, search]);
  const selected = selectedId ? actions.find((item) => item.id === selectedId) ?? null : null;
  const maxResponsibility = Math.max(1, ...dashboard.responsibilities.map((item) => item.value));
  const maxComparison = Math.max(1, ...dashboard.measurementSeries.flatMap((item) => [item.anomalies, item.assignments]));
  const visibleTypes = filters.measurementType === "Tous" ? MEASUREMENT_TYPES : [filters.measurementType];
  const visibleOperationalSummary = routeSummaryExpanded ? dashboard.operationalSummary : dashboard.operationalSummary.slice(0, 12);

  useEffect(() => {
    function closeDrawer(event: KeyboardEvent) {
      if (event.key === "Escape") { setSelectedId(null); setSituationDrilldown(null); }
    }
    window.addEventListener("keydown", closeDrawer);
    return () => window.removeEventListener("keydown", closeDrawer);
  }, []);

  function updateFilter<K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function openParcours(statusValue = "Tous") {
    setRouteQualification(statusValue); setSearch(""); setTab("parcours");
  }

  function openSituationCell(responsibility: string, measurementType: string) {
    setSituationDrilldown(buildSituationDrilldown(filters, responsibility, measurementType));
  }

  function applyOperationalScope(row: { vendor: string; highway: string; measurementType: string }, responsibility = "Tous") {
    setFilters((current) => ({ ...current, vendor: row.vendor as Vendor, highway: row.highway, measurementType: row.measurementType as MeasurementType, responsibility }));
  }

  function showDetailedActions(drilldown: SituationDrilldown) {
    setDrillActionIds(new Set(drilldown.detailedActions.map((item) => item.id)));
    setSearch(""); setSituationDrilldown(null); setTab("actions"); setVisibleRows(40);
  }

  async function saveWorkflow(next: Workflow) {
    if (!selected) return;
    setSaveState("saving"); setUpdates((current) => ({ ...current, [selected.id]: next }));
    try {
      const response = await fetch("/api/actions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId: selected.id, ...next }) });
      if (!response.ok) throw new Error("save failed");
      const body = await response.json() as { update: Workflow & { sourceId: string } };
      setUpdates((current) => ({ ...current, [selected.id]: body.update })); setSaveState("saved"); setPersistenceReady(true);
      window.setTimeout(() => setSaveState("idle"), 1800);
    } catch { setSaveState("error"); setPersistenceReady(false); }
  }

  function exportCsv() {
    const header = ["ID", "Équipementier", "Parcours", "Date", "Nature", "Type d’action", "Action", "Statut", "Priorité", "Responsable", "Échéance", "Validation"];
    const rows = filteredActions.map((item) => [item.id, item.vendor, item.highway, item.measurementDate, item.issueNature, item.qualifications.join(" + ") || "Non qualifié", item.action, item.workflow.status, item.workflow.priority, item.workflow.owner, item.workflow.dueDate, item.workflow.validation]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })); link.download = "suivi-actions-parcours.csv"; link.click(); URL.revokeObjectURL(link.href);
  }

  return <main>
    <header className="topbar">
      <div className="brand"><span className="brand-mark">DT</span><div><strong>Suivi Parcours</strong><span>Mesures & actions réseau</span></div></div>
      <div className="topbar-actions"><span className="source-pill"><span className="live-dot" /> 3 sources consolidées</span><button className="button button-secondary" onClick={exportCsv}>Exporter</button></div>
    </header>

    <section className="command-header shell">
      <div><p className="eyebrow">Pilotage qualité réseau · Autoroutes</p><h1>Tableau de bord opérationnel</h1><p>Dernière mesure <strong>{formatDate(latestMeasurementDate())}</strong> · Qualification par second passage du même parcours</p></div>
      <button className="button button-primary" onClick={() => { setDrillActionIds(null); setTab("actions"); }}>Piloter les actions <span>→</span></button>
    </section>

    <section className="shell workspace">
      <div className="tabs" role="tablist" aria-label="Navigation du suivi">
        {(["synthese", "parcours", "actions"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => { setTab(item); if (item !== "actions") setDrillActionIds(null); }} role="tab" aria-selected={tab === item}>{item === "synthese" ? "Vue d’ensemble" : item === "parcours" ? "Parcours" : "Plan d’actions"}{item === "actions" && <span className="tab-count">{actions.length}</span>}</button>)}
      </div>

      {tab === "synthese" ? <>
        <button className="mobile-filter-toggle" onClick={() => setFiltersOpen((value) => !value)}>Filtres du dashboard <span>{activeFilterCount || "Tous"}</span></button>
        <div className={`dashboard-filters ${filtersOpen ? "filters-open" : ""}`} aria-label="Filtres du dashboard">
          <label><span>Équipementier</span><select value={filters.vendor} onChange={(event) => updateFilter("vendor", event.target.value as Vendor)}>{vendors.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Type de mesure</span><select value={filters.measurementType} onChange={(event) => updateFilter("measurementType", event.target.value as MeasurementType)}><option>Tous</option>{MEASUREMENT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Parcours</span><select value={filters.highway} onChange={(event) => updateFilter("highway", event.target.value)}><option>Tous</option>{highways.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Responsabilité</span><select value={filters.responsibility} onChange={(event) => updateFilter("responsibility", event.target.value)}><option>Tous</option>{responsibilities.map((item) => <option key={item}>{item}</option>)}</select></label>
          <button className="reset-button" disabled={!activeFilterCount} onClick={() => setFilters(EMPTY_DASHBOARD_FILTERS)}>Réinitialiser</button>
        </div>
        {activeFilterCount > 0 && <div className="active-filters" aria-label="Filtres actifs">
          {Object.entries(filters).filter(([, value]) => value !== "Tous").map(([key, value]) => <button key={key} onClick={() => updateFilter(key as keyof DashboardFilters, "Tous")}>{value}<span>×</span></button>)}
          <span>{activeFilterCount} filtre{activeFilterCount > 1 ? "s" : ""} actif{activeFilterCount > 1 ? "s" : ""}</span>
        </div>}

        <section className="kpi-grid" aria-label="Indicateurs clés">
          <KpiButton label="Parcours uniques" value={dashboard.parcours.length} detail={`${dashboard.passages} passage${dashboard.passages > 1 ? "s" : ""} DT`} meta="Parcours regroupés par nom canonique exact. Cliquer pour ouvrir la liste." tone="teal" onClick={() => openParcours("Tous")} />
          <KpiButton label="Taux de qualification" value={`${dashboard.qualificationRate}%`} detail={`${dashboard.qualified} qualifié · ${dashboard.pending} en attente`} meta="Un parcours est qualifié uniquement avec un passage strictement postérieur au DT1." tone="navy" onClick={() => openParcours(dashboard.pending ? "À reprogrammer" : "Qualifié")} />
          <KpiButton label="Anomalies déclarées" value={dashboard.anomalyTotal} detail="Feuille Situation" meta="Total des anomalies déclarées dans Situation pour le périmètre. Le filtre responsabilité ne s’applique pas à cet indicateur." tone="coral" onClick={() => document.getElementById("measurement-comparison")?.scrollIntoView({ behavior: "smooth" })} />
          <KpiButton label="Affectations" value={dashboard.assignmentTotal} detail="Par responsabilité · Situation" meta="Total des affectations de la feuille Situation. Une anomalie peut avoir plusieurs responsabilités." tone="amber" onClick={() => document.getElementById("responsibility-ranking")?.scrollIntoView({ behavior: "smooth" })} />
        </section>

        <div className="dashboard-grid">
          <article className="panel pipeline-panel">
            <div className="panel-heading"><div><span className="section-kicker">Réalisation & qualification</span><h2>Pipeline DT1 → DT2</h2></div><span className="microcopy">Même nom de parcours · date postérieure</span></div>
            <div className="pipeline-list">{dashboard.vendorPipeline.map((item) => <button key={item.vendor} onClick={() => updateFilter("vendor", item.vendor as Vendor)} title={`${item.vendor} : ${item.dt1} DT1, ${item.dt2} DT2, ${item.pending} à reprogrammer`}>
              <span className="pipeline-vendor"><i className={vendorClass(item.vendor)} /><strong>{item.vendor}</strong></span>
              <span className="pipeline-step"><b>{item.dt1}</b><small>DT1 réalisés</small></span><span className="pipeline-link">→</span>
              <span className="pipeline-step pipeline-dt2"><b>{item.dt2}</b><small>DT2 qualifiants</small></span>
              <span className="pipeline-pending"><b>{item.pending}</b><small>à reprogrammer</small></span>
            </button>)}</div>
          </article>

          <article className="panel comparison-panel" id="measurement-comparison">
            <div className="panel-heading"><div><span className="section-kicker">Situation · comparaison</span><h2>Anomalies vs affectations</h2></div><span className="chart-legend"><i className="legend-anomaly" /> Anomalies <i className="legend-assignment" /> Affectations</span></div>
            {dashboard.measurementSeries.length ? <div className="comparison-chart">{dashboard.measurementSeries.map((item) => <button key={item.type} className={filters.measurementType === item.type ? "selected" : ""} onClick={() => updateFilter("measurementType", item.type as MeasurementType)} title={`${item.type} : ${item.anomalies} anomalies et ${item.assignments} affectations dans Situation`}>
              <span className="comparison-label">{item.type}</span><span className="dual-bars"><i className="anomaly-bar" style={{ width: `${item.anomalies / maxComparison * 100}%` }} /><i className="assignment-bar" style={{ width: `${item.assignments / maxComparison * 100}%` }} /></span><span className="comparison-values"><b>{item.anomalies}</b><b>{item.assignments}</b></span>
            </button>)}</div> : <EmptyChart />}
          </article>

          <article className="panel ranking-panel" id="responsibility-ranking">
            <div className="panel-heading"><div><span className="section-kicker">Situation · responsabilités</span><h2>Répartition des affectations</h2></div><span className="microcopy">Cliquer pour filtrer</span></div>
            {dashboard.responsibilities.length ? <div className="bars">{dashboard.responsibilities.map((item, index) => <button className={filters.responsibility === item.label ? "bar-row selected" : "bar-row"} key={item.label} onClick={() => updateFilter("responsibility", filters.responsibility === item.label ? "Tous" : item.label)} title={`${item.label} : ${item.value} affectations Situation, rang ${index + 1} sur ${dashboard.responsibilities.length}`}><span><i>{index + 1}</i>{item.label}</span><span className="bar-track"><i style={{ width: `${Math.max(3, item.value / maxResponsibility * 100)}%` }} /></span><strong>{item.value}</strong></button>)}</div> : <EmptyChart />}
          </article>

          <article className="panel priority-panel">
            <div className="panel-heading"><div><span className="section-kicker">À traiter maintenant</span><h2>Priorités opérationnelles</h2></div></div>
            <div className="priority-list">
              <button onClick={() => openParcours("À reprogrammer")}><span className="priority-number priority-critical">{dashboard.pending}</span><span><strong>Parcours à reprogrammer</strong><small>Aucun DT2 qualifiant après le premier passage</small></span><b>→</b></button>
              <button onClick={() => { setQualification("Non qualifié"); setDrillActionIds(null); setTab("actions"); }}><span className="priority-number">{sourceData.sourceSummary.detailedActions - sourceData.sourceSummary.actionsWithQualification}</span><span><strong>Type d’action manquant</strong><small>Actions détaillées à catégoriser</small></span><b>→</b></button>
              <button onClick={() => { setStatus("Non renseigné"); setDrillActionIds(null); setTab("actions"); }}><span className="priority-number">{sourceData.sourceSummary.actionsWithoutWorkflowStatus}</span><span><strong>Workflow non initialisé</strong><small>Responsable et échéance à définir</small></span><b>→</b></button>
            </div>
            <div className="quality-note"><span>i</span><p><strong>Lecture correcte :</strong> anomalies et affectations sont distinctes. Une anomalie peut être affectée à plusieurs responsabilités.</p></div>
          </article>

          <article className="panel matrix-panel">
            <div className="panel-heading"><div><span className="section-kicker">Situation · drill-down</span><h2>Type de mesure × responsabilité</h2></div><span className="microcopy">Cliquer une valeur pour voir sa source</span></div>
            <div className="table-scroll"><table className="matrix-table"><thead><tr><th>Responsabilité</th>{visibleTypes.map((type) => <th key={type}>{type}</th>)}<th>Total</th></tr></thead><tbody>
              {dashboard.matrix.map((row) => <tr key={row.responsibility}><td><button onClick={() => updateFilter("responsibility", row.responsibility)}>{row.responsibility}</button></td>{visibleTypes.map((type) => <td key={type}><button disabled={!row.counts[type]} onClick={() => openSituationCell(row.responsibility, type)} title={`${row.counts[type]} affectations ${row.responsibility} · ${type}. Cliquer pour voir les parcours et lignes source.`}>{row.counts[type]}</button></td>)}<td><b>{row.total}</b></td></tr>)}
            </tbody></table></div>
          </article>

          <article className="panel route-summary-panel">
            <div className="panel-heading"><div><span className="section-kicker">Situation · synthèse opérationnelle</span><h2>Autoroute, équipementier & type de test</h2></div><span className="microcopy">Cliquer pour appliquer le périmètre ou filtrer une responsabilité</span></div>
            {dashboard.operationalSummary.length ? <><div className="table-scroll"><table className="route-summary-table operational-summary-table"><thead><tr><th>Autoroute</th><th>Équipementier</th><th>Type de test</th><th>Dégradations</th><th>Affectations Situation</th><th>Répartition par responsabilité</th></tr></thead><tbody>
              {visibleOperationalSummary.map((row) => <tr key={`${row.vendor}-${row.highway}-${row.measurementType}`}><td><button className="route-filter-button" onClick={() => applyOperationalScope(row)} title={`Filtrer sur ${row.highway} · ${row.vendor} · ${row.measurementType}`}>{row.highway}</button></td><td><button className={`vendor-filter-button ${vendorClass(row.vendor)}`} onClick={() => updateFilter("vendor", row.vendor as Vendor)} title={`Filtrer sur ${row.vendor}`}>{row.vendor}</button></td><td><button className="measure-filter-button" onClick={() => updateFilter("measurementType", row.measurementType as MeasurementType)} title={`Filtrer sur ${row.measurementType}`}>{row.measurementType}</button></td><td><b className="metric-anomaly">{row.anomalies}</b></td><td><b className="metric-assignment">{row.assignments}</b></td><td><div className="responsibility-breakdown">{row.responsibilityBreakdown.length ? row.responsibilityBreakdown.map((item) => <button key={item.responsibility} onClick={() => applyOperationalScope(row, item.responsibility)} title={`Voir ${item.count} affectation${item.count > 1 ? "s" : ""} ${item.responsibility} pour ce périmètre`}><span>{item.responsibility}</span><b>{item.count}</b></button>) : <span className="no-assignment">Aucune affectation</span>}</div></td></tr>)}
            </tbody></table></div>{dashboard.operationalSummary.length > 12 && <button className="load-more" onClick={() => setRouteSummaryExpanded((value) => !value)}>{routeSummaryExpanded ? "Réduire la synthèse" : `Afficher les ${dashboard.operationalSummary.length - 12} lignes restantes`}</button>}</> : <EmptyChart />}
          </article>
        </div>
      </> : <>
        <div className="filterbar">
          <label className="searchbox"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => { setSearch(event.target.value); setVisibleRows(40); }} placeholder="Rechercher un axe, une cellule, un ID…" /></label>
          <label><span>Équipementier</span><select value={filters.vendor} onChange={(event) => updateFilter("vendor", event.target.value as Vendor)}>{vendors.map((item) => <option key={item}>{item}</option>)}</select></label>
          {tab === "actions" ? <><label><span>Type d’action</span><select value={qualification} onChange={(event) => { setQualification(event.target.value); setVisibleRows(40); }}><option>Toutes</option>{Object.keys(sourceData.sourceSummary.byQualification).map((item) => <option key={item} value={item}>{item === "Non qualifié" ? "Type non renseigné" : item}</option>)}</select></label><label><span>Statut</span><select value={status} onChange={(event) => { setStatus(event.target.value); setVisibleRows(40); }}><option>Tous</option>{statusOptions.map((item) => <option key={item}>{item}</option>)}</select></label></> : <label><span>Qualification parcours</span><select value={routeQualification} onChange={(event) => setRouteQualification(event.target.value)}><option>Tous</option><option>Qualifié</option><option>À reprogrammer</option></select></label>}
        </div>
        {!persistenceReady && <div className="notice notice-warning"><strong>Suivi en lecture seule.</strong> Les données source restent disponibles; l’enregistrement du workflow sera actif après initialisation de la base.</div>}
        {tab === "parcours" && <article className="panel table-panel"><div className="panel-heading"><div><span className="section-kicker">Réalisation terrain</span><h2>{filteredParcours.length} parcours affichés</h2></div><span className="legend"><i className="legend-good" /> DT2 qualifie le même parcours</span></div><div className="table-scroll"><table><thead><tr><th>Parcours</th><th>Équipementier</th><th>DT1</th><th>DT2 · qualification</th><th>Dernier passage</th><th>Passages</th><th>Statut</th><th>Déclarés</th><th>Détaillés</th><th>Écart</th></tr></thead><tbody>{filteredParcours.map((item) => <tr key={item.id}><td><strong>{item.highway}</strong><small>{item.mappingMycom || "Mapping non renseigné"}</small></td><td><span className={vendorClass(item.vendor)} />{item.vendor}</td><td><strong>{formatDate(item.firstMeasurementDate)}</strong></td><td>{item.qualificationDate ? <strong className="qualified-date">{formatDate(item.qualificationDate)}</strong> : <span className="muted">En attente de DT2</span>}</td><td>{formatDate(item.latestMeasurementDate)}</td><td><b>{item.passCount}</b></td><td><span className={item.qualificationStatus === "Qualifié" ? "route-status route-qualified" : "route-status route-pending"}>{item.qualificationStatus}</span></td><td><b>{item.declaredAnomalies}</b></td><td><b>{item.detailedItems}</b></td><td><span className={item.detailGap === 0 ? "gap gap-zero" : "gap"}>{item.detailGap > 0 ? "+" : ""}{item.detailGap}</span></td></tr>)}</tbody></table></div></article>}
        {tab === "actions" && <article className="panel table-panel actions-panel"><div className="panel-heading"><div><span className="section-kicker">Pilotage opérationnel</span><h2>{filteredActions.length} actions détaillées affichées</h2></div><div className="panel-tools">{drillActionIds && <button className="clear-drill" onClick={() => setDrillActionIds(null)}>Retirer le drill-down ×</button>}<span className="microcopy">Cliquer une ligne pour documenter</span></div></div><div className="table-scroll"><table><thead><tr><th>Référence</th><th>Parcours / cellule</th><th>Problème</th><th>Type d’action</th><th>Statut</th><th>Responsable</th><th>Échéance</th></tr></thead><tbody>{filteredActions.slice(0, visibleRows).map((item) => <tr key={item.id} onClick={() => { setSelectedId(item.id); setSaveState("idle"); }} className="clickable"><td><strong className="ref">{item.id}</strong><small>{formatDate(item.measurementDate)}</small></td><td><strong>{item.highway}</strong><small>{item.servingCell || "Cellule non renseignée"}</small></td><td><span className="issue">{item.issueFamilies[0] || "À catégoriser"}</span><small>{item.issueNature}</small></td><td><div className="chips">{(item.qualifications.length ? item.qualifications : ["Type non renseigné"]).slice(0, 2).map((label) => <span key={label}>{label}</span>)}</div></td><td><span className={statusClass(item.workflow.status)}>{item.workflow.status}</span></td><td>{item.workflow.owner || <span className="muted">À affecter</span>}</td><td>{formatDate(item.workflow.dueDate)}</td></tr>)}</tbody></table></div>{visibleRows < filteredActions.length && <button className="load-more" onClick={() => setVisibleRows((value) => value + 40)}>Afficher 40 lignes supplémentaires</button>}</article>}
      </>}
    </section>

    {situationDrilldown && <div className="drawer-backdrop"><aside className="drawer situation-drawer" role="dialog" aria-modal="true" aria-label="Détail Situation"><div className="drawer-head"><div><span className="ref">SOURCE · SITUATION</span><h2>{situationDrilldown.responsibility}</h2><p>{situationDrilldown.measurementType} · {situationDrilldown.situationTotal} affectations</p></div><button className="icon-button" onClick={() => setSituationDrilldown(null)} aria-label="Fermer">×</button></div><div className="drawer-body">
      <section className="drill-summary"><div><span>Situation</span><strong>{situationDrilldown.situationTotal}</strong><small>affectations agrégées</small></div><div><span>Détail</span><strong>{situationDrilldown.detailedActions.length}</strong><small>actions correspondantes</small></div></section>
      {situationDrilldown.situationTotal !== situationDrilldown.detailedActions.length && <div className="notice notice-info"><strong>Deux niveaux de lecture.</strong> Le total Situation est agrégé; le détail provient des feuilles d’actions et peut différer.</div>}
      <section className="detail-section"><h3>Parcours et lignes source</h3><div className="source-rows">{situationDrilldown.rows.map((row) => <div key={`${row.sourceFile}-${row.sourceRow}-${row.sourceColumn}`}><span className={vendorClass(row.vendor)} /><span><strong>{row.highway}</strong><small>{formatDate(row.measurementDate)} · {row.vendor}</small></span><b>{row.count}</b><em>{row.sourceFile}<br />L{row.sourceRow} · C{row.sourceColumn}</em></div>)}</div></section>
      <button className="button button-primary drawer-action" disabled={!situationDrilldown.detailedActions.length} onClick={() => showDetailedActions(situationDrilldown)}>Voir {situationDrilldown.detailedActions.length} actions détaillées correspondantes →</button>
    </div></aside></div>}

    {selected && <div className="drawer-backdrop"><aside className="drawer" role="dialog" aria-modal="true" aria-label={`Détail ${selected.id}`}><div className="drawer-head"><div><span className="ref">{selected.id}</span><h2>{selected.highway}</h2><p><span className={vendorClass(selected.vendor)} /> {selected.vendor} · {formatDate(selected.measurementDate)}</p></div><button className="icon-button" onClick={() => setSelectedId(null)} aria-label="Fermer">×</button></div><div className="drawer-body">
      <section className="detail-section"><h3>Constat terrain</h3><dl><div><dt>Nature</dt><dd>{selected.issueNature || "—"}</dd></div><div><dt>Test</dt><dd>{selected.testType}</dd></div><div><dt>Cellule</dt><dd>{selected.servingCell || "—"}</dd></div><div><dt>Radio</dt><dd>{selected.signalLevel ?? "—"} dBm · SINR {selected.sinr ?? "—"}</dd></div></dl>{selected.description && <p className="narrative">{selected.description}</p>}</section>
      <section className="detail-section"><h3>Analyse & action proposées</h3><div className="analysis-box"><span>Analyse</span><p>{selected.analysis || "Non renseignée"}</p></div><div className="action-box"><span>Action</span><p>{selected.action || "Non renseignée"}</p></div></section>
      <section className="detail-section workflow-form"><div className="workflow-title"><h3>Pilotage de l’action</h3>{saveState === "saved" && <span className="saved">Enregistré</span>}{saveState === "error" && <span className="save-error">Non enregistré</span>}</div><div className="form-grid"><label><span>Statut</span><select value={selected.workflow.status} onChange={(event) => saveWorkflow({ ...selected.workflow, status: event.target.value })}>{statusOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Priorité</span><select value={selected.workflow.priority} onChange={(event) => saveWorkflow({ ...selected.workflow, priority: event.target.value })}>{priorityOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Responsable</span><input value={selected.workflow.owner} placeholder="Nom ou équipe" onChange={(event) => setUpdates((current) => ({ ...current, [selected.id]: { ...selected.workflow, owner: event.target.value } }))} onBlur={(event) => saveWorkflow({ ...selected.workflow, owner: event.target.value })} /></label><label><span>Échéance</span><input type="date" value={selected.workflow.dueDate} onChange={(event) => saveWorkflow({ ...selected.workflow, dueDate: event.target.value })} /></label><label className="full"><span>Validation</span><select value={selected.workflow.validation} onChange={(event) => saveWorkflow({ ...selected.workflow, validation: event.target.value })}>{validationOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label className="full"><span>Note de suivi / preuve</span><textarea value={selected.workflow.note ?? ""} placeholder="Décision, blocage, lien vers une preuve…" onChange={(event) => setUpdates((current) => ({ ...current, [selected.id]: { ...selected.workflow, note: event.target.value } }))} onBlur={(event) => saveWorkflow({ ...selected.workflow, note: event.target.value })} /></label></div></section>
      {selected.dataQualityFlags.length > 0 && <section className="data-flags"><strong>Contrôles qualité</strong>{selected.dataQualityFlags.map((flag) => <span key={flag}>• {flag}</span>)}</section>}<p className="source-line">Source : {selected.sourceFile} · ligne {selected.sourceRow}</p>
    </div></aside></div>}
  </main>;
}
