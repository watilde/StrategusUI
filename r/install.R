# Installs the R packages needed by r/build-golden.R and r/run-eunomia.R.
#
# OHDSI packages come from the OHDSI r-universe, Strategus from GitHub (it is
# not published on CRAN or r-universe), everything else from CRAN.
# Set CRAN_REPO to override the CRAN mirror (e.g. a current p3m snapshot).

strategusRef <- Sys.getenv("STRATEGUS_REF", "v1.6.0")

repos <- getOption("repos")
cran <- Sys.getenv("CRAN_REPO", "")
if (nzchar(cran)) {
  repos["CRAN"] <- cran
} else if (is.null(repos["CRAN"]) || repos["CRAN"] %in% c("", "@CRAN@")) {
  repos["CRAN"] <- "https://cloud.r-project.org"
}
options(repos = c(ohdsi = "https://ohdsi.r-universe.dev", repos[names(repos) != "ohdsi"]))

pkgs <- c(
  "CohortMethod", "CohortGenerator", "FeatureExtraction", "Cyclops", "CirceR",
  "ParallelLogger", "jsonlite", "Eunomia", "remotes"
)
install.packages(setdiff(pkgs, rownames(installed.packages())), Ncpus = max(1, parallel::detectCores()))

installedStrategus <- tryCatch(as.character(utils::packageVersion("Strategus")), error = function(e) "")
if (installedStrategus != sub("^v", "", strategusRef)) {
  remotes::install_github("OHDSI/Strategus", ref = strategusRef, upgrade = "never", dependencies = TRUE)
}

all <- c(pkgs, "Strategus")
missing <- all[!vapply(all, requireNamespace, logical(1), quietly = TRUE)]
if (length(missing) > 0) stop("Failed to install: ", paste(missing, collapse = ", "))
for (p in all) cat(p, as.character(utils::packageVersion(p)), "\n")
