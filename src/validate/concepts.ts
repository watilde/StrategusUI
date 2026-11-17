import type { StudyIR } from "../ir/schema";
import type { Concept, VocabularySource } from "../vocab/types";
import type { Issue } from "./semantic";

/**
 * Checks every concept in the IR against the active vocabulary.
 * This is the guard against wrong or stale concept IDs (and, once an LLM drafts
 * the IR, hallucinated ones): the ID must exist, be valid and standard, and its
 * name and domain must agree with what the IR claims.
 */

type ConceptUse = { path: string; conceptId: number; conceptName?: string; domainId?: string };

export function conceptUses(ir: StudyIR): ConceptUse[] {
  const cohorts = [
    ["target", ir.target],
    ["comparator", ir.comparator],
    ...ir.outcomes.map((o, i) => [`outcomes[${i}]`, o] as const),
  ] as const;
  return [
    ...cohorts.flatMap(([path, cohort]) =>
      cohort.concepts.map((c, i) => ({
        path: `${path}.concepts[${i}]`,
        conceptId: c.conceptId,
        conceptName: c.conceptName,
        domainId: c.domainId,
      })),
    ),
    ...ir.negativeControls.map((n, i) => ({
      path: `negativeControls[${i}]`,
      conceptId: n.outcomeConceptId,
      conceptName: n.name,
    })),
    ...ir.cohortMethod.excludedCovariateConceptIds.map((id, i) => ({
      path: `cohortMethod.excludedCovariateConceptIds[${i}]`,
      conceptId: id,
    })),
  ];
}

function sameName(a: string, b: string): boolean {
  const n = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return n(a) === n(b);
}

export function checkConcepts(
  ir: StudyIR,
  found: Map<number, Concept>,
  vocabulary: Pick<VocabularySource, "label" | "standardOnly" | "kind">,
): Issue[] {
  const issues: Issue[] = [];
  for (const use of conceptUses(ir)) {
    const c = found.get(use.conceptId);
    if (!c) {
      const where = vocabulary.standardOnly ? "among the standard concepts of" : "in";
      issues.push({
        // The demo vocabulary is tiny, so absence there means little.
        level: vocabulary.kind === "eunomia" ? "info" : "warning",
        path: use.path,
        message: `Concept ${use.conceptId}${use.conceptName ? ` (${use.conceptName})` : ""} was not found ${where} ${vocabulary.label}`,
      });
      continue;
    }
    if (c.invalidReason) {
      issues.push({ level: "error", path: use.path, message: `Concept ${c.conceptId} (${c.conceptName}) is invalid (invalid_reason = ${c.invalidReason})` });
    }
    if (use.domainId && c.domainId !== use.domainId) {
      issues.push({
        level: "error",
        path: use.path,
        message: `Concept ${c.conceptId} is in the ${c.domainId} domain in the vocabulary, but the study says ${use.domainId}`,
      });
    }
    if (use.conceptName && !sameName(use.conceptName, c.conceptName) && !use.path.startsWith("negativeControls")) {
      issues.push({
        level: "warning",
        path: use.path,
        message: `Concept ${c.conceptId} is "${c.conceptName}" in the vocabulary, but the study calls it "${use.conceptName}"`,
      });
    }
    if (c.standardConcept !== "S" && !use.path.startsWith("cohortMethod")) {
      issues.push({ level: "warning", path: use.path, message: `Concept ${c.conceptId} (${c.conceptName}) is not a standard concept` });
    }
  }
  return issues;
}

export async function validateConcepts(ir: StudyIR, vocabulary: VocabularySource): Promise<Issue[]> {
  const found = await vocabulary.getConcepts(conceptUses(ir).map((u) => u.conceptId));
  return checkConcepts(ir, found, vocabulary).map((i) => ({ ...i, source: "vocabulary" as const }));
}
