import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// Explicit opt-in, restricted to disposable local databases. Never migrate production.
const raw = process.env.SYNTRA_TEST_DATABASE_URL;
if (!raw) {
  console.error('Set SYNTRA_TEST_DATABASE_URL to an isolated local PostgreSQL database.');
  process.exit(1);
}
const url = new URL(raw);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('PostgreSQL integration tests require an isolated loopback database.');
const root = fileURLToPath(new URL('../', import.meta.url));
const databaseRequire = createRequire(new URL('../lib/db/package.json', import.meta.url));
const apiRequire = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
const { Pool } = databaseRequire('pg');
const { build } = apiRequire('esbuild');
const admin = new Pool({ connectionString: raw, connectionTimeoutMillis: 5000, query_timeout: 10000 });
const schema = `syntra_test_${randomUUID().replaceAll('-', '')}`;
const folder = await mkdtemp(join(tmpdir(), 'syntra-postgres-'));
let created = false;
try {
  await admin.query(`create schema "${schema}"`);
  created = true;
  const outfile = join(folder, 'postgres.test.mjs');
  await build({ entryPoints: [join(root, 'artifacts/api-server/tests/postgres-admission.integration.ts')],
    outfile, bundle: true, platform: 'node', format: 'esm', external: ['pg-native'], logLevel: 'silent',
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  });
  url.searchParams.set('options', `-c search_path=${schema}`);
  const child = spawnSync(process.execPath, [outfile], {
    env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'inherit', timeout: 120000,
  });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
} finally {
  if (created) await admin.query(`drop schema "${schema}" cascade`);
  await admin.end();
  await rm(folder, { recursive: true, force: true });
}
