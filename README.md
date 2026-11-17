# PICO-to-Strategus UI

**Under development.**

Build [OHDSI Strategus](https://github.com/OHDSI/Strategus) analysis specifications in the browser.
It is a static site (GitHub Pages): no server, and nothing you enter leaves your browser.

Current scope: comparative cohort studies with **CohortGenerator + CohortMethod**, entered through a form,
with concept search over a vocabulary. The Eunomia GiBleed example (celecoxib vs diclofenac → GI bleed) is built in.

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
- **Vocabulary** (`src/vocab/`). Two interchangeable sources behind one interface:
  - the **Eunomia demo vocabulary** (445 concepts, bundled, loaded lazily), searched in memory;
  - **your own Athena vocabulary**: `CONCEPT.csv` (+ optional `CONCEPT_SYNONYM.csv`, `CONCEPT_ANCESTOR.csv`)
    read in place with DuckDB-WASM through the File API. Nothing is uploaded. The WASM is self-hosted and only
    downloaded when you load a vocabulary.

  Both sources share one definition of search (`src/vocab/search.ts`): concept ID, exact code, or all tokens in the
  name or a synonym, ranked identically. Tests run the DuckDB SQL on native DuckDB and require the same results as
  the in-memory search.
- **Validation layers**
  1. Zod schema (`StudyIRSchema`)
  2. Semantic rules (`src/validate/semantic.ts`): duplicate IDs, domain mismatches, time at risk, negative controls, …
  3. Concept checks against the loaded vocabulary (`src/validate/concepts.ts`): the ID exists, is valid and standard,
     and its name and domain match what the study says. This is what will catch wrong or hallucinated IDs once an LLM drafts the IR.
  4. R build: Circe SQL rendering for every cohort plus Strategus/CohortMethod constructors (CI)
  5. Execution on the Eunomia synthetic CDM (CI)

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

To refresh the bundled demo vocabulary: `Rscript r/extract-eunomia-vocab.R src/vocab/eunomia-vocab.json`.

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
2. ✅ Concept search: bundled Eunomia vocabulary + user-provided Athena vocabulary via DuckDB-WASM (read locally, never uploaded);
   descendant preview; concept checks
3. LLM, copy-paste mode: generate a prompt with the IR JSON Schema, paste the answer back, validate, generate a repair prompt
4. LLM, bring-your-own-key mode (direct browser calls)
5. OHDSI PhenotypeLibrary reuse; CohortDiagnostics module

## Limitations

- Cohorts are template-based: new users of a drug (first drug era) and first occurrence of a condition.
- The demo vocabulary is the small Eunomia subset; it has almost no hierarchy, so descendant previews need an Athena vocabulary.
- Source codes (ICD-10-CM, NDC, …) are not yet mapped to standard concepts (`CONCEPT_RELATIONSHIP` "Maps to").
- The descendant preview scans `CONCEPT_ANCESTOR` on demand; with a full vocabulary this takes a while.
- Importing a vocabulary happens again on every page load (no browser persistence yet).
- Negative controls are picked by hand (or the 12 from the Strategus example); there is no candidate generation.
