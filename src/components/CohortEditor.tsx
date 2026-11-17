import { Fragment, useState } from "react";
import type { CohortSpec, ConceptRef } from "../ir/schema";
import { toConceptRef, type VocabularySource } from "../vocab/types";
import { ConceptSearch } from "./ConceptSearch";
import { DescendantPreview } from "./DescendantPreview";
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

function ManualConcept({ domainId, onAdd }: { domainId: string; onAdd: (c: ConceptRef) => void }) {
  const [form, setForm] = useState({ conceptId: "", conceptName: "", vocabularyId: "" });
  const add = () => {
    const id = Number.parseInt(form.conceptId, 10);
    if (!id || !form.conceptName) return;
    onAdd({
      conceptId: id,
      conceptName: form.conceptName,
      domainId,
      vocabularyId: form.vocabularyId || "Unknown",
      conceptClassId: "",
      conceptCode: "",
      standardConcept: "S",
      includeDescendants: true,
    });
    setForm({ conceptId: "", conceptName: "", vocabularyId: "" });
  };
  return (
    <details>
      <summary>Enter a concept manually</summary>
      <div className="row">
        <input placeholder="Concept ID" inputMode="numeric" value={form.conceptId} onChange={(e) => setForm({ ...form, conceptId: e.target.value })} />
        <input placeholder="Name" value={form.conceptName} onChange={(e) => setForm({ ...form, conceptName: e.target.value })} />
        <input placeholder="Vocabulary (e.g. RxNorm)" value={form.vocabularyId} onChange={(e) => setForm({ ...form, vocabularyId: e.target.value })} />
        <button type="button" onClick={add}>
          Add
        </button>
      </div>
      <p className="hint">For concepts that are not in the loaded vocabulary. Checks will flag them as not found.</p>
    </details>
  );
}

export function CohortEditor({
  cohort,
  vocabulary,
  onChange,
  onRemove,
}: {
  cohort: CohortSpec;
  vocabulary: VocabularySource | null;
  onChange: (c: CohortSpec) => void;
  onRemove?: () => void;
}) {
  const domain = KIND_DOMAIN[cohort.kind];
  const [preview, setPreview] = useState<number | null>(null);
  const setConcepts = (concepts: ConceptRef[]) => onChange({ ...cohort, concepts });

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
            <Fragment key={c.conceptId}>
              <tr>
                <td className="mono">{c.conceptId}</td>
                <td>{c.conceptName}</td>
                <td>{c.vocabularyId}</td>
                <td className="nowrap">
                  <input
                    type="checkbox"
                    checked={c.includeDescendants}
                    aria-label={`Include descendants of ${c.conceptName}`}
                    onChange={(e) => setConcepts(cohort.concepts.map((x, j) => (j === i ? { ...x, includeDescendants: e.target.checked } : x)))}
                  />{" "}
                  {vocabulary && (
                    <button
                      type="button"
                      className="ghost small"
                      aria-expanded={preview === c.conceptId}
                      onClick={() => setPreview(preview === c.conceptId ? null : c.conceptId)}
                    >
                      {preview === c.conceptId ? "Hide" : "Preview"}
                    </button>
                  )}
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
              {preview === c.conceptId && vocabulary && (
                <tr className="preview-row">
                  <td colSpan={5}>
                    <DescendantPreview vocabulary={vocabulary} conceptId={c.conceptId} />
                  </td>
                </tr>
              )}
            </Fragment>
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

      <ConceptSearch
        vocabulary={vocabulary}
        domainId={domain}
        excludeIds={cohort.concepts.map((c) => c.conceptId)}
        placeholder={`Add a ${domain.toLowerCase()} concept: name, code or concept ID`}
        onPick={(c) => setConcepts([...cohort.concepts, toConceptRef(c)])}
      />
      <ManualConcept domainId={domain} onAdd={(c) => setConcepts([...cohort.concepts, c])} />
      {cohort.concepts.length > 1 && (
        <Checkbox
          checked={cohort.concepts.every((c) => c.includeDescendants)}
          onChange={(v) => setConcepts(cohort.concepts.map((c) => ({ ...c, includeDescendants: v })))}
          label="Include descendants for all concepts"
        />
      )}
    </div>
  );
}
