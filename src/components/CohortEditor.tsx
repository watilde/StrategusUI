import { useState } from "react";
import type { CohortSpec, ConceptRef } from "../ir/schema";
import { EUNOMIA_CONCEPT_LIST } from "../vocab/eunomia";
import { Checkbox, Field, NumberInput, Select } from "./fields";

const KIND_LABEL: Record<CohortSpec["kind"], string> = {
  drug_new_user: "New users of a drug (first drug era)",
  condition_first: "First occurrence of a condition",
};
const KIND_DOMAIN: Record<CohortSpec["kind"], string> = {
  drug_new_user: "Drug",
  condition_first: "Condition",
};

function changeKind(cohort: CohortSpec, kind: CohortSpec["kind"]): CohortSpec {
  const base = { cohortId: cohort.cohortId, name: cohort.name, concepts: cohort.concepts };
  return kind === "drug_new_user" ? { ...base, kind, eraGapDays: 30 } : { ...base, kind };
}

export function CohortEditor({
  cohort,
  onChange,
  onRemove,
}: {
  cohort: CohortSpec;
  onChange: (c: CohortSpec) => void;
  onRemove?: () => void;
}) {
  const domain = KIND_DOMAIN[cohort.kind];
  const candidates = EUNOMIA_CONCEPT_LIST.filter(
    (c) => c.domainId === domain && !cohort.concepts.some((x) => x.conceptId === c.conceptId),
  );
  const [manual, setManual] = useState({ conceptId: "", conceptName: "", vocabularyId: "" });

  const setConcepts = (concepts: ConceptRef[]) => onChange({ ...cohort, concepts });
  const addManual = () => {
    const id = Number.parseInt(manual.conceptId, 10);
    if (!id || !manual.conceptName) return;
    setConcepts([
      ...cohort.concepts,
      {
        conceptId: id,
        conceptName: manual.conceptName,
        domainId: domain,
        vocabularyId: manual.vocabularyId || "Unknown",
        conceptClassId: "",
        conceptCode: "",
        standardConcept: "S",
        includeDescendants: true,
      },
    ]);
    setManual({ conceptId: "", conceptName: "", vocabularyId: "" });
  };

  return (
    <div className="cohort">
      <div className="row">
        <Field label="Cohort name">
          <input value={cohort.name} onChange={(e) => onChange({ ...cohort, name: e.target.value })} />
        </Field>
        <Field label="cohortId">
          <NumberInput value={cohort.cohortId} min={1} onChange={(v) => onChange({ ...cohort, cohortId: v ?? 1 })} />
        </Field>
        {onRemove && (
          <button type="button" className="ghost danger" onClick={onRemove} aria-label="Remove cohort">
            Remove
          </button>
        )}
      </div>
      <div className="row">
        <Field label="Type">
          <Select
            value={cohort.kind}
            options={(Object.keys(KIND_LABEL) as CohortSpec["kind"][]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            onChange={(k) => onChange(changeKind(cohort, k))}
          />
        </Field>
        {cohort.kind === "drug_new_user" && (
          <Field label="Era persistence gap (days)">
            <NumberInput value={cohort.eraGapDays} min={0} onChange={(v) => onChange({ ...cohort, eraGapDays: v ?? 0 })} />
          </Field>
        )}
      </div>

      <table className="concepts">
        <thead>
          <tr>
            <th>Concept ID</th>
            <th>Name</th>
            <th>Vocabulary</th>
            <th>Descendants</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {cohort.concepts.map((c, i) => (
            <tr key={c.conceptId}>
              <td className="mono">{c.conceptId}</td>
              <td>{c.conceptName}</td>
              <td>{c.vocabularyId}</td>
              <td>
                <input
                  type="checkbox"
                  checked={c.includeDescendants}
                  aria-label={`Include descendants of ${c.conceptName}`}
                  onChange={(e) =>
                    setConcepts(cohort.concepts.map((x, j) => (j === i ? { ...x, includeDescendants: e.target.checked } : x)))
                  }
                />
              </td>
              <td>
                <button
                  type="button"
                  className="ghost"
                  aria-label={`Remove ${c.conceptName}`}
                  onClick={() => setConcepts(cohort.concepts.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
          {cohort.concepts.length === 0 && (
            <tr>
              <td colSpan={5} className="empty">
                No concepts selected
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="row add-concept">
        {candidates.length > 0 && (
          <select
            value=""
            aria-label="Add a concept from the demo vocabulary"
            onChange={(e) => {
              const c = candidates.find((x) => String(x.conceptId) === e.target.value);
              if (c) setConcepts([...cohort.concepts, c]);
            }}
          >
            <option value="">Add from demo vocabulary (Eunomia)…</option>
            {candidates.map((c) => (
              <option key={c.conceptId} value={c.conceptId}>
                {c.conceptName} ({c.conceptId})
              </option>
            ))}
          </select>
        )}
        <details>
          <summary>Enter a concept ID manually</summary>
          <div className="row">
            <input
              placeholder="Concept ID"
              inputMode="numeric"
              value={manual.conceptId}
              onChange={(e) => setManual({ ...manual, conceptId: e.target.value })}
            />
            <input
              placeholder="Name"
              value={manual.conceptName}
              onChange={(e) => setManual({ ...manual, conceptName: e.target.value })}
            />
            <input
              placeholder="Vocabulary (e.g. RxNorm)"
              value={manual.vocabularyId}
              onChange={(e) => setManual({ ...manual, vocabularyId: e.target.value })}
            />
            <button type="button" onClick={addManual}>
              Add
            </button>
          </div>
          <p className="hint">Manually entered concepts are not checked against a vocabulary. Vocabulary search replaces this in step 2.</p>
        </details>
      </div>
      <Checkbox
        checked={cohort.concepts.every((c) => c.includeDescendants)}
        onChange={(v) => setConcepts(cohort.concepts.map((c) => ({ ...c, includeDescendants: v })))}
        label="Include descendants for all concepts"
      />
    </div>
  );
}
