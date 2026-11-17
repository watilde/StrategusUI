/**
 * Semantic comparison between the TypeScript compiler output and the R golden
 * output. It tolerates serialization differences that ParallelLogger/jsonlite
 * introduce but that Strategus does not care about when loading:
 *
 *   - length-1 arrays vs scalars (jsonlite auto_unbox)
 *   - null vs [] vs {} vs missing key (R NULL / empty list)
 *   - numeric strings vs numbers (data.frame rows converted via apply())
 *   - cohortDefinition JSON strings (compared as parsed JSON)
 *   - floating point noise
 *   - object key order
 */

export type Difference = { path: string; ts: unknown; r: unknown };

const DEFAULT_IGNORED = [
  /^\$\.strategusPackageHash$/,
  /^\$\.strategusVersion$/,
  /\.modulePackageHash$/,
  /\.modulePackageVersion$/,
];

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && /^\s*-?\d+(\.\d+)?([eE][-+]?\d+)?\s*$/.test(v)) return Number(v);
  return undefined;
}

function unbox(v: unknown): unknown {
  return Array.isArray(v) && v.length === 1 ? v[0] : v;
}

function parseIfJsonString(key: string, v: unknown): unknown {
  if (key === "cohortDefinition" && typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

export function compareSpecs(
  ts: unknown,
  r: unknown,
  ignored: RegExp[] = DEFAULT_IGNORED,
): Difference[] {
  const diffs: Difference[] = [];

  const walk = (a: unknown, b: unknown, path: string, key: string) => {
    if (ignored.some((re) => re.test(path))) return;
    a = unbox(parseIfJsonString(key, a));
    b = unbox(parseIfJsonString(key, b));

    if (isEmpty(a) && isEmpty(b)) return;

    const na = asNumber(a);
    const nb = asNumber(b);
    if (na !== undefined && nb !== undefined) {
      const tol = 1e-9 * Math.max(1, Math.abs(na), Math.abs(nb));
      if (Math.abs(na - nb) > tol) diffs.push({ path, ts: a, r: b });
      return;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        diffs.push({ path: `${path}.length`, ts: a.length, r: b.length });
        return;
      }
      a.forEach((x, i) => walk(x, b[i], `${path}[${i}]`, key));
      return;
    }

    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      const ao = a as Record<string, unknown>;
      const bo = b as Record<string, unknown>;
      for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
        walk(ao[k], bo[k], `${path}.${k}`, k);
      }
      return;
    }

    if (a !== b) diffs.push({ path, ts: a, r: b });
  };

  walk(ts, r, "$", "");
  return diffs;
}
