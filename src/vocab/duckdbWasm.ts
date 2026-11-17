import * as duckdb from "@duckdb/duckdb-wasm";
import ehWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import { AthenaVocabulary, type AthenaOptions, type SqlRunner } from "./athenaSource";

/**
 * DuckDB-WASM runtime, loaded only when the user opens an Athena vocabulary.
 * Files are read in place through the browser File API: nothing is uploaded.
 * The WASM is self-hosted (no CDN), using the exception-handling build that
 * all current browsers support.
 */

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

function getDb(): Promise<duckdb.AsyncDuckDB> {
  dbPromise ??= (async () => {
    const worker = new Worker(ehWorker);
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    await db.instantiate(ehWasm);
    return db;
  })();
  return dbPromise;
}

function plain(value: unknown): unknown {
  return typeof value === "bigint" ? Number(value) : value;
}

async function runner(db: duckdb.AsyncDuckDB): Promise<SqlRunner> {
  const conn = await db.connect();
  return {
    async query(sql, params = []) {
      const result = params.length
        ? await (async () => {
            const stmt = await conn.prepare(sql);
            try {
              return await stmt.query(...params);
            } finally {
              await stmt.close();
            }
          })()
        : await conn.query(sql);
      return result.toArray().map((row) => {
        const obj = row.toJSON() as Record<string, unknown>;
        for (const k of Object.keys(obj)) obj[k] = plain(obj[k]);
        return obj;
      });
    },
  };
}

export async function duckdbVersion(): Promise<string> {
  return (await getDb()).getVersion();
}

export type AthenaFileSet = { concept: File; synonym?: File; ancestor?: File };

export async function openAthenaVocabulary(files: AthenaFileSet, opts: AthenaOptions): Promise<AthenaVocabulary> {
  const db = await getDb();
  const names: Record<string, string> = {};
  for (const [role, file] of Object.entries(files) as [keyof AthenaFileSet, File | undefined][]) {
    if (!file) continue;
    // A stable, extension-preserving name per role; re-registering replaces the handle.
    const name = `${role}${/\.parquet$/i.test(file.name) ? ".parquet" : ".csv"}`;
    await db.registerFileHandle(name, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true);
    names[role] = name;
  }
  return AthenaVocabulary.open(await runner(db), { concept: names.concept, synonym: names.synonym, ancestor: names.ancestor }, opts);
}
