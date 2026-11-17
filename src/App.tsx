import { useEffect, useMemo, useState } from "react";
import { CmPresetSchema, StudyIRSchema, draftConcepts, isResolved, withPlaceholderConcepts, type CmPreset, type DraftCohortSpec, type DraftOutcomeCohort, type DraftStudyIR } from "./ir/schema";
import { gibleed } from "./ir/presets/gibleed";
import { buildAnalysisSpecifications } from "./compiler/strategus";
import { buildRScript } from "./compiler/rScriptBundled";
import { templates } from "./compiler/templates";
import { hasErrors, validateStudy, type Issue } from "./validate/semantic";
import { validateConcepts } from "./validate/concepts";
import { loadEunomiaVocabulary } from "./vocab/eunomiaSource";
import type { VocabularySource } from "./vocab/types";
import { CohortEditor } from "./components/CohortEditor";
import { OutputPanel } from "./components/OutputPanel";
import { VocabularyPanel } from "./components/VocabularyPanel";
import { NegativeControlEditor } from "./components/NegativeControlEditor";
import { LlmDraftPanel } from "./components/LlmDraftPanel";
import { ZeroTransmission } from "./components/ZeroTransmission";
import { parseDraft } from "./llm/prompt";
import { Checkbox, Field, NumberInput, Section, Select } from "./components/fields";

const PRESET_LABEL: Record<CmPreset, string> = {
  unadjusted: "No adjustment (crude)",
  ps_match_1to1: "1:1 propensity score matching",
  ps_stratify_10: "Propensity score stratification (10 strata)",
};

const DUPLICATE_OPTIONS = ["keep all", "keep first", "remove all", "keep first, truncate to second"] as const;

function nextCohortId(ir: DraftStudyIR): number {
  const ids = [ir.target, ir.comparator, ...ir.outcomes].map((c) => c.cohortId);
  return Math.max(0, ...ids) + 1;
}

