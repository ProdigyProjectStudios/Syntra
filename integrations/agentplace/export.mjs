/**
 * Export current canonical source, never apply historical patches.
 * Generated outputs stay ignored. No host infrastructure or secrets are copied.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.resolve(process.argv[2] ?? path.join(root, 'generated-artifacts/agentplace'));
if (!out.startsWith(path.join(root, 'generated-artifacts') + path.sep) && !out.startsWith('/tmp/')) {
  throw new Error('Export only into generated-artifacts/<name> or /tmp/<name>, never a source or native project directory.');
}
const existing = await fs.readdir(out).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
if (existing.length && !existing.includes('syntra-transfer-manifest.json')) {
  throw new Error('Refusing to replace a nonempty directory without a Syntra transfer manifest.');
}
// This is an owned generated staging directory, never a host project. Clean stale
// files so a source deletion cannot silently survive the next bidirectional transfer.
if (existing.length) await fs.rm(out, { recursive: true });
await fs.mkdir(out, { recursive: true });
const client = 'agent-dev-client/src/app/agent/syntra-app';
const server = 'agent-dev-server/src/bl/syntra';
const manifest = [];
async function files(dir) {
  return (await Promise.all((await fs.readdir(dir, { withFileTypes: true })).map(async e =>
    e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]))).flat().sort();
}
async function emit(relative, data, source) {
  const target = path.join(out, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data);
  manifest.push({ path: relative, source, sha256: crypto.createHash('sha256').update(data).digest('hex') });
}
// Only integration-owned host seams. Never copy the old frontend snapshots.
for (const host of ['agent-dev-client', 'agent-dev-server']) {
  for (const file of await files(path.join(here, host))) {
    const relative = path.relative(here, file);
    if (relative.includes('/frontend/') || relative.includes('/shared/') || relative.endsWith('/source.css')) continue;
    await emit(relative, await fs.readFile(file), path.relative(root, file));
  }
}
const frontend = path.join(root, 'artifacts/digital-prodigy/src');
for (const file of await files(frontend)) {
  const relative = path.relative(frontend, file);
  if (['main.tsx', 'lib/runtime.ts', 'vite-env.d.ts'].includes(relative) || relative.startsWith('assets/') || relative.startsWith('lib/development-voice/')) continue;
  let content = await fs.readFile(file, 'utf8');
  if (/\.(tsx?|css)$/.test(file)) {
    const imported = specifier => {
      const target = specifier.startsWith('@/') ? path.join(client, 'frontend', specifier.slice(2))
        : specifier === '@workspace/api-client-react' ? path.join(client, 'compat/intelligence-contracts.ts')
        : path.join(client, 'shared/index.ts');
      const from = path.dirname(path.join(client, 'frontend', relative));
      const result = path.relative(from, target).replaceAll(path.sep, '/');
      return result.startsWith('.') ? result : './' + result;
    };
    content = content.replace(/(['"])(@\/[^'"]+|@workspace\/consultation|@workspace\/api-client-react)\1/g, (_, quote, specifier) => quote + imported(specifier) + quote);
    if (relative === 'lib/intelligence-client.ts') content = content.replace('const NATIVE_ONLY = false;', 'const NATIVE_ONLY = true;');
    content = content.replace(/import logo from ['"][^'"]*dp-logo\.png['"];?/, "const logo = '/syntra/assets/dp-logo.png';")
      .replaceAll('import.meta.env.BASE_URL', "'/'").replaceAll('import.meta.env.DEV', 'false');
    content = content.replace(/(['"])react-day-picker\1/g, '$1@syntra/react-day-picker$1')
      .replace(/(['"])tailwind-merge\1/g, '$1@syntra/tailwind-merge$1');
    if (content.includes('@workspace/')) throw new Error('Unresolved workspace import in ' + relative);
  }
  await emit(path.join(client, 'frontend', relative), content, path.relative(root, file));
}
for (const file of await files(path.join(root, 'lib/consultation/src'))) {
  if (file.endsWith('.test.ts')) {
    // Carry the new portable Blueprint proofs with the server handoff, without
    // shipping Node test modules into the customer-facing client source tree.
    if (['blueprint.test.ts', 'blueprint-persistence.test.ts'].includes(path.basename(file))) {
      await emit(path.join(server, 'shared', path.basename(file)), await fs.readFile(file), path.relative(root, file));
    }
    continue;
  }
  for (const target of [path.join(client, 'shared'), path.join(server, 'shared')]) {
    await emit(path.join(target, path.basename(file)), await fs.readFile(file), path.relative(root, file));
  }
}
await emit('agent-dev-client/static/syntra/assets/dp-logo.png',
  await fs.readFile(path.join(frontend, 'assets/dp-logo.png')), 'artifacts/digital-prodigy/src/assets/dp-logo.png');
await emit(path.join(client, 'compat/intelligence-contracts.ts'),
  await fs.readFile(path.join(root, 'lib/api-client-react/src/generated/api.schemas.ts')),
  'lib/api-client-react/src/generated/api.schemas.ts');
await fs.writeFile(path.join(out, 'syntra-transfer-manifest.json'), JSON.stringify({
  schemaVersion: 1, sourceOfTruth: 'artifacts/digital-prodigy/src + lib/consultation/src',
  upstreamAgentPlaceCommit: 'ddec385eef2b76b31974a0c16de57a498d5a22f3',
  files: manifest,
}, null, 2) + '\n');
console.log(JSON.stringify({ out, files: manifest.length }));
