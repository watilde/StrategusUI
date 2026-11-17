import { useState } from "react";
import type { DraftStudyIR } from "../ir/schema";
import { buildPrompt, buildRepairPrompt, parseDraft } from "../llm/prompt";
import { Section } from "./fields";

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function CopyButton({ text, label, className }: { text: () => string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text());
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/**
 * Copy-paste LLM harness: prompt out, JSON back in. No LLM is called from the
 * page and no API key is needed.
 */
export function LlmDraftPanel({ onLoad }: { onLoad: (draft: DraftStudyIR) => void }) {
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<string | null>(null);

  const load = () => {
    const result = parseDraft(reply);
    if (result.ok) {
      const unresolved = [result.draft.target, result.draft.comparator, ...result.draft.outcomes]
        .flatMap((c) => c.concepts)
        .filter((c) => c.conceptId === null).length;
      setErrors([]);
      setLoaded(
        `Loaded “${result.draft.title}”. ${unresolved ? `Resolve ${unresolved} concept${unresolved === 1 ? "" : "s"} below, then` : "Next,"} review every section and add negative controls.`,
      );
      onLoad(result.draft);
    } else {
      setLoaded(null);
      setErrors(result.errors);
    }
  };

  return (
    <Section title="Draft with an LLM">
      <ol className="steps">
        <li>
          <label className="field">
            <span className="field-label">Research question or PICO (free text, any language)</span>
            <textarea
              rows={3}
              value={question}
              placeholder="e.g. In adults with type 2 diabetes, do SGLT2 inhibitors reduce hospitalization for heart failure compared with DPP-4 inhibitors?"
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
        </li>
        <li>
          <div className="row">
            <CopyButton label="Copy prompt" text={() => buildPrompt(question)} />
            <button type="button" className="ghost" onClick={() => download("strategus-ui-prompt.md", buildPrompt(question))}>
              Download prompt template
            </button>
          </div>
          <p className="hint">
            Paste it into the LLM you use (ChatGPT, Claude, Gemini, a local model, …). The prompt asks for clinical terms instead of concept IDs;
            you match them to vocabulary concepts here. The template works without a question too: it has a placeholder to fill in.
          </p>
        </li>
        <li>
          <label className="field">
            <span className="field-label">Paste the LLM’s reply</span>
            <textarea rows={5} className="mono" value={reply} placeholder='{ "irVersion": "0.1", … }' onChange={(e) => setReply(e.target.value)} />
          </label>
          <div className="row">
            <button type="button" onClick={load} disabled={!reply.trim()}>
              Load draft
            </button>
          </div>
        </li>
      </ol>
      {loaded && <p className="notice ok">{loaded}</p>}
      {errors.length > 0 && (
        <div className="notice error">
          <p>The reply could not be loaded:</p>
          <ul>
            {errors.slice(0, 12).map((e, i) => (
              <li key={i} className="mono">
                {e}
              </li>
            ))}
            {errors.length > 12 && <li>…and {errors.length - 12} more</li>}
          </ul>
          <CopyButton className="ghost" label="Copy repair prompt" text={() => buildRepairPrompt(errors, reply)} />
          <span className="hint"> Send it to the same LLM conversation, then paste the new reply.</span>
        </div>
      )}
    </Section>
  );
}
