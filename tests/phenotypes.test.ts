import { describe, expect, it } from "vitest";
import { searchPhenotypes, stripTags, type PhenotypeEntry } from "../src/phenotypes/library";
import { parseCsv } from "../scripts/fetch-phenotypes";
import { circeConceptSets, circeEntryConcepts } from "../src/cohorts/circeConcepts";
import phenotype77 from "../src/ir/presets/phenotypes/77.json";

const entry = (id: number, name: string, description = "", status = "Pending peer review"): PhenotypeEntry => ({
  id,
  name,
  description,
  status,
  domains: "ConditionOccurrence",
  reference: false,
});

describe("PhenotypeLibrary search", () => {
  const index = [
    entry(1, "Gastrointestinal bleeding with inpatient admission", "all events of gastrointestinal hemorrhage in inpatient or ER setting"),
    entry(2, "Gastrointestinal bleeding", "first event"),
    entry(3, "Lower gastrointestinal bleeding events"),
    entry(4, "Hemorrhagic stroke", "intracerebral bleeding"),
    entry(5, "Gastrointestinal bleeding", "accepted one", "Accepted"),
  ];

  it("ranks exact name matches first and accepted definitions above pending ones", () => {
    expect(searchPhenotypes(index, "gastrointestinal bleeding").map((p) => p.id)).toEqual([5, 2, 1, 3]);
  });
  it("matches descriptions too, below name matches", () => {
    expect(searchPhenotypes(index, "bleeding").map((p) => p.id).at(-1)).toBe(4);
  });
  it("requires every token", () => {
    expect(searchPhenotypes(index, "gastrointestinal stroke")).toEqual([]);
    expect(searchPhenotypes(index, "  ")).toEqual([]);
  });
  it("strips status tags from names", () => {
    expect(stripTags("[P][R] Gastrointestinal hemorrhage ")).toBe("Gastrointestinal hemorrhage");
    expect(stripTags("Plain")).toBe("Plain");
  });
});

describe("parseCsv", () => {
  it("handles BOM, quoted commas, quotes and newlines", () => {
    const rows = parseCsv('﻿"cohortId","cohortName","logicDescription"\r\n1,"A, B","say ""hi""\nnext line"\n2,C,\n');
    expect(rows).toEqual([
      { cohortId: "1", cohortName: "A, B", logicDescription: 'say "hi"\nnext line' },
      { cohortId: "2", cohortName: "C", logicDescription: "" },
    ]);
  });
});

describe("Circe concept extraction", () => {
  const circe = phenotype77 as Record<string, unknown>;
  it("lists concept sets", () => {
    expect(circeConceptSets(circe).map((s) => s.name)).toEqual(["Inpatient or ER visit", "Gastrointestinal hemorrhage GI bleeding"]);
  });
  it("returns only the included concepts of entry-event concept sets", () => {
    const entryConcepts = circeEntryConcepts(circe);
    expect(entryConcepts.length).toBeGreaterThan(0);
    expect(new Set(entryConcepts.map((c) => c.conceptSetName))).toEqual(new Set(["Gastrointestinal hemorrhage GI bleeding"]));
    expect(entryConcepts.every((c) => !c.excluded)).toBe(true);
  });
  it("tolerates malformed input", () => {
    expect(circeConceptSets({ ConceptSets: [null, { expression: { items: [{ concept: { CONCEPT_ID: "x" } }] } }] } as never)).toEqual([
      { id: NaN, name: "", concepts: [] },
    ]);
    expect(circeEntryConcepts({})).toEqual([]);
  });
});
