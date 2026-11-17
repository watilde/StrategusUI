import type { Concept, SearchQuery } from "./types";

/**
 * Concept search semantics, shared by every VocabularySource.
 *
 * A concept matches when the query is its concept_id, equals its
 * concept_code, or when every token occurs in its name or one of its synonyms.
 * Results are ordered by:
 *   0 concept_id match, 1 concept_code match, 2 exact name,
 *   3 name starts with query, 4 name contains query, 5 tokens only,
 * then by name length, then concept_id.
 *
 * `rankConcept` (in-memory) and `buildSearchSql` (DuckDB) implement the same
 * rules; tests run both on the same data and require identical results.
 */

export const DEFAULT_LIMIT = 50;

export function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function tokenize(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

/** Lower-cased name plus synonyms, as stored in the search index. */
export function searchText(name: string, synonyms: string[] = []): string {
  return [name, ...synonyms].map((s) => s.toLowerCase()).join(" | ");
}

export function parseConceptId(text: string): number | null {
  const t = text.trim();
  return /^\d{1,12}$/.test(t) ? Number(t) : null;
}

/** Returns the rank (0-5) or null when the concept does not match. */
export function rankConcept(c: Concept, haystack: string, q: SearchQuery): number | null {
  const text = normalize(q.text);
  if (!text) return null;
  if ((q.standardOnly ?? true) && c.standardConcept !== "S") return null;
  if (c.invalidReason) return null;
  if (q.domainId && c.domainId !== q.domainId) return null;

  const id = parseConceptId(text);
  const name = c.conceptName.toLowerCase();
  if (id !== null && c.conceptId === id) return 0;
  if (c.conceptCode.toLowerCase() === text) return 1;
  if (!tokenize(text).every((t) => haystack.includes(t))) return null;
  if (name === text) return 2;
  if (name.startsWith(text)) return 3;
  if (name.includes(text)) return 4;
  return 5;
}

export function compareRanked(a: { rank: number; c: Concept }, b: { rank: number; c: Concept }): number {
  return (
    a.rank - b.rank ||
    a.c.conceptName.length - b.c.conceptName.length ||
    a.c.conceptId - b.c.conceptId
  );
}

function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * DuckDB SQL for the same search, over a table
 *   concept(concept_id BIGINT, concept_name, domain_id, vocabulary_id,
 *           concept_class_id, standard_concept, concept_code, invalid_reason,
 *           search_text)
 * where search_text = searchText(name, synonyms).
 */
export function buildSearchSql(q: SearchQuery): { sql: string; params: (string | number)[] } | null {
  const text = normalize(q.text);
  if (!text) return null;
  const tokens = tokenize(text);
  const id = parseConceptId(text);

  // Numbered parameters ($1, $2, ...) so binding does not depend on clause order.
  const params: (string | number)[] = [];
  const p = (v: string | number) => {
    params.push(v);
    return `$${params.length}`;
  };

  const rank = `CASE${id !== null ? ` WHEN concept_id = ${p(id)} THEN 0` : ""}
      WHEN lower(concept_code) = ${p(text)} THEN 1
      WHEN lower(concept_name) = ${p(text)} THEN 2
      WHEN starts_with(lower(concept_name), ${p(text)}) THEN 3
      WHEN contains(lower(concept_name), ${p(text)}) THEN 4
      ELSE 5 END`;

  const tokenCond = tokens.map((t) => `search_text LIKE ${p(`%${likeEscape(t)}%`)} ESCAPE '\\'`).join(" AND ");
  const where = [
    `(${id !== null ? `concept_id = ${p(id)} OR ` : ""}lower(concept_code) = ${p(text)} OR (${tokenCond}))`,
    "invalid_reason = ''",
  ];
  if (q.standardOnly ?? true) where.push("standard_concept = 'S'");
  if (q.domainId) where.push(`domain_id = ${p(q.domainId)}`);

  const limit = Math.max(1, Math.min(500, Math.trunc(q.limit ?? DEFAULT_LIMIT)));
  const sql = `SELECT concept_id, concept_name, domain_id, vocabulary_id, concept_class_id,
       standard_concept, concept_code, invalid_reason, ${rank} AS rank
FROM concept
WHERE ${where.join("\n  AND ")}
ORDER BY rank, length(concept_name), concept_id
LIMIT ${limit}`;
  return { sql, params };
}

export type ConceptRow = {
  concept_id: number | bigint;
  concept_name: string;
  domain_id: string;
  vocabulary_id: string;
  concept_class_id: string;
  standard_concept: string | null;
  concept_code: string;
  invalid_reason: string | null;
};

export function rowToConcept(r: ConceptRow): Concept {
  return {
    conceptId: Number(r.concept_id),
    conceptName: r.concept_name,
    domainId: r.domain_id,
    vocabularyId: r.vocabulary_id,
    conceptClassId: r.concept_class_id,
    standardConcept: r.standard_concept ?? "",
    conceptCode: r.concept_code,
    invalidReason: r.invalid_reason ?? "",
  };
}
