# Build a Strategus analysis specification from a Strategus UI Study IR,
# using only the official Strategus / CohortMethod / CohortGenerator APIs.
#
# This file is the single source of truth for the R side:
#   * CI sources it to produce the "golden" specification that the TypeScript
#     compiler must match (r/build-golden.R).
#   * The web UI embeds it verbatim in the downloadable R script.
#
# Requires: Strategus (>= 1.6), CohortMethod (>= 6), CohortGenerator,
#           FeatureExtraction, CirceR, Cyclops, ParallelLogger, jsonlite.

library(Strategus)

# CohortMethod analysis presets. Keep in sync with CmPresetSchema in src/ir/schema.ts.
.cmPresets <- list(
  unadjusted = function(analysisId, getDbArgs, studyPopArgs) {
    CohortMethod::createCmAnalysis(
      analysisId = analysisId,
      description = "No PS adjustment, simple outcome model",
      getDbCohortMethodDataArgs = getDbArgs,
      createStudyPopulationArgs = studyPopArgs,
      fitOutcomeModelArgs = CohortMethod::createFitOutcomeModelArgs(modelType = "cox")
    )
  },
  ps_match_1to1 = function(analysisId, getDbArgs, studyPopArgs) {
    CohortMethod::createCmAnalysis(
      analysisId = analysisId,
      description = "1:1 PS matching (caliper 0.2 SD of logit PS), stratified Cox model",
      getDbCohortMethodDataArgs = getDbArgs,
      createStudyPopulationArgs = studyPopArgs,
      createPsArgs = CohortMethod::createCreatePsArgs(stopOnError = FALSE),
      matchOnPsArgs = CohortMethod::createMatchOnPsArgs(
        caliper = 0.2,
        caliperScale = "standardized logit",
        maxRatio = 1
      ),
      computeSharedCovariateBalanceArgs = CohortMethod::createComputeCovariateBalanceArgs(),
      computeCovariateBalanceArgs = CohortMethod::createComputeCovariateBalanceArgs(
        covariateFilter = FeatureExtraction::getDefaultTable1Specifications()
      ),
      fitOutcomeModelArgs = CohortMethod::createFitOutcomeModelArgs(modelType = "cox", stratified = TRUE)
    )
  },
  ps_stratify_10 = function(analysisId, getDbArgs, studyPopArgs) {
    CohortMethod::createCmAnalysis(
      analysisId = analysisId,
      description = "PS stratification (10 strata), stratified Cox model",
      getDbCohortMethodDataArgs = getDbArgs,
      createStudyPopulationArgs = studyPopArgs,
      createPsArgs = CohortMethod::createCreatePsArgs(stopOnError = FALSE),
      stratifyByPsArgs = CohortMethod::createStratifyByPsArgs(numberOfStrata = 10),
      computeSharedCovariateBalanceArgs = CohortMethod::createComputeCovariateBalanceArgs(),
      computeCovariateBalanceArgs = CohortMethod::createComputeCovariateBalanceArgs(
        covariateFilter = FeatureExtraction::getDefaultTable1Specifications()
      ),
      fitOutcomeModelArgs = CohortMethod::createFitOutcomeModelArgs(modelType = "cox", stratified = TRUE)
    )
  }
)

