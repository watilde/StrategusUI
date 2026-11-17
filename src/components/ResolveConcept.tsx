import { useEffect, useState } from "react";
import type { Concept, VocabularySource } from "../vocab/types";

/**
 * Candidate matches for an unresolved concept (a term written by an LLM or a
 * person without an ID). A person picks one; nothing is resolved automatically.
 */
export function ResolveConcept({
  term,
  domainId,
  vocabulary,
  onPick,
}: {
  term: string;
  domainId: string;
  vocabulary: VocabularySource | null;
  onPick: (c: Concept) => void;
}) {
  const [candidates, setCandidates] = useState<Concept[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vocabulary) return;
    let cancelled = false;
    setCandidates(null);
    setError(null);
    vocabulary.search({ text: term, domainId, limit: 5 }).then(
      (found) => !cancelled && setCandidates(found),
      (e: Error) => !cancelled && setError(e.message),
    );
    return () => {
      cancelled = true;
    };
  }, [vocabulary, term, domainId]);

  if (!vocabulary) return <p className="hint">Loading vocabulary…</p>;
  if (error) return <p className="hint error-text">Search failed: {error}</p>;
  if (!candidates) return <p className="hint">Looking up “{term}”…</p>;

  return (
    <div className="resolve">
      {candidates.length === 0 ? (
        <p className="hint">
          No {domainId.toLowerCase()} concept matches “{term}” in {vocabulary.label}. Use the search below to find it, then remove this row.
        </p>
      ) : (
        <>
          <p className="hint">Choose the concept for “{term}”:</p>
          <ul className="search-results">
            {candidates.map((c) => (
              <li key={c.conceptId}>
                <div className="result-main">
                  <span className="result-name">{c.conceptName}</span>
                  <span className="result-meta mono">
                    {c.conceptId} · {c.vocabularyId} {c.conceptCode} · {c.conceptClassId}
                  </span>
                </div>
                <button type="button" onClick={() => onPick(c)}>
                  Use
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
