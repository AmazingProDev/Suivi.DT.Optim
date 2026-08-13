"use client";

import { useEffect, useMemo, useState } from "react";
import sourceData from "../lib/source-data.json";

type Tab = "synthese" | "parcours" | "actions";
type Workflow = {
  status: string;
  priority: string;
  owner: string;
  dueDate: string;
  validation: string;
  note?: string;
  updatedAt?: string;
};

type ActionItem = (typeof sourceData.actions)[number] & { workflow: Workflow };

const statusOptions = ["Non renseigné", "À lancer", "En cours", "Bloquée", "Terminée", "Validée"];
const priorityOptions = ["À évaluer", "Basse", "Moyenne", "Haute", "Critique"];
const validationOptions = ["Non renseignée", "À valider", "Rejetée", "Validée"];

function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}

function statusClass(value: string) {
  return `status status-${value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]+/g, "-")}`;
}

function vendorClass(value: string) {
  return `vendor-dot vendor-${value.toLowerCase()}`;
}

function KpiCard({ label, value, detail, tone = "navy" }: { label: string; value: string | number; detail: string; tone?: string }) {
  return (
    <article className={`kpi-card tone-${tone}`}>
      <span className="kpi-label">{label}</span>
      <strong>{value}</strong>
      <span className="kpi-detail">{detail}</span>
    </article>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("synthese");
  const [vendor, setVendor] = useState("Tous");
  const [qualification, setQualification] = useState("Toutes");
  const [routeQualification, setRouteQualification] = useState("Tous");
  const [measurementType, setMeasurementType] = useState("Tous");
  const [status, setStatus] = useState("Tous");
  const [search, setSearch] = useState("");
  const [updates, setUpdates] = useState<Record<string, Workflow>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleRows, setVisibleRows] = useState(40);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [persistenceReady, setPersistenceReady] = useState(true);

  useEffect(() => {
    fetch("/api/actions")
      .then(async (response) => {
        if (!response.ok) throw new Error("persistence unavailable");
        const body = await response.json();
        const mapped = Object.fromEntries((body.updates ?? []).map((item: Workflow & { sourceId: string }) => [item.sourceId, item]));
        setUpdates(mapped);
      })
      .catch(() => setPersistenceReady(false));
  }, []);

  const actions = useMemo<ActionItem[]>(() => sourceData.actions.map((item) => ({
    ...item,
    workflow: updates[item.id] ?? item.workflow,
  })), [updates]);

  const filteredActions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return actions.filter((item) => {
      const matchesVendor = vendor === "Tous" || item.vendor === vendor;
      const matchesQualification = qualification === "Toutes"
        || (qualification === "Non qualifié" ? item.qualifications.length === 0 : item.qualifications.includes(qualification));
      const matchesStatus = status === "Tous" || item.workflow.status === status;
      const haystack = `${item.id} ${item.highway} ${item.servingCell} ${item.issueNature} ${item.action}`.toLocaleLowerCase("fr");
      return matchesVendor && matchesQualification && matchesStatus && (!query || haystack.includes(query));
    });
  }, [actions, qualification, search, status, vendor]);

  const filteredParcours = useMemo(() => sourceData.parcours.filter((item) => {
    const query = search.trim().toLocaleLowerCase("fr");
    return (vendor === "Tous" || item.vendor === vendor)
      && (routeQualification === "Tous" || item.qualificationStatus === routeQualification)
      && (!query || `${item.highway} ${item.mappingMycom}`.toLocaleLowerCase("fr").includes(query));
  }), [routeQualification, search, vendor]);

  const selected = selectedId ? actions.find((item) => item.id === selectedId) ?? null : null;
  const measurementTypes = Object.keys(sourceData.sourceSummary.actionsByMeasurementType);
  const filteredSituationActions = useMemo(() => sourceData.situationActions.filter((item) =>
    (vendor === "Tous" || item.vendor === vendor)
      && (measurementType === "Tous" || item.testFamily === measurementType)
  ), [measurementType, vendor]);
  const overviewAnomalies = useMemo(() => sourceData.situationAnomalies
    .filter((item) => (vendor === "Tous" || item.vendor === vendor)
      && (measurementType === "Tous" || item.testFamily === measurementType))
    .reduce((sum, item) => sum + item.count, 0), [measurementType, vendor]);
  const overviewParcours = useMemo(() => sourceData.parcours.filter((item) => vendor === "Tous" || item.vendor === vendor), [vendor]);
  const overviewActions = filteredSituationActions.reduce((sum, item) => sum + item.count, 0);
  const responsibilityEntries = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const item of filteredSituationActions) {
      totals[item.responsibility] = (totals[item.responsibility] ?? 0) + item.count;
    }
    return Object.entries(totals).sort((left, right) => right[1] - left[1]);
  }, [filteredSituationActions]);
  const maxResponsibility = Math.max(1, ...responsibilityEntries.map(([, value]) => value));
  const visibleMeasurementTypes = measurementType === "Tous" ? measurementTypes : [measurementType];
  const responsibilityMatrix = responsibilityEntries.map(([responsibility]) => ({
    responsibility,
    counts: visibleMeasurementTypes.map((type) => filteredSituationActions
      .filter((item) => item.responsibility === responsibility && item.testFamily === type)
      .reduce((sum, item) => sum + item.count, 0)),
  }));

  async function saveWorkflow(next: Workflow) {
    if (!selected) return;
    setSaveState("saving");
    setUpdates((current) => ({ ...current, [selected.id]: next }));
    try {
      const response = await fetch("/api/actions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: selected.id, ...next }),
      });
      if (!response.ok) throw new Error("save failed");
      const body = await response.json();
      setUpdates((current) => ({ ...current, [selected.id]: body.update }));
      setSaveState("saved");
      setPersistenceReady(true);
      window.setTimeout(() => setSaveState("idle"), 1800);
    } catch {
      setSaveState("error");
      setPersistenceReady(false);
    }
  }

  function exportCsv() {
    const header = ["ID", "Équipementier", "Parcours", "Date", "Nature", "Type d’action", "Action", "Statut", "Priorité", "Responsable", "Échéance", "Validation"];
    const rows = filteredActions.map((item) => [
      item.id, item.vendor, item.highway, item.measurementDate, item.issueNature,
      item.qualifications.join(" + ") || "Non qualifié", item.action, item.workflow.status,
      item.workflow.priority, item.workflow.owner, item.workflow.dueDate, item.workflow.validation,
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "suivi-actions-parcours.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">DT</span>
          <div><strong>Suivi Parcours</strong><span>Mesures & actions réseau</span></div>
        </div>
        <div className="source-pill"><span className="live-dot" /> Données consolidées · 3 sources</div>
      </header>

      <section className="hero shell">
        <div>
          <p className="eyebrow">Pilotage qualité réseau · Autoroutes</p>
          <h1>De la mesure terrain à l’action validée.</h1>
          <p className="hero-copy">Une vue unique des parcours Nokia, Ericsson et Huawei. Un parcours devient qualifié lorsqu’un nouveau passage est réalisé après le DT initial.</p>
        </div>
        <div className="hero-actions">
          <button className="button button-secondary" onClick={exportCsv}>Exporter le suivi</button>
          <button className="button button-primary" onClick={() => setTab("actions")}>Piloter les actions</button>
        </div>
      </section>

      <section className="shell kpi-grid" aria-label="Indicateurs clés">
        <KpiCard label="Passages de mesure" value={overviewParcours.reduce((sum, item) => sum + item.passCount, 0)} detail={`${overviewParcours.length} parcours · ${vendor}`} tone="teal" />
        <KpiCard label="Anomalies déclarées" value={overviewAnomalies} detail={`${measurementType} · feuille Situation`} />
        <KpiCard label="Actions par responsabilité" value={overviewActions} detail={`${measurementType} · feuille Situation`} tone="amber" />
        <KpiCard label="Parcours qualifiés" value={overviewParcours.filter((item) => item.qualificationStatus === "Qualifié").length} detail={`${overviewParcours.filter((item) => item.qualificationStatus !== "Qualifié").length} en attente de DT2`} tone="coral" />
      </section>

      <section className="shell workspace">
        <div className="tabs" role="tablist" aria-label="Navigation du suivi">
          {(["synthese", "parcours", "actions"] as Tab[]).map((item) => (
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)} role="tab" aria-selected={tab === item}>
              {item === "synthese" ? "Vue d’ensemble" : item === "parcours" ? "Parcours" : "Plan d’actions"}
              {item === "actions" && <span className="tab-count">{actions.length}</span>}
            </button>
          ))}
        </div>

        <div className="filterbar">
          <label className="searchbox"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un axe, une cellule, un ID…" /></label>
          <label><span>Équipementier</span><select value={vendor} onChange={(event) => { setVendor(event.target.value); setVisibleRows(40); }}><option>Tous</option><option>Nokia</option><option>Ericsson</option><option>Huawei</option></select></label>
          {tab === "actions" && <>
            <label><span>Type d’action</span><select value={qualification} onChange={(event) => { setQualification(event.target.value); setVisibleRows(40); }}><option>Toutes</option>{Object.keys(sourceData.sourceSummary.byQualification).map((item) => <option key={item} value={item}>{item === "Non qualifié" ? "Type non renseigné" : item}</option>)}</select></label>
            <label><span>Statut</span><select value={status} onChange={(event) => { setStatus(event.target.value); setVisibleRows(40); }}><option>Tous</option>{statusOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
          </>}
          {tab === "synthese" && <label><span>Type de mesure</span><select value={measurementType} onChange={(event) => setMeasurementType(event.target.value)}><option>Tous</option>{measurementTypes.map((item) => <option key={item}>{item}</option>)}</select></label>}
          {tab === "parcours" && <label><span>Qualification parcours</span><select value={routeQualification} onChange={(event) => setRouteQualification(event.target.value)}><option>Tous</option><option>Qualifié</option><option>À reprogrammer</option></select></label>}
        </div>

        {!persistenceReady && <div className="notice notice-warning"><strong>Suivi en lecture seule.</strong> Les données source restent disponibles; l’enregistrement du workflow sera actif après initialisation de la base.</div>}

        {tab === "synthese" && (
          <><div className="qualification-rule"><span><b>DT1</b> Premier passage</span><i>→</i><span><b>DT2</b> Passage ultérieur</span><i>→</i><strong>Parcours qualifié</strong></div><div className="overview-grid">
            <article className="panel qualification-panel">
              <div className="panel-heading"><div><span className="section-kicker">Situation · {vendor} · {measurementType}</span><h2>Actions par responsabilité</h2></div><span className="microcopy">Affectations renseignées dans la feuille Situation</span></div>
              <div className="bars">
                {responsibilityEntries.map(([label, value]) => (
                  <div className="bar-row" key={label}><span>{label}</span><div className="bar-track"><i style={{ width: `${Math.max(5, (value / maxResponsibility) * 100)}%` }} /></div><strong>{value}</strong></div>
                ))}
              </div>
            </article>
            <article className="panel vendor-panel">
              <div className="panel-heading"><div><span className="section-kicker">Situation</span><h2>Synthèse par équipementier</h2></div></div>
              <div className="vendor-list">
                {Object.entries(sourceData.sourceSummary.vendors).map(([name, values]) => (
                  <button key={name} onClick={() => setVendor(name)}>
                    <span className={vendorClass(name)} />
                    <span><strong>{name}</strong><small>{values.measurementEvents} DT · {values.parcours} parcours</small></span>
                    <span className="vendor-metric"><b>{values.declaredAnomalies}</b><em>anomalies</em></span>
                    <span className="vendor-metric"><b>{values.situationActions}</b><em>affectations</em></span>
                  </button>
                ))}
              </div>
              <div className="quality-callout"><span>i</span><div><strong>Lecture des chiffres</strong><p>Une même anomalie peut être affectée à plusieurs responsabilités dans Situation.</p></div></div>
            </article>
            <article className="panel attention-panel">
              <div className="panel-heading"><div><span className="section-kicker">À traiter en priorité</span><h2>Points de contrôle</h2></div></div>
              <div className="attention-list">
                <button onClick={() => { setRouteQualification("À reprogrammer"); setTab("parcours"); }}><span className="attention-number">{sourceData.sourceSummary.unqualifiedParcours}</span><span><strong>Parcours à reprogrammer</strong><small>Aucun DT2 enregistré après le DT initial</small></span><b>→</b></button>
                <button onClick={() => { setQualification("Non qualifié"); setTab("actions"); }}><span className="attention-number">{sourceData.sourceSummary.detailedActions - sourceData.sourceSummary.actionsWithQualification}</span><span><strong>Type d’action manquant</strong><small>Identifier l’entité responsable</small></span><b>→</b></button>
                <button onClick={() => { setStatus("Non renseigné"); setTab("actions"); }}><span className="attention-number">{sourceData.sourceSummary.actionsWithoutWorkflowStatus}</span><span><strong>Statut non initialisé</strong><small>Lancer le workflow de suivi</small></span><b>→</b></button>
              </div>
            </article>
            <article className="panel matrix-panel">
              <div className="panel-heading"><div><span className="section-kicker">Situation · répartition croisée</span><h2>Type de mesure × responsabilité</h2></div><span className="microcopy">{vendor === "Tous" ? "Tous les équipementiers" : vendor} · {measurementType === "Tous" ? "Tous les types de mesure" : measurementType}</span></div>
              <div className="table-scroll"><table className="matrix-table"><thead><tr><th>Responsabilité / type d’action</th>{visibleMeasurementTypes.map((type) => <th key={type}>{type}</th>)}<th>Total</th></tr></thead>
                <tbody>{responsibilityMatrix.map((row) => <tr key={row.responsibility}><td><strong>{row.responsibility}</strong></td>{row.counts.map((count, index) => <td key={visibleMeasurementTypes[index]}>{count}</td>)}<td><b>{row.counts.reduce((sum, count) => sum + count, 0)}</b></td></tr>)}</tbody>
              </table></div>
            </article>
          </div></>
        )}

        {tab === "parcours" && (
          <article className="panel table-panel">
            <div className="panel-heading"><div><span className="section-kicker">Réalisation terrain</span><h2>{filteredParcours.length} parcours affichés</h2></div><span className="legend"><i className="legend-good" /> DT2 qualifie DT1</span></div>
            <div className="table-scroll"><table><thead><tr><th>Parcours</th><th>Équipementier</th><th>DT1</th><th>DT2 · qualification</th><th>Dernier passage</th><th>Passages</th><th>Statut</th><th>Déclarés</th><th>Détaillés</th><th>Écart</th></tr></thead>
              <tbody>{filteredParcours.map((item) => <tr key={item.id}>
                <td><strong>{item.highway}</strong><small>{item.mappingMycom || "Mapping non renseigné"}</small></td>
                <td><span className={vendorClass(item.vendor)} />{item.vendor}</td><td><strong>{formatDate(item.firstMeasurementDate)}</strong></td><td>{item.qualificationDate ? <strong className="qualified-date">{formatDate(item.qualificationDate)}</strong> : <span className="muted">En attente de DT2</span>}</td><td>{formatDate(item.latestMeasurementDate)}</td><td><b>{item.passCount}</b></td>
                <td><span className={item.qualificationStatus === "Qualifié" ? "route-status route-qualified" : "route-status route-pending"}>{item.qualificationStatus}</span></td>
                <td><b>{item.declaredAnomalies}</b></td><td><b>{item.detailedItems}</b></td><td><span className={item.detailGap === 0 ? "gap gap-zero" : "gap"}>{item.detailGap > 0 ? "+" : ""}{item.detailGap}</span></td>
              </tr>)}</tbody>
            </table></div>
          </article>
        )}

        {tab === "actions" && (
          <article className="panel table-panel actions-panel">
            <div className="panel-heading"><div><span className="section-kicker">Pilotage opérationnel</span><h2>{filteredActions.length} actions affichées</h2></div><span className="microcopy">Cliquer une ligne pour documenter et suivre</span></div>
            <div className="table-scroll"><table><thead><tr><th>Référence</th><th>Parcours / cellule</th><th>Problème</th><th>Type d’action</th><th>Statut</th><th>Responsable</th><th>Échéance</th></tr></thead>
              <tbody>{filteredActions.slice(0, visibleRows).map((item) => <tr key={item.id} onClick={() => { setSelectedId(item.id); setSaveState("idle"); }} className="clickable">
                <td><strong className="ref">{item.id}</strong><small>{formatDate(item.measurementDate)}</small></td>
                <td><strong>{item.highway}</strong><small>{item.servingCell || "Cellule non renseignée"}</small></td>
                <td><span className="issue">{item.issueFamilies[0] || "À catégoriser"}</span><small>{item.issueNature}</small></td>
                <td><div className="chips">{(item.qualifications.length ? item.qualifications : ["Type non renseigné"]).slice(0, 2).map((label) => <span key={label}>{label}</span>)}</div></td>
                <td><span className={statusClass(item.workflow.status)}>{item.workflow.status}</span></td>
                <td>{item.workflow.owner || <span className="muted">À affecter</span>}</td><td>{formatDate(item.workflow.dueDate)}</td>
              </tr>)}</tbody>
            </table></div>
            {visibleRows < filteredActions.length && <button className="load-more" onClick={() => setVisibleRows((value) => value + 40)}>Afficher 40 lignes supplémentaires</button>}
          </article>
        )}
      </section>

      {selected && <div className="drawer-backdrop" onMouseDown={() => setSelectedId(null)}>
        <aside className="drawer" onMouseDown={(event) => event.stopPropagation()} aria-label={`Détail ${selected.id}`}>
          <div className="drawer-head"><div><span className="ref">{selected.id}</span><h2>{selected.highway}</h2><p><span className={vendorClass(selected.vendor)} /> {selected.vendor} · {formatDate(selected.measurementDate)}</p></div><button className="icon-button" onClick={() => setSelectedId(null)} aria-label="Fermer">×</button></div>
          <div className="drawer-body">
            <section className="detail-section"><h3>Constat terrain</h3><dl><div><dt>Nature</dt><dd>{selected.issueNature || "—"}</dd></div><div><dt>Test</dt><dd>{selected.testType}</dd></div><div><dt>Cellule</dt><dd>{selected.servingCell || "—"}</dd></div><div><dt>Radio</dt><dd>{selected.signalLevel ?? "—"} dBm · SINR {selected.sinr ?? "—"}</dd></div></dl>{selected.description && <p className="narrative">{selected.description}</p>}</section>
            <section className="detail-section"><h3>Analyse & action proposées</h3><div className="analysis-box"><span>Analyse</span><p>{selected.analysis || "Non renseignée"}</p></div><div className="action-box"><span>Action</span><p>{selected.action || "Non renseignée"}</p></div></section>
            <section className="detail-section workflow-form"><div className="workflow-title"><h3>Pilotage de l’action</h3>{saveState === "saved" && <span className="saved">Enregistré</span>}{saveState === "error" && <span className="save-error">Non enregistré</span>}</div>
              <div className="form-grid">
                <label><span>Statut</span><select value={selected.workflow.status} onChange={(event) => saveWorkflow({ ...selected.workflow, status: event.target.value })}>{statusOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label><span>Priorité</span><select value={selected.workflow.priority} onChange={(event) => saveWorkflow({ ...selected.workflow, priority: event.target.value })}>{priorityOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label><span>Responsable</span><input value={selected.workflow.owner} placeholder="Nom ou équipe" onChange={(event) => setUpdates((current) => ({ ...current, [selected.id]: { ...selected.workflow, owner: event.target.value } }))} onBlur={(event) => saveWorkflow({ ...selected.workflow, owner: event.target.value })} /></label>
                <label><span>Échéance</span><input type="date" value={selected.workflow.dueDate} onChange={(event) => saveWorkflow({ ...selected.workflow, dueDate: event.target.value })} /></label>
                <label className="full"><span>Validation</span><select value={selected.workflow.validation} onChange={(event) => saveWorkflow({ ...selected.workflow, validation: event.target.value })}>{validationOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label className="full"><span>Note de suivi / preuve</span><textarea value={selected.workflow.note ?? ""} placeholder="Décision, blocage, lien vers une preuve…" onChange={(event) => setUpdates((current) => ({ ...current, [selected.id]: { ...selected.workflow, note: event.target.value } }))} onBlur={(event) => saveWorkflow({ ...selected.workflow, note: event.target.value })} /></label>
              </div>
            </section>
            {selected.dataQualityFlags.length > 0 && <section className="data-flags"><strong>Contrôles qualité</strong>{selected.dataQualityFlags.map((flag) => <span key={flag}>• {flag}</span>)}</section>}
            <p className="source-line">Source : {selected.sourceFile} · ligne {selected.sourceRow}</p>
          </div>
        </aside>
      </div>}
    </main>
  );
}
