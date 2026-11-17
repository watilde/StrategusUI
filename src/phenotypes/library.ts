/**
 * OHDSI PhenotypeLibrary (https://github.com/OHDSI/PhenotypeLibrary, Apache License).
 * Cohort definitions are fetched at build time (scripts/fetch-phenotypes.ts)
 * and served from this site: nothing is requested from third parties at runtime.
 */

export const PHENOTYPE_LIBRARY = {
  name: "OHDSI PhenotypeLibrary",
  version: "3.37.0",
  url: "https://github.com/OHDSI/PhenotypeLibrary",
  license: "Apache License",
} as const;

export type PhenotypeEntry = {
  id: number;
  /** Name without the library's status tags such as "[P]" or "[P][R]". */
  name: string;
  description: string;
  status: string;
  /** Domains of the entry events, e.g. "ConditionOccurrence, ProcedureOccurrence". */
  domains: string;
  /** Reference cohorts ("[R]") are broad definitions meant as building blocks. */
  reference: boolean;
};

export type PhenotypeIndex = {
  library: string;
  version: string;
  url: string;
  license: string;
  phenotypes: PhenotypeEntry[];
};

/** Strips leading status tags: "[P][R] Gastrointestinal hemorrhage" -> "Gastrointestinal hemorrhage". */
export function stripTags(name: string): string {
  return name.replace(/^(\s*\[[^\]]*\])+\s*/, "").trim();
}

const STATUS_ORDER: Record<string, number> = { Accepted: 0, "Pending peer review": 1, Pending: 2, Prediction: 3 };

/**
 * Token search over names and descriptions. Every token must occur; name hits
 * rank above description hits, then accepted definitions first, then shorter names.
 */
export function searchPhenotypes(index: PhenotypeEntry[], text: string, limit = 8): PhenotypeEntry[] {
  const tokens = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const query = tokens.join(" ");
  const scored: { p: PhenotypeEntry; score: number }[] = [];
  for (const p of index) {
    const name = p.name.toLowerCase();
    const haystack = `${name} ${p.description.toLowerCase()}`;
    if (!tokens.every((t) => haystack.includes(t))) continue;
    const score =
      (name === query ? 0 : name.startsWith(query) ? 1 : name.includes(query) ? 2 : tokens.every((t) => name.includes(t)) ? 3 : 4) * 10 +
      (STATUS_ORDER[p.status] ?? 5);
    scored.push({ p, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.p.name.length - b.p.name.length || a.p.id - b.p.id)
    .slice(0, limit)
    .map((s) => s.p);
}

function baseUrl(): string {
  return (import.meta.env?.BASE_URL as string | undefined) ?? "/";
}

let indexPromise: Promise<PhenotypeIndex | null> | null = null;

/** Loads the index built by scripts/fetch-phenotypes.ts; null when this build has none. */
export function loadPhenotypeIndex(): Promise<PhenotypeIndex | null> {
  indexPromise ??= fetch(`${baseUrl()}phenotypes/index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<PhenotypeIndex>) : null))
    .catch(() => null);
  return indexPromise;
}

export async function loadPhenotypeDefinition(id: number): Promise<Record<string, unknown>> {
  const r = await fetch(`${baseUrl()}phenotypes/${id}.json`);
  if (!r.ok) throw new Error(`Phenotype ${id} is not available (${r.status})`);
  return (await r.json()) as Record<string, unknown>;
}
