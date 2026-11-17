import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { beforeAll, describe, expect, it } from "vitest";
import data from "../src/vocab/eunomia-vocab.json";
import { InMemoryVocabulary, type CompactVocabulary } from "../src/vocab/eunomiaSource";
import { AthenaVocabulary, type SqlRunner } from "../src/vocab/athenaSource";
import { buildSearchSql } from "../src/vocab/search";
import type { SearchQuery } from "../src/vocab/types";

const vocab = data as unknown as CompactVocabulary;
const memory = new InMemoryVocabulary(vocab);

/** Writes the Eunomia vocabulary as Athena-style files (tab-delimited, unquoted, yyyymmdd dates). */
function writeAthenaFiles(dir: string, extraConcepts: string[] = []) {
  const concept = [
    "concept_id\tconcept_name\tdomain_id\tvocabulary_id\tconcept_class_id\tstandard_concept\tconcept_code\tvalid_start_date\tvalid_end_date\tinvalid_reason",
    ...vocab.concepts.map(([id, name, domain, v, cls, std, code, inv]) => [id, name, domain, v, cls, std, code, "19700101", "20991231", inv].join("\t")),
    ...extraConcepts,
  ].join("\n");
  const synonym = [
    "concept_id\tconcept_synonym_name\tlanguage_concept_id",
    ...vocab.synonyms.map(([id, name]) => [id, name, "4180186"].join("\t")),
  ].join("\n");
  const ancestor = [
    "ancestor_concept_id\tdescendant_concept_id\tmin_levels_of_separation\tmax_levels_of_separation",
    ...vocab.ancestors.map(([a, d, l]) => [a, d, l, l].join("\t")),
  ].join("\n");
  writeFileSync(join(dir, "CONCEPT.csv"), concept);
  writeFileSync(join(dir, "CONCEPT_SYNONYM.csv"), synonym);
  writeFileSync(join(dir, "CONCEPT_ANCESTOR.csv"), ancestor);
}

async function nativeRunner(): Promise<SqlRunner> {
  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();
  return {
    async query(sql, params = []) {
      const reader = await conn.runAndReadAll(sql, params);
      return reader.getRowObjectsJS().map((row) =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v])),
      );
    },
  };
}

const QUERIES: SearchQuery[] = [
  { text: "celecoxib" },
  { text: "Celecoxib", domainId: "Drug" },
  { text: "1118084" },
  { text: "K92.2", standardOnly: false },
  { text: "gastrointestinal hemorrhage" },
  { text: "hemorrhage gastro" },
  { text: "diclofenac 75", standardOnly: false },
  { text: "acetaminophen", domainId: "Drug", limit: 5 },
  { text: "strep throat" },
  { text: "sinusitis", domainId: "Condition" },
  { text: "%" },
  { text: "_" },
  { text: "it's" },
  { text: "   " },
];

describe("Athena vocabulary on DuckDB", () => {
  let athena: AthenaVocabulary;
  let athenaStd: AthenaVocabulary;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "athena-"));
    // Includes a concept name with a double quote, which breaks naive CSV parsing.
    writeAthenaFiles(dir, ['99999001\tCream "Brand" 1% topical\tDrug\tRxNorm\tBranded Drug\tS\tX1\t19700101\t20991231\t']);
    const files = {
      concept: join(dir, "CONCEPT.csv"),
      synonym: join(dir, "CONCEPT_SYNONYM.csv"),
      ancestor: join(dir, "CONCEPT_ANCESTOR.csv"),
    };
    athena = await AthenaVocabulary.open(await nativeRunner(), files, { standardOnly: false });
    athenaStd = await AthenaVocabulary.open(await nativeRunner(), files, { standardOnly: true });
  });

  it("imports every concept, including names with quotes", async () => {
    expect(athena.conceptCount).toBe(vocab.concepts.length + 1);
    const [c] = await athena.search({ text: "cream brand" });
    expect(c.conceptName).toBe('Cream "Brand" 1% topical');
  });

  it("drops non-standard concepts when standardOnly is set", () => {
    const nonStandard = vocab.concepts.filter((c) => c[5] !== "S" && c[5] !== "C").length;
    expect(athenaStd.conceptCount).toBe(vocab.concepts.length + 1 - nonStandard);
  });

  for (const q of QUERIES) {
    it(`ranks ${JSON.stringify(q)} exactly like the in-memory search`, async () => {
      const ids = (xs: { conceptId: number }[]) => xs.map((x) => x.conceptId);
      const fromMemory = ids(await memory.search(q));
      const fromDuck = ids((await athena.search(q)).filter((c) => c.conceptId !== 99999001));
      expect(fromDuck).toEqual(fromMemory);
    });
  }

  it("puts a concept_id match first", async () => {
    const [first] = await athena.search({ text: "1118084" });
    expect(first.conceptName).toBe("celecoxib");
  });

  it("looks up concepts by id", async () => {
    const found = await athena.getConcepts([1118084, 192671, 123456789]);
    expect([...found.keys()].sort((a, b) => a - b)).toEqual([192671, 1118084]);
    expect(found.get(192671)?.domainId).toBe("Condition");
  });

  it("returns descendants like the in-memory vocabulary", async () => {
    const withChildren = vocab.ancestors.find(([a, d]) => a !== d)![0];
    const a = await athena.descendants!(withChildren);
    const m = await memory.descendants(withChildren);
    expect(a.total).toBe(m.total);
    expect(a.concepts.map((c) => c.conceptId)).toEqual(m.concepts.map((c) => c.conceptId));
  });
});

describe("buildSearchSql", () => {
  it("binds parameters in textual order and escapes LIKE wildcards", () => {
    const built = buildSearchSql({ text: "50%_off", domainId: "Drug" })!;
    expect(built.params).toContain("%50\\%\\_off%");
    expect(built.params.at(-1)).toBe("Drug");
    expect(built.sql).toContain(`domain_id = $${built.params.length}`);
    expect(buildSearchSql({ text: "  " })).toBeNull();
  });
});

describe("validateConcepts", () => {
  it("accepts the GiBleed demo against the Eunomia vocabulary", async () => {
    const { gibleed } = await import("../src/ir/presets/gibleed");
    const { validateConcepts } = await import("../src/validate/concepts");
    const issues = await validateConcepts(gibleed, memory);
    expect(issues.filter((i) => i.level !== "info")).toEqual([]);
  });

  it("flags wrong names, wrong domains and unknown IDs", async () => {
    const { gibleed } = await import("../src/ir/presets/gibleed");
    const { validateConcepts } = await import("../src/validate/concepts");
    const ir = {
      ...gibleed,
      target: {
        ...gibleed.target,
        concepts: [
          { ...gibleed.target.concepts[0], conceptName: "ibuprofen" },
          { ...gibleed.target.concepts[0], conceptId: 192671 },
          { ...gibleed.target.concepts[0], conceptId: 987654321 },
        ],
      },
    };
    const issues = await validateConcepts(ir, memory);
    const at = (path: string) => issues.filter((i) => i.path === path).map((i) => i.level);
    expect(at("target.concepts[0]")).toEqual(["warning"]);
    expect(at("target.concepts[1]")).toContain("error");
    expect(at("target.concepts[2]")).toEqual(["info"]);
  });
});
