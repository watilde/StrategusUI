import { useState } from "react";
import type { VocabularySource } from "../vocab/types";
import { Checkbox, Section } from "./fields";

type Files = { concept?: File; synonym?: File; ancestor?: File };

function formatSize(bytes: number): string {
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${Math.ceil(bytes / 1e3)} KB`;
}

function FileInput({ label, file, required, onChange }: { label: string; file?: File; required?: boolean; onChange: (f?: File) => void }) {
  return (
    <label className="file-input">
      <span className="field-label">
        {label}
        {required ? "" : " (optional)"}
      </span>
      <input type="file" accept=".csv,.tsv,.txt,.parquet" onChange={(e) => onChange(e.target.files?.[0])} />
      {file && <span className="hint">{formatSize(file.size)}</span>}
    </label>
  );
}

export function VocabularyPanel({
  vocabulary,
  onUseDemo,
  onOpenAthena,
}: {
  vocabulary: VocabularySource | null;
  onUseDemo: () => void;
  onOpenAthena: (files: Required<Pick<Files, "concept">> & Files, standardOnly: boolean) => Promise<void>;
}) {
  const [files, setFiles] = useState<Files>({});
  const [standardOnly, setStandardOnly] = useState(true);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  const load = async () => {
    if (!files.concept) return;
    setStatus("loading");
    setError("");
    try {
      await onOpenAthena({ ...files, concept: files.concept }, standardOnly);
      setStatus("idle");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  };

  return (
    <Section title="Vocabulary">
      <p className="vocab-status">
        <strong>{vocabulary ? vocabulary.label : "Loading…"}</strong>
        {vocabulary?.kind === "athena" && (
          <button type="button" className="ghost small" onClick={onUseDemo}>
            Switch to demo vocabulary
          </button>
        )}
      </p>
      <details>
        <summary>Use your own Athena vocabulary</summary>
        <p className="hint">
          Download vocabularies from <a href="https://athena.ohdsi.org/" target="_blank" rel="noreferrer">athena.ohdsi.org</a> and select the
          files from the unzipped folder. They are read inside this browser with DuckDB-WASM and are never uploaded. Parquet files with the same
          columns also work.
        </p>
        <div className="file-inputs">
          <FileInput label="CONCEPT.csv" required file={files.concept} onChange={(concept) => setFiles({ ...files, concept })} />
          <FileInput label="CONCEPT_SYNONYM.csv" file={files.synonym} onChange={(synonym) => setFiles({ ...files, synonym })} />
          <FileInput label="CONCEPT_ANCESTOR.csv" file={files.ancestor} onChange={(ancestor) => setFiles({ ...files, ancestor })} />
        </div>
        <Checkbox
          checked={standardOnly}
          onChange={setStandardOnly}
          label="Import standard and classification concepts only (recommended; keeps memory use down)"
        />
        <div className="row">
          <button type="button" disabled={!files.concept || status === "loading"} onClick={load}>
            {status === "loading" ? "Loading… (large files take a minute)" : "Load vocabulary"}
          </button>
        </div>
        {status === "error" && <p className="hint error-text">Could not load the vocabulary: {error}</p>}
      </details>
    </Section>
  );
}