#' @param ir          Study IR as parsed by jsonlite::fromJSON(simplifyVector = FALSE)
#' @param cohortJson  Named list: cohortId (as character) -> Circe JSON string
buildSpecFromIr <- function(ir, cohortJson) {
  if (!identical(ir$design, "cohort_method")) {
    stop("Only design = 'cohort_method' is supported")
  }

  # ---- Cohorts --------------------------------------------------------------
  cohorts <- c(list(ir$target, ir$comparator), ir$outcomes)
  cohortDefinitionSet <- data.frame(
    cohortId = vapply(cohorts, function(x) as.numeric(x$cohortId), numeric(1)),
    cohortName = vapply(cohorts, function(x) x$name, character(1)),
    stringsAsFactors = FALSE
  )
  cohortDefinitionSet$json <- vapply(
    cohortDefinitionSet$cohortId,
    function(id) cohortJson[[as.character(id)]],
    character(1)
  )
  # Rendering SQL doubles as a validity check of every Circe definition.
  cohortDefinitionSet$sql <- vapply(cohortDefinitionSet$json, function(j) {
    CirceR::buildCohortQuery(
      CirceR::cohortExpressionFromJson(j),
      CirceR::createGenerateOptions(generateStats = TRUE)
    )
  }, character(1))

  cgModule <- CohortGeneratorModule$new()
  spec <- createEmptyAnalysisSpecifications()
  spec <- addSharedResources(spec, cgModule$createCohortSharedResourceSpecifications(cohortDefinitionSet))

  ncs <- ir$negativeControls
  ncSettings <- ir$negativeControlSettings
  if (length(ncs) > 0) {
    ncoCohortSet <- data.frame(
      cohortId = vapply(ncs, function(x) as.numeric(x$cohortId), numeric(1)),
      cohortName = vapply(ncs, function(x) x$name, character(1)),
      outcomeConceptId = vapply(ncs, function(x) as.numeric(x$outcomeConceptId), numeric(1)),
      stringsAsFactors = FALSE
    )
    spec <- addSharedResources(spec, cgModule$createNegativeControlOutcomeCohortSharedResourceSpecifications(
      negativeControlOutcomeCohortSet = ncoCohortSet,
      occurrenceType = ncSettings$occurrenceType,
      detectOnDescendants = ncSettings$detectOnDescendants
    ))
  }
  spec <- addModuleSpecifications(spec, cgModule$createModuleSpecifications(generateStats = TRUE))

  # ---- CohortDiagnostics (optional; package defaults, all cohorts) ---------
  if (isTRUE(ir$cohortDiagnostics$enabled)) {
    cdModule <- CohortDiagnosticsModule$new()
    spec <- addModuleSpecifications(spec, cdModule$createModuleSpecifications())
  }

  # ---- CohortMethod -------------------------------------------------------
  ncOutcomes <- lapply(ncs, function(x) {
    CohortMethod::createOutcome(
      outcomeId = as.numeric(x$cohortId),
      outcomeOfInterest = FALSE,
      trueEffectSize = 1,
      priorOutcomeLookback = ncSettings$priorOutcomeLookback
    )
  })
  outcomesOfInterest <- lapply(ir$outcomes, function(x) {
    CohortMethod::createOutcome(outcomeId = as.numeric(x$cohortId), outcomeOfInterest = TRUE)
  })

  excluded <- as.numeric(unlist(ir$cohortMethod$excludedCovariateConceptIds))
  if (length(excluded) == 0) {
    excluded <- unique(as.numeric(c(
      vapply(ir$target$concepts, function(x) x$conceptId, numeric(1)),
      vapply(ir$comparator$concepts, function(x) x$conceptId, numeric(1))
    )))
  }

  tco <- CohortMethod::createTargetComparatorOutcomes(
    targetId = as.numeric(ir$target$cohortId),
    comparatorId = as.numeric(ir$comparator$cohortId),
    outcomes = c(ncOutcomes, outcomesOfInterest),
    excludedCovariateConceptIds = excluded
  )

  p <- ir$population
  getDbArgs <- CohortMethod::createGetDbCohortMethodDataArgs(
    removeDuplicateSubjects = p$removeDuplicateSubjects,
    firstExposureOnly = p$firstExposureOnly,
    washoutPeriod = p$washoutDays,
    restrictToCommonPeriod = p$restrictToCommonPeriod,
    minAge = p$minAge,
    maxAge = p$maxAge,
    studyStartDate = p$studyStartDate,
    studyEndDate = p$studyEndDate,
    maxCohortSize = p$maxCohortSize,
    covariateSettings = FeatureExtraction::createDefaultCovariateSettings(addDescendantsToExclude = TRUE)
  )

  tar <- ir$timeAtRisk
  studyPopArgs <- CohortMethod::createCreateStudyPopulationArgs(
    minDaysAtRisk = tar$minDaysAtRisk,
    riskWindowStart = tar$riskWindowStart,
    startAnchor = tar$startAnchor,
    riskWindowEnd = tar$riskWindowEnd,
    endAnchor = tar$endAnchor
  )

  presetNames <- unlist(ir$cohortMethod$analyses)
  cmAnalysisList <- lapply(seq_along(presetNames), function(i) {
    preset <- .cmPresets[[presetNames[i]]]
    if (is.null(preset)) stop("Unknown CohortMethod preset: ", presetNames[i])
    preset(i, getDbArgs, studyPopArgs)
  })

  cmAnalysesSpecifications <- CohortMethod::createCmAnalysesSpecifications(
    cmAnalysisList = cmAnalysisList,
    targetComparatorOutcomesList = list(tco)
  )
  cmModule <- CohortMethodModule$new()
  spec <- addModuleSpecifications(spec, cmModule$createModuleSpecifications(
    # Strategus stores the CohortMethod v6 R6 settings object as a plain list.
    cmAnalysesSpecifications = cmAnalysesSpecifications$toList()
  ))

  spec
}
