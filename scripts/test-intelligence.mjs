import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url));
const { build } = require("esbuild");
const temporary = await mkdtemp(join(tmpdir(), "syntra-intelligence-"));
try {
  for (const [name, source] of [
    ["evidence", "artifacts/api-server/src/lib/evidence-ai.test.ts"],
    ["session", "artifacts/api-server/src/middlewares/visitor-session.test.ts"],
  ]) {
    const outfile = join(temporary, `${name}.test.cjs`);
    await build({ entryPoints: [join(root, source)], outfile, bundle: true,
      platform: "node", format: "cjs", external: ["pg-native"], logLevel: "silent" });
    const test = spawnSync(process.execPath, ["--test", outfile], {
      stdio: "inherit", env: { ...process.env, NODE_ENV: "production" }, timeout: 30_000,
    });
    if (test.status !== 0) process.exitCode = test.status ?? 1;
  }
  const budget = spawnSync(process.execPath, ["--experimental-strip-types", "--test",
    "artifacts/api-server/tests/ai-usage.test.ts"], { cwd: root, stdio: "inherit", timeout: 30_000 });
  if (budget.status !== 0) process.exitCode = budget.status ?? 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
