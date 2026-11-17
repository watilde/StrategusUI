# Usage: Rscript r/build-golden.R <fixtureDir> [<fixtureDir> ...]
#
# Each fixture directory (written by `npm run fixtures:export`) contains
#   ir.json, cohorts/<cohortId>.json
# and receives
#   spec.r.json   (the golden specification built with the official R APIs)
#   packages.json (versions / hashes of the packages used)

args <- commandArgs(trailingOnly = TRUE)
if (length(args) == 0) stop("Usage: Rscript r/build-golden.R <fixtureDir> ...")

scriptDir <- dirname(normalizePath(sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE))))
source(file.path(scriptDir, "strategus-from-ir.R"))

for (fixtureDir in args) {
  message("Building golden spec for ", fixtureDir)
  ir <- jsonlite::fromJSON(file.path(fixtureDir, "ir.json"), simplifyVector = FALSE)
  cohortFiles <- list.files(file.path(fixtureDir, "cohorts"), pattern = "\\.json$", full.names = TRUE)
  cohortJson <- lapply(cohortFiles, function(f) paste(readLines(f, warn = FALSE), collapse = "\n"))
  names(cohortJson) <- sub("\\.json$", "", basename(cohortFiles))

  spec <- buildSpecFromIr(ir, cohortJson)
  ParallelLogger::saveSettingsToJson(spec, file.path(fixtureDir, "spec.r.json"))

  # Round-trip check: Strategus must be able to load what it wrote.
  reloaded <- ParallelLogger::loadSettingsFromJson(file.path(fixtureDir, "spec.r.json"))
  stopifnot(inherits(reloaded, "AnalysisSpecifications"))

  pkgs <- c("Strategus", "CohortMethod", "CohortGenerator", "CohortDiagnostics", "FeatureExtraction", "CirceR", "Cyclops")
  info <- lapply(pkgs, function(p) as.character(utils::packageVersion(p)))
  names(info) <- pkgs
  jsonlite::write_json(info, file.path(fixtureDir, "packages.json"), auto_unbox = TRUE, pretty = TRUE)
}
