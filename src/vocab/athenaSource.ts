import { buildSearchSql, rowToConcept, type ConceptRow } from "./search";
import type { Concept, Descendants, SearchQuery, VocabularySource } from "./types";

/**
 * A user-provided Athena vocabulary queried with DuckDB.
 *
 * The SQL here runs unchanged on DuckDB-WASM (browser, files registered by
 * name) and on native DuckDB (tests, real paths): only the SqlRunner differs.
 */
export interface SqlRunner {
  query(sql: string, params?: (string | number)[]): Promise<Record<string, unknown>[]>;
}

export type AthenaFiles = {
  /** CONCEPT.csv (Athena, tab-delimited) or a Parquet file with the same columns. */
  concept: string;
  synonym?: string;
  ancestor?: string;
};

export type AthenaOptions = {
  /** Keep only standard (S) and classification (C) concepts. Recommended for browser memory. */
  standardOnly: boolean;
};

function quoteLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Table expression for an Athena file. Athena CSVs are tab-delimited and unquoted. */
export function fileSource(name: string): string {
  if (/\.parquet$/i.test(name)) return `read_parquet(${quoteLiteral(name)})`;
  return `read_csv(${quoteLiteral(name)}, delim = '\\t', header = true, quote = '', escape = '', all_varchar = true, strict_mode = false)`;
}

export function createConceptTableSql(files: AthenaFiles, opts: AthenaOptions): string {
  const filter = opts.standardOnly ? "WHERE standard_concept IN ('S', 'C')" : "";
  const synonyms = files.synonym
    ? `, s AS (
    SELECT TRY_CAST(concept_id AS BIGINT) AS concept_id, string_agg(lower(concept_synonym_name), ' | ') AS syn
    FROM ${fileSource(files.synonym)}
    GROUP BY 1
  )`
    : "";
  return `CREATE OR REPLACE TABLE concept AS
  WITH c AS (
    SELECT TRY_CAST(concept_id AS BIGINT) AS concept_id,
           concept_name, domain_id, vocabulary_id, concept_class_id,
           COALESCE(standard_concept, '') AS standard_concept,
           COALESCE(concept_code, '') AS concept_code,
           COALESCE(invalid_reason, '') AS invalid_reason
    FROM ${fileSource(files.concept)}
    ${filter}
  )${synonyms}
  SELECT c.*, lower(c.concept_name)${files.synonym ? " || COALESCE(' | ' || s.syn, '')" : ""} AS search_text
  FROM c${files.synonym ? " LEFT JOIN s USING (concept_id)" : ""}
  WHERE c.concept_id IS NOT NULL`;
}

/** Scans CONCEPT_ANCESTOR on demand (it is too large to hold in browser memory). */
export function descendantsSql(ancestorFile: string, limit: number): string {
  return `SELECT c.concept_id, c.concept_name, c.domain_id, c.vocabulary_id, c.concept_class_id,
       c.standard_concept, c.concept_code, c.invalid_reason,
       TRY_CAST(a.min_levels_of_separation AS INTEGER) AS levels,
       COUNT(*) OVER () AS total
FROM ${fileSource(ancestorFile)} a
JOIN concept c ON c.concept_id = TRY_CAST(a.descendant_concept_id AS BIGINT)
WHERE TRY_CAST(a.ancestor_concept_id AS BIGINT) = $1
  AND a.descendant_concept_id <> a.ancestor_concept_id
ORDER BY levels, length(c.concept_name), c.concept_id
LIMIT ${Math.max(1, Math.trunc(limit))}`;
}

export class AthenaVocabulary implements VocabularySource {
  readonly kind = "athena" as const;
  readonly label: string;
  readonly descendants?: (conceptId: number, limit?: number) => Promise<Descendants>;

  private constructor(
    private readonly db: SqlRunner,
    readonly conceptCount: number,
    readonly standardOnly: boolean,
    files: AthenaFiles,
  ) {
    this.label = `Athena vocabulary (${conceptCount.toLocaleString("en-US")} concepts${standardOnly ? ", standard & classification" : ""})`;
    if (files.ancestor) {
      const ancestor = files.ancestor;
      this.descendants = async (conceptId, limit = 200) => {
        const rows = await this.db.query(descendantsSql(ancestor, limit), [conceptId]);
        return {
          total: rows.length ? Number(rows[0].total) : 0,
          concepts: rows.map((r) => ({ ...rowToConcept(r as unknown as ConceptRow), levels: Number(r.levels) })),
        };
      };
    }
  }

  static async open(db: SqlRunner, files: AthenaFiles, opts: AthenaOptions): Promise<AthenaVocabulary> {
    await db.query(createConceptTableSql(files, opts));
    const [{ n }] = await db.query("SELECT COUNT(*) AS n FROM concept");
    if (Number(n) === 0) throw new Error("No concepts were imported. Is this an Athena CONCEPT.csv file?");
    return new AthenaVocabulary(db, Number(n), opts.standardOnly, files);
  }

  async search(q: SearchQuery): Promise<Concept[]> {
    const built = buildSearchSql(q);
    if (!built) return [];
    const rows = await this.db.query(built.sql, built.params);
    return rows.map((r) => rowToConcept(r as unknown as ConceptRow));
  }

  async getConcepts(ids: number[]): Promise<Map<number, Concept>> {
    const unique = [...new Set(ids)].filter((x) => Number.isSafeInteger(x));
    if (unique.length === 0) return new Map();
    const rows = await this.db.query(
      `SELECT * FROM concept WHERE concept_id IN (${unique.map((_, i) => `$${i + 1}`).join(", ")})`,
      unique,
    );
    return new Map(rows.map((r) => {
      const c = rowToConcept(r as unknown as ConceptRow);
      return [c.conceptId, c];
    }));
  }
}
