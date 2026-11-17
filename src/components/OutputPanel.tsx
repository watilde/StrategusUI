import { useState } from "react";
import type { Issue } from "../validate/semantic";

type Tab = "issues" | "spec" | "r" | "ir";

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function OutputPanel({
  issues,
  specJson,
  rScript,
  irJson,
  blocked,
}: {
  issues: Issue[];
  specJson: string | null;
  rScript: string | null;
  irJson: string;
  blocked: boolean;
}) {
  const [tab, setTab] = useState<Tab>("issues");
  const [copied, setCopied] = useState(false);
  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.filter((i) => i.level === "warning").length;

  const outputs: Record<Exclude<Tab, "issues">, { label: string; file: string; type: string; body: string | null }> = {
    spec: { label: "analysisSpecification.json", file: "analysisSpecification.json", type: "application/json", body: specJson },
    r: { label: "R script", file: "CreateAnalysisSpecification.R", type: "text/plain", body: rScript },
    ir: { label: "Study IR", file: "study-ir.json", type: "application/json", body: irJson },
  };

  const current = tab === "issues" ? null : outputs[tab];

  return (
    <div className="output">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "issues"} className={tab === "issues" ? "active" : ""} onClick={() => setTab("issues")}>
          Checks {errors > 0 ? <span className="badge error">{errors}</span> : warnings > 0 ? <span className="badge warning">{warnings}</span> : <span className="badge ok">OK</span>}
        </button>
        {(Object.keys(outputs) as (keyof typeof outputs)[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>
            {outputs[k].label}
          </button>
        ))}
      </div>

      {tab === "issues" && (
        <ul className="issues">
          {issues.length === 0 && <li className="issue ok">No issues found.</li>}
          {issues.map((i, n) => (
            <li key={n} className={`issue ${i.level}`}>
              <span className="issue-level">{i.level}</span>
              {i.path && <code>{i.path}</code>}
              <span>{i.message}</span>
            </li>
          ))}
        </ul>
      )}

      {current && (
        <>
          <div className="output-actions">
            {current.body && !(blocked && tab !== "ir") ? (
              <>
                <button type="button" onClick={() => download(current.file, current.body!, current.type)}>
                  Download
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={async () => {
                    await navigator.clipboard.writeText(current.body!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </>
            ) : (
              <span className="hint">Fix the errors in Checks to enable output.</span>
            )}
          </div>
          <pre className="code">{blocked && tab !== "ir" ? "" : current.body}</pre>
        </>
      )}
    </div>
  );
}
