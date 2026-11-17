# Usage: Rscript r/extract-eunomia-vocab.R <out.json>
#
# Exports the vocabulary subset bundled with the Eunomia GiBleed dataset
# (OHDSI/EunomiaDatasets) as compact JSON for the web UI's demo vocabulary:
#   concepts:  [concept_id, concept_name, domain_id, vocabulary_id, concept_class_id, standard_concept, concept_code, invalid_reason]
#   synonyms:  [concept_id, concept_synonym_name]
#   ancestors: [ancestor_concept_id, descendant_concept_id, min_levels_of_separation]

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 1) stop("Usage: Rscript r/extract-eunomia-vocab.R <out.json>")

connectionDetails <- Eunomia::getEunomiaConnectionDetails(databaseFile = file.path(tempdir(), "eunomia.sqlite"))
connection <- DatabaseConnector::connect(connectionDetails)
on.exit(DatabaseConnector::disconnect(connection))
query <- function(sql) DatabaseConnector::querySql(connection, sql, snakeCaseToCamelCase = FALSE)

concepts <- query("
  SELECT concept_id, concept_name, domain_id, vocabulary_id, concept_class_id,
         COALESCE(standard_concept, '') AS standard_concept, concept_code,
         COALESCE(invalid_reason, '') AS invalid_reason
  FROM concept ORDER BY concept_id")
synonyms <- query("
  SELECT DISTINCT s.concept_id, s.concept_synonym_name
  FROM concept_synonym s JOIN concept c ON c.concept_id = s.concept_id
  WHERE LOWER(s.concept_synonym_name) <> LOWER(c.concept_name)
  ORDER BY s.concept_id")
ancestors <- query("
  SELECT a.ancestor_concept_id, a.descendant_concept_id, a.min_levels_of_separation
  FROM concept_ancestor a
  JOIN concept c1 ON c1.concept_id = a.ancestor_concept_id
  JOIN concept c2 ON c2.concept_id = a.descendant_concept_id
  ORDER BY a.ancestor_concept_id, a.descendant_concept_id")

rows <- function(df) unname(lapply(seq_len(nrow(df)), function(i) unname(as.list(df[i, ]))))
out <- list(
  source = "Eunomia GiBleed (OHDSI/EunomiaDatasets), vocabulary tables",
  concepts = rows(concepts),
  synonyms = rows(synonyms),
  ancestors = rows(ancestors)
)
jsonlite::write_json(out, args[1], auto_unbox = TRUE, digits = NA)
message(sprintf("wrote %s: %d concepts, %d synonyms, %d ancestor rows",
                args[1], nrow(concepts), nrow(synonyms), nrow(ancestors)))
