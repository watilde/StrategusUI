import type { NegativeControl, StudyIR } from "../ir/schema";
import type { VocabularySource } from "../vocab/types";
import { EUNOMIA_NEGATIVE_CONTROLS } from "../vocab/eunomia";
import { ConceptSearch } from "./ConceptSearch";

export const NEGATIVE_CONTROL_ID_START = 10000;

function nextId(ir: StudyIR): number {
  const ids = [ir.target, ir.comparator, ...ir.outcomes].map((c) => c.cohortId).concat(ir.negativeControls.map((n) => n.cohortId));
  return Math.max(NEGATIVE_CONTROL_ID_START - 1, ...ids) + 1;
}

export function NegativeControlEditor({
  ir,
  vocabulary,
  onChange,
}: {
  ir: StudyIR;
  vocabulary: VocabularySource | null;
  onChange: (ncs: NegativeControl[]) => void;
}) {
  const settings = ir.negativeControlSettings;
  return (
    <>
      <p className="hint">
        Outcomes not believed to be caused by either exposure; used for empirical calibration. {ir.negativeControls.length} selected (
        {settings.occurrenceType} occurrence, {settings.detectOnDescendants ? "including" : "excluding"} descendants).
      </p>
      <div className="row">
        <button type="button" className="ghost" onClick={() => onChange(EUNOMIA_NEGATIVE_CONTROLS)}>
          Use the 12 from the Strategus example
        </button>
        <button type="button" className="ghost" onClick={() => onChange([])} disabled={ir.negativeControls.length === 0}>
          Clear
        </button>
      </div>
      {ir.negativeControls.length > 0 && (
        <table className="concepts">
          <thead>
            <tr>
              <th>Cohort ID</th>
              <th>Concept ID</th>
              <th>Name</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ir.negativeControls.map((n) => (
              <tr key={n.cohortId}>
                <td className="mono">{n.cohortId}</td>
                <td className="mono">{n.outcomeConceptId}</td>
                <td>{n.name}</td>
                <td>
                  <button
                    type="button"
                    className="ghost"
                    aria-label={`Remove ${n.name}`}
                    onClick={() => onChange(ir.negativeControls.filter((x) => x.cohortId !== n.cohortId))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ConceptSearch
        vocabulary={vocabulary}
        domainId="Condition"
        excludeIds={ir.negativeControls.map((n) => n.outcomeConceptId)}
        placeholder="Add a negative control outcome"
        onPick={(c) => onChange([...ir.negativeControls, { cohortId: nextId(ir), name: c.conceptName, outcomeConceptId: c.conceptId }])}
      />
    </>
  );
}
