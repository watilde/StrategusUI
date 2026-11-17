/**
 * Fetches a pinned OHDSI PhenotypeLibrary release and writes, under public/phenotypes/:
 *   index.json    compact metadata used for search
 *   <id>.json     each Circe cohort definition (minified)
 *
 * Run before building (the deploy workflow does): npm run phenotypes:fetch
 * The output is generated, not committed.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PHENOTYPE_LIBRARY, stripTags, type PhenotypeEntry, type PhenotypeIndex } from "../src/phenotypes/library";

const EXCLUDED_STATUSES = new Set(["Withdrawn", "Deprecated"]);

/** RFC 4180 CSV parser (quoted fields may contain commas, quotes and newlines). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows.filter((r) => r.length > 1 || r[0] !== "");
  const keys = header.map((h) => h.replace(/^﻿/, ""));
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])));
}

async function main() {
  const root = join(import.meta.dirname, "..");
  const outDir = join(root, "public", "phenotypes");
  // Downloaded content goes in its own empty directory; it is only parsed as data.
  const work = mkdtempSync(join(tmpdir(), "phenotype-library-"));
  try {
    const url = `https://codeload.github.com/OHDSI/PhenotypeLibrary/tar.gz/refs/tags/v${PHENOTYPE_LIBRARY.version}`;
    console.log(`Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    const archive = join(work, "library.tar.gz");
    writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
    const extracted = join(work, "x");
    mkdirSync(extracted);
    execFileSync("tar", ["-xzf", archive, "-C", extracted, "--wildcards", "*/inst/Cohorts.csv", "*/inst/cohorts/*.json"]);
    const [top] = readdirSync(extracted);
    const inst = join(extracted, top, "inst");

    const rows = parseCsv(readFileSync(join(inst, "Cohorts.csv"), "utf8"));
    const available = new Set(readdirSync(join(inst, "cohorts")).map((f) => f.replace(/\.json$/, "")));

    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    const phenotypes: PhenotypeEntry[] = [];
    for (const r of rows) {
      const id = Number(r.cohortId);
      if (!Number.isInteger(id) || EXCLUDED_STATUSES.has(r.status) || !available.has(String(id))) continue;
      let definition: unknown;
      try {
        definition = JSON.parse(readFileSync(join(inst, "cohorts", `${id}.json`), "utf8"));
      } catch {
        console.warn(`Skipping ${id}: invalid JSON`);
        continue;
      }
      if (!definition || typeof definition !== "object" || !("PrimaryCriteria" in definition)) {
        console.warn(`Skipping ${id}: not a Circe cohort definition`);
        continue;
      }
      writeFileSync(join(outDir, `${id}.json`), JSON.stringify(definition));
      phenotypes.push({
        id,
        name: stripTags(r.cohortName) || r.cohortName,
        description: r.logicDescription.trim(),
        status: r.status,
        domains: r.domainsInEntryEvents,
        reference: r.isReferenceCohort === "1",
      });
    }

    const { name: library, version, url: sourceUrl, license } = PHENOTYPE_LIBRARY;
    const index: PhenotypeIndex = { library, version, url: sourceUrl, license, phenotypes };
    writeFileSync(join(outDir, "index.json"), JSON.stringify(index));
    console.log(`Wrote ${phenotypes.length} phenotypes to ${outDir}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
