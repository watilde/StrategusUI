import { useEffect, useState } from "react";
import type { PhenotypeCohort } from "../ir/schema";
import { circeConceptSets, circeEntryConcepts } from "../cohorts/circeConcepts";
import {
  PHENOTYPE_LIBRARY,
  loadPhenotypeDefinition,
  loadPhenotypeIndex,
  searchPhenotypes,
  type PhenotypeEntry,
  type PhenotypeIndex,
} from "../phenotypes/library";

function usePhenotypeIndex(): PhenotypeIndex | null | undefined {
  const [index, setIndex] = useState<PhenotypeIndex | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    loadPhenotypeIndex().then((i) => !cancelled && setIndex(i));
    return () => {
      cancelled = true;
    };
  }, []);
  return index;
}

export function definitionUrl(id: number, version: string = PHENOTYPE_LIBRARY.version): string {
  return `${PHENOTYPE_LIBRARY.url}/blob/v${version}/inst/cohorts/${id}.json`;
}

/** Turns a library entry into a phenotype outcome cohort (fetches the definition). */
async function toPhenotypeCohort(p: PhenotypeEntry, cohortId: number, index: PhenotypeIndex): Promise<PhenotypeCohort> {
  const circe = await loadPhenotypeDefinition(p.id);
  return {
    kind: "phenotype",
    cohortId,
    name: p.name,
    phenotype: { library: index.library || PHENOTYPE_LIBRARY.name, version: index.version || PHENOTYPE_LIBRARY.version, id: p.id, name: p.name },
    circe,
  };
}

function PhenotypeResults({
  results,
  index,
  cohortId,
  onUse,
}: {
  results: PhenotypeEntry[];
  index: PhenotypeIndex;
  cohortId: number;
  onUse: (c: PhenotypeCohort) => void;
}) {
  const [loading, setLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {error && <p className="hint error-text">{error}</p>}
      <ul className="search-results">
        {results.map((p) => (
          <li key={p.id}>
            <div className="result-main">
              <span className="result-name">
                {p.name} <span className={`badge ${p.status === "Accepted" ? "ok" : "neutral"}`}>{p.status || "no status"}</span>
                {p.reference && <span className="badge neutral">reference</span>}
              </span>
              {p.description && <span className="result-desc">{p.description}</span>}
              <span className="result-meta mono">
                #{p.id} · {p.domains} ·{" "}
                <a href={definitionUrl(p.id, index.version)} target="_blank" rel="noreferrer">
                  definition
                </a>
              </span>
            </div>
            <button
              type="button"
              className="ghost"
              disabled={loading !== null}
              onClick={async () => {
                setLoading(p.id);
                setError(null);
                try {
                  onUse(await toPhenotypeCohort(p, cohortId, index));
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setLoading(null);
                }
              }}
            >
              {loading === p.id ? "Loading…" : "Use"}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Search the PhenotypeLibrary and replace an outcome with a published definition. */
export function PhenotypePicker({
  initialText,
  cohortId,
  onUse,
}: {
  initialText: string;
  cohortId: number;
  onUse: (c: PhenotypeCohort) => void;
}) {
  const index = usePhenotypeIndex();
  const [text, setText] = useState(initialText);

  return (
    <details className="phenotype-picker">
      <summary>Use a published definition ({PHENOTYPE_LIBRARY.name})</summary>
      {index === undefined && <p className="hint">Loading the library…</p>}
      {index === null && <p className="hint">The PhenotypeLibrary is not included in this build (run npm run phenotypes:fetch).</p>}
      {index && (
        <>
          <p className="hint">
            {index.phenotypes.length.toLocaleString("en-US")} community definitions (v{index.version}, {index.license}). Most are pending peer review: read
            the definition before using it.
          </p>
          <input type="search" value={text} placeholder="Search phenotypes, e.g. gastrointestinal bleeding" onChange={(e) => setText(e.target.value)} />
          {text.trim() && (
            (() => {
              const results = searchPhenotypes(index.phenotypes, text, 10);
              return results.length ? (
                <PhenotypeResults results={results} index={index} cohortId={cohortId} onUse={onUse} />
              ) : (
                <p className="hint">No matching phenotypes.</p>
              );
            })()
          )}
        </>
      )}
    </details>
  );
}

/** Up to three published definitions matching an unresolved outcome term. */
export function PhenotypeSuggestions({ term, cohortId, onUse }: { term: string; cohortId: number; onUse: (c: PhenotypeCohort) => void }) {
  const index = usePhenotypeIndex();
  if (!index) return null;
  const results = searchPhenotypes(index.phenotypes, term, 3);
  if (results.length === 0) return null;
  return (
    <div className="resolve">
      <p className="hint">Or use a published definition for the whole outcome:</p>
      <PhenotypeResults results={results} index={index} cohortId={cohortId} onUse={onUse} />
    </div>
  );
}

/** Summary of a phenotype outcome. */
export function PhenotypeCard({ cohort, onReplace }: { cohort: PhenotypeCohort; onReplace: () => void }) {
  const sets = circeConceptSets(cohort.circe);
  const entry = circeEntryConcepts(cohort.circe);
  const inclusionRules = Array.isArray(cohort.circe.InclusionRules) ? cohort.circe.InclusionRules.length : 0;
  return (
    <div className="phenotype-card">
      <p>
        <strong>{cohort.phenotype.name}</strong>{" "}
        <span className="hint">
          {cohort.phenotype.library} v{cohort.phenotype.version} #{cohort.phenotype.id} ·{" "}
          <a href={definitionUrl(cohort.phenotype.id, cohort.phenotype.version)} target="_blank" rel="noreferrer">
            view definition
          </a>
        </span>
      </p>
      <p className="hint">
        Used exactly as published: {entry.length} entry-event concept{entry.length === 1 ? "" : "s"}, {sets.length} concept set
        {sets.length === 1 ? "" : "s"}, {inclusionRules} inclusion rule{inclusionRules === 1 ? "" : "s"}.
      </p>
      <ul className="concept-sets">
        {sets.map((s) => (
          <li key={s.id}>
            {s.name || `Concept set ${s.id}`} <span className="hint">({s.concepts.length} items)</span>
          </li>
        ))}
      </ul>
      <button type="button" className="ghost small" onClick={onReplace}>
        Replace with a simple definition
      </button>
    </div>
  );
}
