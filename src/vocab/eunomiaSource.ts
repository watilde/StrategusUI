import { DEFAULT_LIMIT, compareRanked, rankConcept, searchText } from "./search";
import type { Concept, Descendants, SearchQuery, VocabularySource } from "./types";

/** Compact JSON written by r/extract-eunomia-vocab.R. */
export type CompactVocabulary = {
  source: string;
  concepts: [number, string, string, string, string, string, string, string][];
  synonyms: [number, string][];
  ancestors: [number, number, number][];
};

/** In-memory vocabulary (used for the bundled Eunomia demo vocabulary). */
export class InMemoryVocabulary implements VocabularySource {
  readonly kind = "eunomia" as const;
  readonly standardOnly = false;
  readonly label: string;
  readonly conceptCount: number;
  private readonly concepts: Concept[];
  private readonly byId: Map<number, Concept>;
  private readonly haystack: Map<number, string>;
  private readonly children: Map<number, { id: number; levels: number }[]>;

  constructor(data: CompactVocabulary, label = "Eunomia demo vocabulary") {
    this.label = label;
    this.concepts = data.concepts.map(([conceptId, conceptName, domainId, vocabularyId, conceptClassId, standardConcept, conceptCode, invalidReason]) => ({
      conceptId,
      conceptName,
      domainId,
      vocabularyId,
      conceptClassId,
      standardConcept,
      conceptCode,
      invalidReason,
    }));
    this.conceptCount = this.concepts.length;
    this.byId = new Map(this.concepts.map((c) => [c.conceptId, c]));

    const synonyms = new Map<number, string[]>();
    for (const [id, name] of data.synonyms) synonyms.set(id, [...(synonyms.get(id) ?? []), name]);
    this.haystack = new Map(this.concepts.map((c) => [c.conceptId, searchText(c.conceptName, synonyms.get(c.conceptId))]));

    this.children = new Map();
    for (const [ancestor, descendant, levels] of data.ancestors) {
      if (ancestor === descendant) continue;
      this.children.set(ancestor, [...(this.children.get(ancestor) ?? []), { id: descendant, levels }]);
    }
  }

  async search(q: SearchQuery): Promise<Concept[]> {
    const ranked: { rank: number; c: Concept }[] = [];
    for (const c of this.concepts) {
      const rank = rankConcept(c, this.haystack.get(c.conceptId) ?? "", q);
      if (rank !== null) ranked.push({ rank, c });
    }
    return ranked.sort(compareRanked).slice(0, q.limit ?? DEFAULT_LIMIT).map((r) => r.c);
  }

  async getConcepts(ids: number[]): Promise<Map<number, Concept>> {
    const out = new Map<number, Concept>();
    for (const id of ids) {
      const c = this.byId.get(id);
      if (c) out.set(id, c);
    }
    return out;
  }

  descendants = async (conceptId: number, limit = 200): Promise<Descendants> => {
    const rows = (this.children.get(conceptId) ?? [])
      .map(({ id, levels }) => {
        const c = this.byId.get(id);
        return c ? { ...c, levels } : null;
      })
      .filter((x): x is Concept & { levels: number } => x !== null)
      .sort((a, b) => a.levels - b.levels || a.conceptName.length - b.conceptName.length || a.conceptId - b.conceptId);
    return { total: rows.length, concepts: rows.slice(0, limit) };
  };
}

let eunomia: Promise<InMemoryVocabulary> | null = null;

/** Lazily loads the bundled Eunomia vocabulary (separate chunk, ~25 KB gzipped). */
export function loadEunomiaVocabulary(): Promise<InMemoryVocabulary> {
  eunomia ??= import("./eunomia-vocab.json").then((m) => new InMemoryVocabulary(m.default as unknown as CompactVocabulary));
  return eunomia;
}
