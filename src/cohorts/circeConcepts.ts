/**
 * Reads concepts out of a Circe cohort definition (e.g. a PhenotypeLibrary
 * phenotype). Circe JSON is external data, so every access is defensive.
 */

export type CirceConcept = { conceptId: number; conceptName: string; domainId: string; conceptSetName: string; excluded: boolean };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export function circeConceptSets(circe: Obj): { id: number; name: string; concepts: CirceConcept[] }[] {
  const sets = Array.isArray(circe.ConceptSets) ? circe.ConceptSets : [];
  return sets.filter(isObj).map((set) => {
    const name = typeof set.name === "string" ? set.name : "";
    const items = isObj(set.expression) && Array.isArray(set.expression.items) ? set.expression.items : [];
    const concepts = items.filter(isObj).flatMap((item): CirceConcept[] => {
      const c = isObj(item.concept) ? item.concept : null;
      const id = c ? Number(c.CONCEPT_ID) : NaN;
      if (!c || !Number.isSafeInteger(id) || id <= 0) return [];
      return [
        {
          conceptId: id,
          conceptName: typeof c.CONCEPT_NAME === "string" ? c.CONCEPT_NAME : "",
          domainId: typeof c.DOMAIN_ID === "string" ? c.DOMAIN_ID : "",
          conceptSetName: name,
          excluded: item.isExcluded === true,
        },
      ];
    });
    return { id: Number(set.id), name, concepts };
  });
}

/** Every concept listed in the definition's concept sets (included and excluded). */
export function circeConcepts(circe: Obj): CirceConcept[] {
  return circeConceptSets(circe).flatMap((s) => s.concepts);
}

/** Included concepts of the concept sets used by the entry events (PrimaryCriteria). */
export function circeEntryConcepts(circe: Obj): CirceConcept[] {
  const primary = isObj(circe.PrimaryCriteria) ? circe.PrimaryCriteria : {};
  const criteria = Array.isArray(primary.CriteriaList) ? primary.CriteriaList : [];
  const codesetIds = new Set<number>();
  for (const c of criteria.filter(isObj)) {
    for (const domain of Object.values(c)) {
      if (isObj(domain) && typeof domain.CodesetId === "number") codesetIds.add(domain.CodesetId);
    }
  }
  return circeConceptSets(circe)
    .filter((s) => codesetIds.has(s.id))
    .flatMap((s) => s.concepts.filter((c) => !c.excluded));
}
