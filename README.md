# Strategus UI

**Under development.**

From a PICO question to an [OHDSI Strategus](https://github.com/OHDSI/Strategus) analysis specification, built in the browser.
It is a static site (GitHub Pages): no server, and nothing you enter leaves your browser.

Current scope: comparative cohort studies with **CohortGenerator + CohortDiagnostics + CohortMethod**, drafted with any
LLM through a copy-paste prompt (or entered through the form), with concept search over a vocabulary and outcomes that
can reuse published definitions from the OHDSI PhenotypeLibrary. The Eunomia GiBleed example (celecoxib vs diclofenac → GI bleed) is built in.

## Architecture

```
LLM (copy-paste) / form ──► Study IR (Zod) ──► TypeScript compiler ──► analysisSpecification.json
                               │                    ▲                  CreateAnalysisSpecification.R
                               │                    │ templates
                               └──► r/strategus-from-ir.R (official R APIs) ── CI: must produce the same JSON
```

- **Study IR** (`src/ir/schema.ts`) is the only thing a person or an LLM writes.
  It is small and domain-oriented; it does not mirror Strategus' JSON.
  A *draft* IR may contain unresolved concepts (`{"conceptId": null, "conceptName": "celecoxib"}`).
- **LLM harness** (`src/llm/prompt.ts`). The page never calls an LLM and needs no API key. It builds a prompt
  (research question + rules + a compact JSON Schema + an example) that you paste into any LLM, or download as a
  template. You paste the reply back; the app extracts the JSON, validates it, and if it is invalid generates a
  repair prompt listing the problems. The LLM is told never to write concept IDs: it writes clinical terms, and a
  person matches each one to a vocabulary concept from a short list of candidates. Negative controls are left to
  the person as well. The loop is short: pasting a reply loads it; repair and fix prompts clear the reply box for
  the next paste; study-level checks run on placeholders before the terms are matched, so a "fix prompt" can send
  problems such as an inverted time at risk straight back to the LLM; a checklist shows what is left.
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
- **Published outcome definitions** (`src/phenotypes/`). An outcome can be a cohort definition from the
  [OHDSI PhenotypeLibrary](https://github.com/OHDSI/PhenotypeLibrary) (Apache License) instead of a template. The
  library is fetched at build time from a pinned release (`npm run phenotypes:fetch`, v3.37.0) and served from this
  site; withdrawn and deprecated definitions are left out. The definition is embedded in the IR and compiled exactly
  as published. Search runs over names and descriptions, and an unresolved outcome term from an LLM draft also gets
  matching definitions as suggestions. Target and comparator stay template new-user cohorts.
- **CohortDiagnostics** is an on/off switch: the module (package defaults, all cohorts) is added before CohortMethod,
  from an R-generated template like the CohortMethod presets.
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
npm run phenotypes:fetch   # once: PhenotypeLibrary definitions into public/phenotypes/ (not committed)
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
3. ✅ LLM, copy-paste mode: prompt (copy or download as a template) → paste the reply → validate → repair prompt;
   terms resolved to concepts by a person
4. ✅ Smoother copy-paste loop: load on paste, repair and fix prompts that reset the reply box, next-steps checklist, undo
5. ✅ OHDSI PhenotypeLibrary definitions for outcomes; CohortDiagnostics module

## Limitations

- Target and comparator are template cohorts (new users of a drug, first occurrence of a condition); published
  definitions are available for outcomes only.
- Most PhenotypeLibrary definitions are pending peer review; read a definition before using it.
- CohortDiagnostics runs with the package defaults; its settings are not editable.
- The demo vocabulary is the small Eunomia subset; it has almost no hierarchy, so descendant previews need an Athena vocabulary.
- Source codes (ICD-10-CM, NDC, …) are not yet mapped to standard concepts (`CONCEPT_RELATIONSHIP` "Maps to").
- The descendant preview scans `CONCEPT_ANCESTOR` on demand; with a full vocabulary this takes a while.
- Importing a vocabulary happens again on every page load (no browser persistence yet).
- Negative controls are picked by hand (or the 12 from the Strategus example); there is no candidate generation.
