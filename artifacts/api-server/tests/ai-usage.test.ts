import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../package.json", import.meta.url));
const { build } = require("esbuild");

async function accounting(rowCount = 1, failRollback = false) {
  const calls: string[] = [];
  const releases: boolean[] = [];
  const client = {
    async query(text: string) {
      calls.push(text);
      if (failRollback && text === "ROLLBACK") throw new Error("Disconnected");
      return { rowCount };
    },
    release(destroy: boolean) { releases.push(destroy); },
  };
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL("../src/lib/ai-usage.ts", import.meta.url))],
    bundle: true, write: false, format: "cjs", platform: "node", logLevel: "silent",
    plugins: [{
      name: "isolated-accounting",
      setup(builder: any) {
        builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "mock" }));
        builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
          contents: "export const pool = { connect: () => Promise.resolve(globalThis.__syntraUsageClient) };",
        }));
      },
    }],
  });
  const module = { exports: {} as any };
  const global = { __syntraUsageClient: client };
  new Function("require", "module", "exports", "globalThis", bundled.outputFiles[0].text)(
    require, module, module.exports, global,
  );
  return { ...module.exports, calls, releases };
}

const counter = { key: "test:counter", amount: 1, limit: 3, expiresAt: new Date(0) };

test("shared accounting locks, updates and commits before releasing the connection", async () => {
  const usage = await accounting();
  await usage.reserveUsage([counter]);
  assert.ok(usage.calls.some((sql: string) => sql.includes("pg_advisory_xact_lock")));
  assert.ok(usage.calls.some((sql: string) => sql.includes("ON CONFLICT")));
  assert.equal(usage.calls.at(-1), "COMMIT");
  assert.deepEqual(usage.releases, [false]);
});

test("exhausted counters roll back all reservations and return 429", async () => {
  const usage = await accounting(0);
  await assert.rejects(usage.reserveUsage([counter]), { status: 429 });
  assert.equal(usage.calls.at(-1), "ROLLBACK");
  assert.ok(!usage.calls.includes("COMMIT"));
  assert.deepEqual(usage.releases, [false]);
});

test("an amount above the global limit is rejected before inserting", async () => {
  const usage = await accounting();
  await assert.rejects(usage.reserveUsage([{ ...counter, amount: 4 }]), { status: 429 });
  assert.ok(!usage.calls.some((sql: string) => sql.includes("INSERT")));
});

test("an uncertain rollback destroys rather than reuses the connection", async () => {
  const usage = await accounting(0, true);
  await assert.rejects(usage.reserveUsage([counter]), { status: 429 });
  assert.deepEqual(usage.releases, [true]);
});

test("a missing visitor identity fails closed without database work", async () => {
  const usage = await accounting();
  await assert.rejects(usage.reserveVisitorAnalysis(undefined, "evidence", 4), { status: 503 });
  assert.deepEqual(usage.calls, []);
});