export function App() {
  const [ir, setIr] = useState<DraftStudyIR>(gibleed);
  const [importError, setImportError] = useState<string | null>(null);
  const update = (patch: Partial<DraftStudyIR>) => setIr((prev) => ({ ...prev, ...patch }));
  const [vocabulary, setVocabulary] = useState<VocabularySource | null>(null);
  const [conceptIssues, setConceptIssues] = useState<Issue[]>([]);

  const useDemoVocabulary = () => {
    void loadEunomiaVocabulary().then(setVocabulary);
  };
  useEffect(useDemoVocabulary, []);

  const { issues, specJson, rScript } = useMemo(() => {
    const schemaIssues = (error: { issues: { path: PropertyKey[]; message: string }[] }): Issue[] =>
      error.issues.map((i) => ({ level: "error", path: i.path.map(String).join("."), message: i.message, source: "schema" }));

    // Unresolved concepts (from an LLM draft) must be matched to the vocabulary
    // before compiling, but the study-level checks already run on placeholders.
    const unresolved = draftConcepts(ir).filter((x) => !isResolved(x.concept));
    if (unresolved.length > 0) {
      const unresolvedIssues: Issue[] = unresolved.map((u) => ({
        level: "error",
        path: u.path,
        message: `“${u.concept.conceptName}” (${u.cohortName}) is not matched to a vocabulary concept yet`,
        source: "unresolved",
      }));
      const placeholder = StudyIRSchema.safeParse(withPlaceholderConcepts(ir));
      const rest = placeholder.success ? validateStudy(placeholder.data) : schemaIssues(placeholder.error);
      return { issues: [...unresolvedIssues, ...rest], specJson: null, rScript: null };
    }
    const parsed = StudyIRSchema.safeParse(ir);
    if (!parsed.success) return { issues: schemaIssues(parsed.error), specJson: null, rScript: null };
    const issues = validateStudy(parsed.data);
    return {
      issues,
      specJson: JSON.stringify(buildAnalysisSpecifications(parsed.data), null, 2),
      rScript: buildRScript(parsed.data),
    };
  }, [ir]);

  // Concept checks need the vocabulary (async for DuckDB), so they run separately.
  useEffect(() => {
    if (!vocabulary) return;
    const parsed = StudyIRSchema.safeParse(ir);
    if (!parsed.success) return setConceptIssues([]);
    let cancelled = false;
    validateConcepts(parsed.data, vocabulary).then(
      (found) => !cancelled && setConceptIssues(found),
      (e: Error) =>
        !cancelled && setConceptIssues([{ level: "warning", path: "", message: `Could not check concepts: ${e.message}` }]),
    );
    return () => {
      cancelled = true;
    };
  }, [ir, vocabulary]);

  const allIssues = useMemo(() => [...issues, ...conceptIssues], [issues, conceptIssues]);
  const irJson = useMemo(() => JSON.stringify(ir, null, 2), [ir]);

  const openAthena = async (files: { concept: File; synonym?: File; ancestor?: File }, standardOnly: boolean) => {
    const { openAthenaVocabulary } = await import("./vocab/duckdbWasm");
    setVocabulary(await openAthenaVocabulary(files, { standardOnly }));
  };

  const importIr = async (file: File) => {
    try {
      const result = parseDraft(await file.text());
      if (!result.ok) {
        setImportError(result.errors.join("\n"));
        return;
      }
      setImportError(null);
      setIr(result.draft);
    } catch (e) {
      setImportError(`Could not read the file: ${(e as Error).message}`);
    }
  };

  const p = ir.population;
  const tar = ir.timeAtRisk;

  return (
    <div className="app">
      <header className="header">
        <div>
          <div className="title-row">
            <h1>Strategus UI</h1>
            <ZeroTransmission />
          </div>
          <p className="subtitle">
            From a PICO question to a Strategus analysis specification for a comparative cohort study (CohortGenerator + CohortMethod), built entirely in your browser. Nothing you enter is sent anywhere.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost" onClick={() => setIr(gibleed)}>
            Reset to demo (GiBleed)
          </button>
          <label className="button ghost">
            Load IR
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importIr(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </header>
      {importError && <pre className="import-error">{importError}</pre>}

      <main className="layout">
        <form className="form" onSubmit={(e) => e.preventDefault()}>
          <LlmDraftPanel ir={ir} issues={allIssues} onLoad={setIr} />

          <VocabularyPanel vocabulary={vocabulary} onUseDemo={useDemoVocabulary} onOpenAthena={openAthena} />

          <Section title="Study">
            <Field label="Title">
              <input value={ir.title} onChange={(e) => update({ title: e.target.value })} />
            </Field>
            <div className="pico">
              {(["population", "intervention", "comparison", "outcome"] as const).map((k) => (
                <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                  <input value={ir.pico[k]} onChange={(e) => update({ pico: { ...ir.pico, [k]: e.target.value } })} />
                </Field>
              ))}
            </div>
            <p className="hint">The PICO text is kept for reference only and is not compiled.</p>
          </Section>

          <Section title="Target (I: intervention)">
            <CohortEditor cohort={ir.target} vocabulary={vocabulary} onChange={(target) => update({ target: target as DraftCohortSpec })} />
          </Section>

          <Section title="Comparator (C: comparison)">
            <CohortEditor cohort={ir.comparator} vocabulary={vocabulary} onChange={(comparator) => update({ comparator: comparator as DraftCohortSpec })} />
          </Section>

          <Section title="Outcomes (O)">
            {ir.outcomes.map((o, i) => (
              <CohortEditor
                key={i}
                cohort={o}
                vocabulary={vocabulary}
                allowPhenotype
                onChange={(c: DraftOutcomeCohort) => update({ outcomes: ir.outcomes.map((x, j) => (j === i ? c : x)) })}
                onRemove={ir.outcomes.length > 1 ? () => update({ outcomes: ir.outcomes.filter((_, j) => j !== i) }) : undefined}
              />
            ))}
            <button
              type="button"
              className="ghost"
              onClick={() =>
                update({
                  outcomes: [
                    ...ir.outcomes,
                    { kind: "condition_first", cohortId: nextCohortId(ir), name: "New outcome", concepts: [] },
                  ],
                })
              }
            >
              + Add outcome
            </button>
          </Section>

          <Section title="Population (P)" hint="Maps to CohortMethod getDbCohortMethodDataArgs.">
            <div className="grid">
              <Field label="Washout period (days)">
                <NumberInput value={p.washoutDays} min={0} onChange={(v) => update({ population: { ...p, washoutDays: v ?? 0 } })} />
              </Field>
              <Field label="Duplicate subjects">
                <Select value={p.removeDuplicateSubjects} options={DUPLICATE_OPTIONS} onChange={(v) => update({ population: { ...p, removeDuplicateSubjects: v } })} />
              </Field>
              <Field label="Min age">
                <NumberInput nullable value={p.minAge} min={0} onChange={(v) => update({ population: { ...p, minAge: v } })} />
              </Field>
              <Field label="Max age">
                <NumberInput nullable value={p.maxAge} min={0} onChange={(v) => update({ population: { ...p, maxAge: v } })} />
              </Field>
              <Field label="Study start (yyyymmdd)">
                <input value={p.studyStartDate} placeholder="none" onChange={(e) => update({ population: { ...p, studyStartDate: e.target.value.trim() } })} />
              </Field>
              <Field label="Study end (yyyymmdd)">
                <input value={p.studyEndDate} placeholder="none" onChange={(e) => update({ population: { ...p, studyEndDate: e.target.value.trim() } })} />
              </Field>
              <Field label="Max cohort size" hint="0 = no limit">
                <NumberInput value={p.maxCohortSize} min={0} onChange={(v) => update({ population: { ...p, maxCohortSize: v ?? 0 } })} />
              </Field>
            </div>
            <Checkbox checked={p.firstExposureOnly} onChange={(v) => update({ population: { ...p, firstExposureOnly: v } })} label="First exposure only" />
            <Checkbox checked={p.restrictToCommonPeriod} onChange={(v) => update({ population: { ...p, restrictToCommonPeriod: v } })} label="Restrict to common period" />
          </Section>

          <Section title="Time at risk">
            <div className="grid">
              <Field label="Start (days)">
                <NumberInput value={tar.riskWindowStart} onChange={(v) => update({ timeAtRisk: { ...tar, riskWindowStart: v ?? 0 } })} />
              </Field>
              <Field label="Start anchor">
                <Select value={tar.startAnchor} options={["cohort start", "cohort end"] as const} onChange={(v) => update({ timeAtRisk: { ...tar, startAnchor: v } })} />
              </Field>
              <Field label="End (days)">
                <NumberInput value={tar.riskWindowEnd} onChange={(v) => update({ timeAtRisk: { ...tar, riskWindowEnd: v ?? 0 } })} />
              </Field>
              <Field label="End anchor">
                <Select value={tar.endAnchor} options={["cohort start", "cohort end"] as const} onChange={(v) => update({ timeAtRisk: { ...tar, endAnchor: v } })} />
              </Field>
              <Field label="Min days at risk">
                <NumberInput value={tar.minDaysAtRisk} min={0} onChange={(v) => update({ timeAtRisk: { ...tar, minDaysAtRisk: v ?? 0 } })} />
              </Field>
            </div>
          </Section>

          <Section title="Analyses (CohortMethod)" hint="Each preset's full settings come from templates generated by the official R functions.">
            {CmPresetSchema.options.map((preset) => (
              <Checkbox
                key={preset}
                label={PRESET_LABEL[preset]}
                checked={ir.cohortMethod.analyses.includes(preset)}
                onChange={(on) => {
                  const analyses = on
                    ? CmPresetSchema.options.filter((x) => x === preset || ir.cohortMethod.analyses.includes(x))
                    : ir.cohortMethod.analyses.filter((x) => x !== preset);
                  update({ cohortMethod: { ...ir.cohortMethod, analyses } });
                }}
              />
            ))}
          </Section>

          <Section title="Diagnostics (CohortDiagnostics)" id="section-diagnostics">
            <Checkbox
              checked={ir.cohortDiagnostics.enabled}
              onChange={(enabled) => update({ cohortDiagnostics: { enabled } })}
              label="Run CohortDiagnostics on all cohorts (recommended)"
            />
            <p className="hint">
              Adds the CohortDiagnostics module before CohortMethod: cohort counts, inclusion rule attrition, source and orphan concepts, index event
              breakdown, visit context, incidence rates, cohort overlap and temporal characterization. Review these before trusting the estimates.
              Settings are the package defaults, from the R template.
            </p>
          </Section>

          <Section title="Negative controls" id="section-negative-controls">
            <NegativeControlEditor ir={ir} vocabulary={vocabulary} onChange={(negativeControls) => update({ negativeControls })} />
          </Section>
        </form>

        <aside className="side" id="output" tabIndex={-1}>
          <OutputPanel issues={allIssues} specJson={specJson} rScript={rScript} irJson={irJson} blocked={hasErrors(allIssues) || specJson === null} />
          <p className="hint footnote">
            Templates: Strategus {templates.strategus.strategusVersion} / CohortMethod {templates.modules.CohortMethodModule.modulePackageVersion} /
            CohortGenerator {templates.modules.CohortGeneratorModule.modulePackageVersion}
          </p>
        </aside>
      </main>
    </div>
  );
}
