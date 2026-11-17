import { useEffect, useId, useState } from "react";
import type { Concept, VocabularySource } from "../vocab/types";
import { Checkbox } from "./fields";

export function ConceptSearch({
  vocabulary,
  domainId,
  excludeIds = [],
  onPick,
  placeholder = "Search by name, code or concept ID",
}: {
  vocabulary: VocabularySource | null;
  domainId?: string;
  excludeIds?: number[];
  onPick: (c: Concept) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [anyDomain, setAnyDomain] = useState(false);
  const [nonStandard, setNonStandard] = useState(false);
  const [results, setResults] = useState<Concept[]>([]);
  const [state, setState] = useState<"idle" | "searching" | "error">("idle");
  const [error, setError] = useState("");
  const listId = useId();

  useEffect(() => {
    if (!vocabulary || !text.trim()) {
      setResults([]);
      setState("idle");
      return;
    }
    let cancelled = false;
    setState("searching");
    const timer = setTimeout(async () => {
      try {
        const found = await vocabulary.search({
          text,
          domainId: anyDomain ? undefined : domainId,
          standardOnly: !nonStandard,
          limit: 30,
        });
        if (!cancelled) {
          setResults(found);
          setState("idle");
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setState("error");
        }
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [vocabulary, text, anyDomain, nonStandard, domainId]);

  if (!vocabulary) return <p className="hint">Loading vocabulary…</p>;

  return (
    <div className="concept-search">
      <input
        type="search"
        value={text}
        placeholder={placeholder}
        aria-label="Search concepts"
        aria-controls={listId}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="search-options">
        {domainId && <Checkbox checked={anyDomain} onChange={setAnyDomain} label={`Any domain (not just ${domainId})`} />}
        <Checkbox checked={nonStandard} onChange={setNonStandard} label="Include non-standard" />
        <span className="hint">{vocabulary.label}</span>
      </div>
      {state === "error" && <p className="hint error-text">Search failed: {error}</p>}
      {text.trim() && (
        <ul className="search-results" id={listId}>
          {state === "searching" && results.length === 0 && <li className="hint">Searching…</li>}
          {state === "idle" && results.length === 0 && <li className="hint">No matching concepts.</li>}
          {results.map((c) => {
            const added = excludeIds.includes(c.conceptId);
            return (
              <li key={c.conceptId} className={c.standardConcept === "S" ? "" : "non-standard"}>
                <div className="result-main">
                  <span className="result-name">{c.conceptName}</span>
                  <span className="result-meta mono">
                    {c.conceptId} · {c.vocabularyId} {c.conceptCode} · {c.conceptClassId} · {c.domainId}
                    {c.standardConcept !== "S" && ` · ${c.standardConcept === "C" ? "classification" : "non-standard"}`}
                  </span>
                </div>
                <button type="button" className="ghost" disabled={added} onClick={() => onPick(c)}>
                  {added ? "Added" : "Add"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
