import { useEffect, useState } from "react";
import type { Descendants, VocabularySource } from "../vocab/types";

/** Shows what "include descendants" pulls in, so people can check recall and over-inclusion. */
export function DescendantPreview({ vocabulary, conceptId }: { vocabulary: VocabularySource; conceptId: number }) {
  const [data, setData] = useState<Descendants | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    vocabulary.descendants?.(conceptId, 100).then(
      (d) => !cancelled && setData(d),
      (e: Error) => !cancelled && setError(e.message),
    );
    return () => {
      cancelled = true;
    };
  }, [vocabulary, conceptId]);

  if (!vocabulary.descendants) {
    return <p className="hint">Load CONCEPT_ANCESTOR.csv with your vocabulary to preview descendants.</p>;
  }
  if (error) return <p className="hint error-text">Could not load descendants: {error}</p>;
  if (!data) {
    return (
      <p className="hint">
        Loading descendants…{vocabulary.kind === "athena" && " (scans CONCEPT_ANCESTOR; this can take a while for a full vocabulary)"}
      </p>
    );
  }
  if (data.total === 0) {
    return (
      <p className="hint">
        No descendants in {vocabulary.label}.
        {vocabulary.kind === "eunomia" && " The demo vocabulary has almost no hierarchy; load an Athena vocabulary for a real preview."}
      </p>
    );
  }
  return (
    <div className="descendants">
      <p className="hint">
        {data.total.toLocaleString("en-US")} descendant{data.total === 1 ? "" : "s"}
        {data.total > data.concepts.length && ` (showing ${data.concepts.length})`}
      </p>
      <ul>
        {data.concepts.map((c) => (
          <li key={c.conceptId}>
            <span className="mono">{c.conceptId}</span> {c.conceptName}{" "}
            <span className="hint">
              {c.vocabularyId} · {c.conceptClassId} · level {c.levels}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
