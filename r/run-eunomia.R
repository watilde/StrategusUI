# Usage: Rscript r/run-eunomia.R <analysisSpecification.json> [<outputDir>]
#
# Executes an analysis specification (e.g. one exported from the web UI) on the
# Eunomia GiBleed synthetic CDM and fails if any module reports an error.
# Requires the packages from r/install.R plus Eunomia.

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 1) stop("Usage: Rscript r/run-eunomia.R <analysisSpecification.json> [<outputDir>]")
specFile <- args[1]
outputDir <- if (length(args) >= 2) args[2] else file.path(tempdir(), "strategus-eunomia")
unlink(outputDir, recursive = TRUE)
dir.create(outputDir, recursive = TRUE)

library(Strategus)
analysisSpecifications <- ParallelLogger::loadSettingsFromJson(specFile)

connectionDetails <- Eunomia::getEunomiaConnectionDetails(databaseFile = file.path(outputDir, "eunomia.sqlite"))
executionSettings <- createCdmExecutionSettings(
  workDatabaseSchema = "main",
  cdmDatabaseSchema = "main",
  cohortTableNames = CohortGenerator::getCohortTableNames(cohortTable = "cohort"),
  workFolder = file.path(outputDir, "work"),
  resultsFolder = file.path(outputDir, "results"),
  minCellCount = 5,
  maxCores = 1
)

status <- execute(
  analysisSpecifications = analysisSpecifications,
  executionSettings = executionSettings,
  connectionDetails = connectionDetails
)
print(status)

# Basic sanity checks on the results.
resultsDir <- file.path(outputDir, "results")
cohortCounts <- read.csv(file.path(resultsDir, "CohortGeneratorModule", "cg_cohort_count.csv"))
print(cohortCounts)
stopifnot(nrow(cohortCounts) > 0, all(cohortCounts$cohort_entries > 0))

cmResults <- read.csv(file.path(resultsDir, "CohortMethodModule", "cm_result.csv"))
outcomeIds <- unique(cmResults$outcome_id[cmResults$outcome_id < 10000])
print(cmResults[cmResults$outcome_id %in% outcomeIds, c(
  "analysis_id", "outcome_id", "rr", "ci_95_lb", "ci_95_ub", "calibrated_rr",
  "target_subjects", "comparator_subjects", "target_outcomes", "comparator_outcomes"
)])
stopifnot(nrow(cmResults) > 0)
cdDir <- file.path(resultsDir, "CohortDiagnosticsModule")
if (dir.exists(cdDir)) {
  cdCounts <- read.csv(file.path(cdDir, "cd_cohort_count.csv"))
  print(cdCounts)
  stopifnot(nrow(cdCounts) > 0)
}
message("Eunomia execution OK: ", outputDir)
