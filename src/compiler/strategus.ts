import type { CohortSpec, StudyIR } from "../ir/schema";
import { toCirceJson } from "../cohorts/circe";
import { templates as defaultTemplates, type Json, type JsonObject, type Templates } from "./templates";

/**
 * Study IR -> Strategus analysis specification (the JSON that
 * Strategus::execute() consumes via ParallelLogger::loadSettingsFromJson()).
 *
 * Mirrors r/strategus-from-ir.R. CI checks that both produce equivalent JSON.
 */

export function studyCohorts(ir: StudyIR): CohortSpec[] {
  return [ir.target, ir.comparator, ...ir.outcomes];
}

export function excludedCovariateConceptIds(ir: StudyIR): number[] {
  if (ir.cohortMethod.excludedCovariateConceptIds.length > 0) {
    return ir.cohortMethod.excludedCovariateConceptIds;
  }
  const ids = [...ir.target.concepts, ...ir.comparator.concepts].map((c) => c.conceptId);
  return [...new Set(ids)];
}

function clone<T extends Json>(value: T): T {
  return structuredClone(value);
}

function cmAnalysis(ir: StudyIR, analysisId: number, preset: keyof Templates["cmAnalyses"], t: Templates): JsonObject {
  const template = t.cmAnalyses[preset];
  if (!template) throw new Error(`No template for CohortMethod preset "${preset}"`);
  const analysis = clone(template);
  analysis.analysisId = analysisId;

  const p = ir.population;
  analysis.getDbCohortMethodDataArgs = {
    ...(analysis.getDbCohortMethodDataArgs as JsonObject),
    removeDuplicateSubjects: p.removeDuplicateSubjects,
    firstExposureOnly: p.firstExposureOnly,
    washoutPeriod: p.washoutDays,
    restrictToCommonPeriod: p.restrictToCommonPeriod,
    minAge: p.minAge,
    maxAge: p.maxAge,
    studyStartDate: p.studyStartDate,
    studyEndDate: p.studyEndDate,
    maxCohortSize: p.maxCohortSize,
  };

  const tar = ir.timeAtRisk;
  analysis.createStudyPopulationArgs = {
    ...(analysis.createStudyPopulationArgs as JsonObject),
    minDaysAtRisk: tar.minDaysAtRisk,
    riskWindowStart: tar.riskWindowStart,
    startAnchor: tar.startAnchor,
    riskWindowEnd: tar.riskWindowEnd,
    endAnchor: tar.endAnchor,
  };
  return analysis;
}

export function buildAnalysisSpecifications(ir: StudyIR, t: Templates = defaultTemplates): JsonObject {
  const sharedResources: JsonObject[] = [
    {
      cohortDefinitions: studyCohorts(ir).map((c) => ({
        cohortId: c.cohortId,
        cohortName: c.name,
        cohortDefinition: toCirceJson(c),
      })),
      attr_class: ["CohortDefinitionSharedResources", "SharedResources"],
    },
  ];

  if (ir.negativeControls.length > 0) {
    sharedResources.push({
      negativeControlOutcomes: {
        negativeControlOutcomeCohortSet: ir.negativeControls.map((nc) => ({
          cohortId: nc.cohortId,
          cohortName: nc.name,
          outcomeConceptId: nc.outcomeConceptId,
        })),
        occurrenceType: ir.negativeControlSettings.occurrenceType,
        detectOnDescendants: ir.negativeControlSettings.detectOnDescendants,
      },
      attr_class: ["NegativeControlOutcomeSharedResources", "SharedResources"],
    });
  }

  const outcomes: JsonObject[] = [
    ...ir.negativeControls.map((nc) => ({
      outcomeId: nc.cohortId,
      outcomeOfInterest: false,
      trueEffectSize: 1,
      priorOutcomeLookback: ir.negativeControlSettings.priorOutcomeLookback,
      riskWindowStart: null,
      startAnchor: null,
      riskWindowEnd: null,
      endAnchor: null,
    })),
    ...ir.outcomes.map((o) => ({
      outcomeId: o.cohortId,
      outcomeOfInterest: true,
      trueEffectSize: null,
      priorOutcomeLookback: null,
      riskWindowStart: null,
      startAnchor: null,
      riskWindowEnd: null,
      endAnchor: null,
    })),
  ];

  const cmAnalysesSpecifications: JsonObject = {
    ...clone(t.cmAnalysesSpecifications),
    cmAnalysisList: ir.cohortMethod.analyses.map((preset, i) => cmAnalysis(ir, i + 1, preset, t)),
    targetComparatorOutcomesList: [
      {
        targetId: ir.target.cohortId,
        comparatorId: ir.comparator.cohortId,
        outcomes,
        nestingCohortId: null,
        excludedCovariateConceptIds: excludedCovariateConceptIds(ir),
        includedCovariateConceptIds: null,
      },
    ],
  };

  return {
    strategusVersion: t.strategus.strategusVersion,
    strategusPackageHash: t.strategus.strategusPackageHash,
    sharedResources,
    moduleSpecifications: [
      {
        module: "CohortGeneratorModule",
        settings: { generateStats: true },
        ...t.modules.CohortGeneratorModule,
        attr_class: ["ModuleSpecifications", "CohortGeneratorModuleSpecifications"],
      },
      {
        module: "CohortMethodModule",
        settings: { cmAnalysesSpecifications },
        ...t.modules.CohortMethodModule,
        attr_class: ["ModuleSpecifications", "CohortMethodModuleSpecifications"],
      },
    ],
    attr_class: "AnalysisSpecifications",
  };
}

/** Cohort definition files, keyed by cohortId, for the R script and fixtures. */
export function cohortDefinitionFiles(ir: StudyIR): Record<string, string> {
  return Object.fromEntries(studyCohorts(ir).map((c) => [String(c.cohortId), toCirceJson(c)]));
}
