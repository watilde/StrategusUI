import type { StudyIR } from "../ir/schema";
import { buildRScriptFrom } from "./rScript";
import strategusFromIr from "../../r/strategus-from-ir.R?raw";

export { rRawString } from "./rScript";

export function buildRScript(ir: StudyIR, generatedAt?: string): string {
  return buildRScriptFrom(strategusFromIr, ir, generatedAt);
}
