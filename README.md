# PICO-to-Strategus UI

Build [OHDSI Strategus](https://github.com/OHDSI/Strategus) analysis specifications in the browser.
It is a static site (GitHub Pages): no server, and nothing you enter leaves your browser.

Current scope (step 1): comparative cohort studies with **CohortGenerator + CohortMethod**,
entered through a form. The Eunomia GiBleed example (celecoxib vs diclofenac → GI bleed) is built in.

## Architecture

```
form (later: LLM draft) ──► Study IR (Zod) ──► TypeScript compiler ──► analysisSpecification.json
                               │                    ▲                  CreateAnalysisSpecification.R
                               │                    │ templates
                               └──► r/strategus-from-ir.R (official R APIs) ── CI: must produce the same JSON
```

- **Study IR** (`src/ir/schema.ts`) is the only thing a person (or, later, an LLM) writes.
  It is small and domain-oriented; it does not mirror Strategus' JSON.
- **The compiler** (`src/compiler/strategus.ts`, `src/cohorts/circe.ts`) is deterministic.
  It never invents CohortMethod / FeatureExtraction / Cyclops defaults: the full settings of each
  analysis preset come from `src/compiler/templates/cm-templates.json`, which is generated from the
  output of the official R functions. Only IR-driven fields are replaced.
- **R is the reference implementation**, used only in CI (and on the user's machine, via the
  downloadable R script). `r/strategus-from-ir.R` builds the same specification with
  `Strategus`, `CohortMethod::createCmAnalysis()` and friends. The R script that the UI offers
  for download embeds this file verbatim.
- **Validation layers**
  1. Zod schema (`StudyIRSchema`)
  2. Semantic rules (`src/validate/semantic.ts`): duplicate IDs, domain mismatches, time at risk, negative controls, …
  3. R build: Circe SQL rendering for every cohort plus Strategus/CohortMethod constructors (CI)
  4. Execution on the Eunomia synthetic CDM (CI)

## Development

```sh
npm install
npm run dev        # http://localhost:5173/StrategusUI/
npm test           # includes TypeScript-vs-R comparison against tests/golden/*.spec.r.json
npm run build      # static site in dist/
```

### Working with R (optional locally, always in CI)

Requires R ≥ 4.4 and Java (for DatabaseConnector).

```sh
Rscript r/install.R                                  # Strategus 1.6.0, CohortMethod 6, Eunomia, …
npm run fixtures:export                              # fixtures/out/<name>/{ir.json,cohorts/,spec.ts.json,CreateAnalysisSpecification.R}
Rscript r/build-golden.R fixtures/out/*              # adds spec.r.json (official R APIs)
npm run golden:compare                               # TypeScript output must match
Rscript r/run-eunomia.R fixtures/out/gibleed/spec.ts.json   # execute on Eunomia
```

When you add or change a CohortMethod preset (in `r/strategus-from-ir.R` **and** `CmPresetSchema`),
or upgrade the R packages:

```sh
npm run fixtures:export && Rscript r/build-golden.R fixtures/out/*
npm run templates:extract                            # rewrites src/compiler/templates/cm-templates.json
for n in gibleed allPresets variant; do cp fixtures/out/$n/spec.r.json tests/golden/$n.spec.r.json; done
```

## Deployment

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every push to `main`.
Enable it once under **Settings → Pages → Source: GitHub Actions**.
`.github/workflows/r-golden.yml` runs the R checks on changes and weekly (to catch upstream package changes).

## Roadmap

1. ✅ Form → IR → CohortGenerator + CohortMethod JSON and R script; CI checks against R and Eunomia
2. Concept search: bundled Eunomia subset + user-provided Athena vocabulary via DuckDB-WASM (read locally, never uploaded)
3. LLM, copy-paste mode: generate a prompt with the IR JSON Schema, paste the answer back, validate, generate a repair prompt
4. LLM, bring-your-own-key mode (direct browser calls)
5. OHDSI PhenotypeLibrary reuse; CohortDiagnostics module

## Limitations

- Cohorts are template-based: new users of a drug (first drug era) and first occurrence of a condition.
- The demo vocabulary contains only the concepts of the GiBleed example; other concepts can be entered by ID but are not checked against a vocabulary.
- Negative controls are the 12 from the Strategus example study.
