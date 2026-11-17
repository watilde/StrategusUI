import type { CmPreset } from "../ir/schema";
import generated from "./templates/cm-templates.json";

/**
 * Templates captured from R (see scripts/extract-templates.ts).
 *
 * The TypeScript compiler never invents CohortMethod / FeatureExtraction /
 * Cyclops defaults on its own: the full settings of each preset come from the
 * output of the official R functions, and only IR-driven fields are replaced.
 */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export type PackageIdentity = {
  modulePackage: string;
  modulePackageVersion: string;
  modulePackageHash: string;
};

export type Templates = {
  source: { generatedBy: string; generatedAt: string; packages: Record<string, string> };
  strategus: { strategusVersion: string; strategusPackageHash: string };
  modules: { CohortGeneratorModule: PackageIdentity; CohortMethodModule: PackageIdentity };
  cmAnalysesSpecifications: JsonObject;
  cmAnalyses: Record<CmPreset, JsonObject>;
};

export const templates = generated as unknown as Templates;
