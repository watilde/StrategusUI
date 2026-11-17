import { useState } from "react";

/**
 * States, in the app, what never leaves the browser and how that is enforced.
 * Keep this in sync with CONTENT_SECURITY_POLICY in vite.config.ts.
 */
export function ZeroTransmission() {
  const [open, setOpen] = useState(false);
  return (
    <div className="zero-transmission">
      <button
        type="button"
        className="zt-badge"
        aria-expanded={open}
        aria-controls="zero-transmission-details"
        onClick={() => setOpen(!open)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 1 2 3.5v4C2 11 4.6 14 8 15c3.4-1 6-4 6-7.5v-4L8 1Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="m5.5 8 1.8 1.8L10.8 6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        Zero transmission
      </button>
      {open && (
        <div className="zt-details" id="zero-transmission-details" role="region" aria-label="Zero transmission">
          <p>
            <strong>Nothing you type, paste or load leaves this browser.</strong>
          </p>
          <ul>
            <li>Your research question, the study, LLM replies and vocabulary files stay here. Athena files are read in place with DuckDB-WASM, not uploaded.</li>
            <li>The page never calls an LLM. You copy the prompt and paste the reply yourself, so you decide which LLM sees your question.</li>
            <li>The JSON and R script you download are created in the browser.</li>
            <li>
              The page only downloads its own files from this site: the app, the demo vocabulary, DuckDB-WASM and PhenotypeLibrary definitions. A
              Content-Security-Policy makes the browser block requests to any other site, so this is enforced, not just intended.
            </li>
          </ul>
          <p className="hint">
            Like any website, the host (GitHub Pages) sees the requests for this site’s files, for example which PhenotypeLibrary definition was
            opened. Links to other sites (Athena, GitHub) open only when you click them. To check for yourself, open your browser’s developer tools
            and watch the Network tab.
          </p>
        </div>
      )}
    </div>
  );
}
