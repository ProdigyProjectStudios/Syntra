import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'generated-artifacts/agentplace');
execFileSync(process.execPath, ['integrations/agentplace/export.mjs', out], { cwd: root, stdio: 'inherit' });
const manifest = JSON.parse(await fs.readFile(path.join(out, 'syntra-transfer-manifest.json'), 'utf8'));
for (const file of manifest.files) {
  const data = await fs.readFile(path.join(out, file.path));
  if (crypto.createHash('sha256').update(data).digest('hex') !== file.sha256) throw new Error('Transfer checksum mismatch: ' + file.path);
  if (/\.(ts|tsx)$/.test(file.path) && (data.includes('@workspace/') || /(?:from|import)\s*['"]@\//.test(data.toString()) && file.path.includes('/frontend/'))) {
    throw new Error('Unresolved portable frontend dependency: ' + file.path);
  }
}
const require = createRequire(path.join(root, 'artifacts/api-server/package.json'));
const esbuild = await import(require.resolve('esbuild'));
// Full typechecking of native SDK imports belongs in AgentPlace. Check all exported
// TS/TSX syntax here without fabricating declarations for unavailable infrastructure.
const entries = manifest.files.filter(f => /\.(ts|tsx)$/.test(f.path)).map(f => path.join(out, f.path));
await esbuild.build({ entryPoints: entries, outdir: path.join(out, 'syntax-check'), outbase: out, bundle: false, format: 'esm', logLevel: 'warning' });
const client = path.join(out, 'agent-dev-client/src/app/agent/syntra-app');
execFileSync(process.execPath, [path.join(client, 'compile-styles.mjs')], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, SYNTRA_DEPENDENCY_ROOT: path.join(root, 'artifacts/digital-prodigy') },
});
const testDir = path.join(out, 'agent-dev-server/src/bl/syntra');
const tests = (await fs.readdir(testDir)).filter(p => p.endsWith('.test.ts')).map(p => path.join(testDir, p));
const sharedTests = path.join(testDir, 'shared');
tests.push(...(await fs.readdir(sharedTests)).filter(p => p.endsWith('.test.ts')).map(p => path.join(sharedTests, p)));
execFileSync(process.execPath, ['--experimental-strip-types', '--test', ...tests], { cwd: root, stdio: 'inherit' });
console.log(`Validated ${manifest.files.length} checksums, ${entries.length} TS/TSX syntax files, scoped CSS compilation and native export tests.`);
