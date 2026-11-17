import { useRef, useState } from "react";
import type { DraftStudyIR } from "../ir/schema";
import { buildFixPrompt, buildPrompt, buildRepairPrompt, fixableIssues, parseDraft } from "../llm/prompt";
import type { Issue } from "../validate/semantic";
import { Section } from "./fields";

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function scrollTo(selector: string) {
  const el = document.querySelector(selector);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (el instanceof HTMLElement) el.focus({ preventScroll: true });
}

function useFlash(): [string | null, (key: string) => void] {
  const [flash, setFlash] = useState<string | null>(null);
  return [
    flash,
    (key) => {
      setFlash(key);
      setTimeout(() => setFlash((k) => (k === key ? null : k)), 1500);
    },
  ];
}

type Status =
  | { kind: "idle" }
  | { kind: "loaded"; title: string; previous: DraftStudyIR }
  | { kind: "invalid"; errors: string[]; reply: string }
  | { kind: "awaiting-repair"; errors: string[] }
  | { kind: "awaiting-fix" };

/**
 * Copy-paste LLM harness: prompt out, JSON back in. No LLM is called from the
 * page and no API key is needed. The loop is kept short: pasting a reply loads
 * it, repair and fix prompts reset the reply box for the next paste, and a
 * checklist points to what is left after loading.
 */
export function LlmDraftPanel({
  ir,
  issues,
  onLoad,
}: {
  ir: DraftStudyIR;
  issues: Issue[];
  onLoad: (draft: DraftStudyIR) => void;
}) {
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [flash, setFlash] = useFlash();
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setFlash(key);
  };

  const load = (text: string) => {
    const result = parseDraft(text);
    if (result.ok) {
      setStatus({ kind: "loaded", title: result.draft.title, previous: ir });
      setReply("");
      onLoad(result.draft);
    } else {
      setStatus({ kind: "invalid", errors: result.errors, reply: text });
    }
  };

  const waitForPaste = (next: Status) => {
    setStatus(next);
    setReply("");
    replyRef.current?.focus();
  };

  const unresolved = issues.filter((i) => i.source === "unresolved").length;
  const fixable = fixableIssues(issues);
  const blocking = issues.some((i) => i.level === "error");
  const showSteps = status.kind === "loaded" || status.kind === "awaiting-fix";

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
            <button
              type="button"
              onClick={async () => {
                await copy("prompt", buildPrompt(question));
                replyRef.current?.focus();
              }}
            >
              {flash === "prompt" ? "Copied: now paste the reply below" : "Copy prompt"}
            </button>
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
            <span className="field-label">
              {status.kind === "awaiting-repair"
                ? "Paste the corrected reply"
                : status.kind === "awaiting-fix"
                  ? "Paste the revised reply"
                  : "Paste the LLM’s reply"}
            </span>
            <textarea
              ref={replyRef}
              rows={5}
              className="mono"
              value={reply}
              placeholder='{ "irVersion": "0.1", … }   (loads as soon as you paste)'
              onChange={(e) => setReply(e.target.value)}
              onPaste={(e) => {
                // Load right away when the paste replaces the whole box (the usual case).
                const pasted = e.clipboardData.getData("text");
                const el = e.currentTarget;
                const replacesAll = el.value === "" || (el.selectionStart === 0 && el.selectionEnd === el.value.length);
                if (replacesAll && pasted.trim()) {
                  e.preventDefault();
                  setReply(pasted);
                  load(pasted);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && reply.trim()) {
                  e.preventDefault();
                  load(reply);
                }
              }}
            />
          </label>
          <div className="row">
            <button type="button" onClick={() => load(reply)} disabled={!reply.trim()}>
              Load draft
            </button>
            <span className="hint">Pasting loads automatically; Ctrl/⌘ + Enter loads after editing.</span>
          </div>
        </li>
      </ol>

      {status.kind === "invalid" && (
        <div className="notice error" role="alert">
          <p>The reply could not be loaded:</p>
          <ul>
            {status.errors.slice(0, 12).map((e, i) => (
              <li key={i} className="mono">
                {e}
              </li>
            ))}
            {status.errors.length > 12 && <li>…and {status.errors.length - 12} more</li>}
          </ul>
          <button
            type="button"
            onClick={async () => {
              await copy("repair", buildRepairPrompt(status.errors, status.reply));
              waitForPaste({ kind: "awaiting-repair", errors: status.errors });
            }}
          >
            Copy repair prompt
          </button>
          <span className="hint"> Send it in the same LLM conversation; the box above is cleared for the corrected reply.</span>
        </div>
      )}
      {status.kind === "awaiting-repair" && (
        <p className="notice info">Repair prompt copied. Send it in the same conversation, then paste the corrected reply above.</p>
      )}
      {status.kind === "awaiting-fix" && (
        <p className="notice info">Fix prompt copied. Send it in the same conversation, then paste the revised reply above.</p>
      )}

      {showSteps && (
        <div className="next-steps">
          {status.kind === "loaded" && (
            <p className="notice ok">
              Loaded “{status.title}”.{" "}
              <button type="button" className="ghost small" onClick={() => {
                onLoad(status.previous);
                setStatus({ kind: "idle" });
              }}>
                Undo
              </button>
            </p>
          )}
          <p className="field-label">Next steps</p>
          <ul className="checklist">
            <li className={unresolved ? "todo" : "done"}>
              {unresolved ? `Match ${unresolved} term${unresolved === 1 ? "" : "s"} to vocabulary concepts` : "All terms matched to concepts"}
              {unresolved > 0 && (
                <button type="button" className="ghost small" onClick={() => scrollTo(".unresolved-row")}>
                  Go
                </button>
              )}
            </li>
            <li className={fixable.length ? "todo" : "done"}>
              {fixable.length
                ? `Fix ${fixable.length} problem${fixable.length === 1 ? "" : "s"} found by the checks`
                : "No study-level problems found"}
              {fixable.length > 0 && (
                <>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={async () => {
                      await copy("fix", buildFixPrompt(issues, ir));
                      waitForPaste({ kind: "awaiting-fix" });
                    }}
                  >
                    {flash === "fix" ? "Copied" : "Copy fix prompt"}
                  </button>
                  <button type="button" className="ghost small" onClick={() => scrollTo("#output")}>
                    Show
                  </button>
                </>
              )}
            </li>
            <li className={ir.negativeControls.length ? "done" : "todo"}>
              {ir.negativeControls.length ? `${ir.negativeControls.length} negative controls` : "Add negative controls"}
              {ir.negativeControls.length === 0 && (
                <button type="button" className="ghost small" onClick={() => scrollTo("#section-negative-controls")}>
                  Go
                </button>
              )}
            </li>
            <li className={blocking ? "todo" : "done"}>
              {blocking ? "Download (after fixing errors)" : "Download analysisSpecification.json or the R script"}
              {!blocking && (
                <button type="button" className="ghost small" onClick={() => scrollTo("#output")}>
                  Go
                </button>
              )}
            </li>
          </ul>
          <p className="hint">Review every section below as well: the LLM may have made choices you would not.</p>
        </div>
      )}
    </Section>
  );
}
