import type { ConceptRef } from "../ir/schema";

/** A row of the OMOP CONCEPT table (the columns the UI needs). */
export type Concept = {
  conceptId: number;
  conceptName: string;
  domainId: string;
  vocabularyId: string;
  conceptClassId: string;
  /** "S" standard, "C" classification, "" non-standard */
  standardConcept: string;
  conceptCode: string;
  /** "" when valid, otherwise "D" (deleted) or "U" (updated) */
  invalidReason: string;
};

export type SearchQuery = {
  text: string;
  /** Restrict to one domain (e.g. "Drug"); undefined = any domain. */
  domainId?: string;
  /** Only standard (S) concepts. Default true. */
  standardOnly?: boolean;
  limit?: number;
};

export type Descendants = { total: number; concepts: (Concept & { levels: number })[] };

/**
 * Where concepts come from. Implementations: the bundled Eunomia demo
 * vocabulary (in memory) and a user-provided Athena vocabulary (DuckDB-WASM).
 * Both must rank search results identically (see vocab/search.ts).
 */
export interface VocabularySource {
  readonly kind: "eunomia" | "athena";
  readonly label: string;
  readonly conceptCount: number;
  /** True when the source holds standard + classification concepts only. */
  readonly standardOnly: boolean;
  search(query: SearchQuery): Promise<Concept[]>;
  getConcepts(ids: number[]): Promise<Map<number, Concept>>;
  /** Undefined when the source has no CONCEPT_ANCESTOR data. */
  descendants?: (conceptId: number, limit?: number) => Promise<Descendants>;
}

export function toConceptRef(c: Concept, includeDescendants = true): ConceptRef {
  return {
    conceptId: c.conceptId,
    conceptName: c.conceptName,
    domainId: c.domainId,
    vocabularyId: c.vocabularyId,
    conceptClassId: c.conceptClassId,
    conceptCode: c.conceptCode,
    standardConcept: c.standardConcept === "S" || c.standardConcept === "C" ? c.standardConcept : "",
    includeDescendants,
  };
}
