import { useMemo, useState } from "react";
import { CmPresetSchema, StudyIRSchema, type CmPreset, type CohortSpec, type StudyIR } from "./ir/schema";
import { gibleed } from "./ir/presets/gibleed";
import { buildAnalysisSpecifications } from "./compiler/strategus";
import { buildRScript } from "./compiler/rScriptBundled";
import { templates } from "./compiler/templates";
import { hasErrors, validateStudy, type Issue } from "./validate/semantic";
import { EUNOMIA_NEGATIVE_CONTROLS } from "./vocab/eunomia";
import { CohortEditor } from "./components/CohortEditor";
import { OutputPanel } from "./components/OutputPanel";
import { Checkbox, Field, NumberInput, Section, Select } from "./components/fields";

const PRESET_LABEL: Record<CmPreset, string> = {
  unadjusted: "No adjustment (crude)",
  ps_match_1to1: "1:1 propensity score matching",
  ps_stratify_10: "Propensity score stratification (10 strata)",
};

const DUPLICATE_OPTIONS = ["keep all", "keep first", "remove all", "keep first, truncate to second"] as const;

function nextCohortId(ir: StudyIR): number {
  const ids = [ir.target, ir.comparator, ...ir.outcomes].map((c) => c.cohortId);
  return Math.max(0, ...ids) + 1;
}

export function App() {
  const [ir, setIr] = useState<StudyIR>(gibleed);
  const [importError, setImportError] = useState<string | null>(null);
  const update = (patch: Partial<StudyIR>) => setIr((prev) => ({ ...prev, ...patch }));

  const { issues, specJson, rScript } = useMemo(() => {
    const parsed = StudyIRSchema.safeParse(ir);
    if (!parsed.success) {
      const schemaIssues: Issue[] = parsed.error.issues.map((i) => ({
        level: "error",
        path: i.path.join("."),
        message: i.message,
      }));
      return { issues: schemaIssues, specJson: null, rScript: null };
    }
    const issues = validateStudy(parsed.data);
    return {
      issues,
      specJson: JSON.stringify(buildAnalysisSpecifications(parsed.data), null, 2),
      rScript: buildRScript(parsed.data),
    };
  }, [ir]);

  const irJson = useMemo(() => JSON.stringify(ir, null, 2), [ir]);

  const importIr = async (file: File) => {
    try {
      const parsed = StudyIRSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) {
        setImportError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
        return;
      }
      setImportError(null);
      setIr(parsed.data);
    } catch (e) {
      setImportError(`Could not parse JSON: ${(e as Error).message}`);
    }
  };

  const p = ir.population;
  const tar = ir.timeAtRisk;

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>PICO-to-Strategus UI</h1>
          <p className="subtitle">
            Build a Strategus analysis specification for a comparative cohort study (CohortGenerator + CohortMethod) entirely in your browser. Nothing you enter is sent anywhere.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost" onClick={() => setIr(gibleed)}>
            Reset to demo (GiBleed)
          </button>
          <label className="button ghost">
            Load IR…
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
            <p className="hint">The PICO text is kept for reference only and is not compiled. In step 3 it becomes the input for an LLM-drafted IR.</p>
          </Section>

          <Section title="Target (I: intervention)">
            <CohortEditor cohort={ir.target} onChange={(target) => update({ target })} />
          </Section>

          <Section title="Comparator (C: comparison)">
            <CohortEditor cohort={ir.comparator} onChange={(comparator) => update({ comparator })} />
          </Section>

          <Section title="Outcomes (O)">
            {ir.outcomes.map((o, i) => (
              <CohortEditor
                key={i}
                cohort={o}
                onChange={(c: CohortSpec) => update({ outcomes: ir.outcomes.map((x, j) => (j === i ? c : x)) })}
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

          <Section title="Negative controls">
            <p className="hint">
              {ir.negativeControls.length} outcome(s), {ir.negativeControlSettings.occurrenceType} occurrence,{" "}
              {ir.negativeControlSettings.detectOnDescendants ? "including" : "excluding"} descendants
            </p>
            <div className="row">
              <button type="button" className="ghost" onClick={() => update({ negativeControls: EUNOMIA_NEGATIVE_CONTROLS })}>
                Use the 12 from the Strategus example
              </button>
              <button type="button" className="ghost" onClick={() => update({ negativeControls: [] })}>
                Clear
              </button>
            </div>
            {ir.negativeControls.length > 0 && (
              <ul className="nc-list">
                {ir.negativeControls.map((n) => (
                  <li key={n.cohortId}>
                    <span className="mono">{n.outcomeConceptId}</span> {n.name}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </form>

        <aside className="side">
          <OutputPanel issues={issues} specJson={specJson} rScript={rScript} irJson={irJson} blocked={hasErrors(issues) || specJson === null} />
          <p className="hint footnote">
            Templates: Strategus {templates.strategus.strategusVersion} / CohortMethod {templates.modules.CohortMethodModule.modulePackageVersion} /
            CohortGenerator {templates.modules.CohortGeneratorModule.modulePackageVersion}
          </p>
        </aside>
      </main>
    </div>
  );
}
