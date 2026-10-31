import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(process.env.SYNTRA_DEPENDENCY_ROOT ?? here, 'package.json'));
const { default: postcss } = await import(require.resolve('postcss'));
const { default: tailwind } = await import(require.resolve('@tailwindcss/postcss'));
// CSS-only packages can expose only the "style" condition, not Node's require/import.
async function stylesheet(name) {
  for (const modules of require.resolve.paths(name) ?? []) {
    const directory = path.join(modules, name);
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
      const entry = pkg.exports?.['.']?.style ?? pkg.style ?? pkg.main;
      if (!entry) throw new Error(`No stylesheet export in ${name}`);
      return path.join(directory, entry);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  throw new Error(`Missing stylesheet package: ${name}`);
}
const animateStyles = await stylesheet('tw-animate-css');
const source = await fs.readFile(path.join(here, 'frontend/index.css'), 'utf8');
const isolated = source
  .replace(/^@import url\([^\n]+\);\s*/m, '')
  .replace("@import 'tailwindcss';", `@import ${JSON.stringify(require.resolve('tailwindcss/index.css'))} source(none);\n@source "./frontend";`)
  .replace("@import 'tw-animate-css';", `@import ${JSON.stringify(animateStyles)};`)
  .replace(/@plugin\s+(['"])([^'"]+)\1/g, (_match, _quote, name) => `@plugin ${JSON.stringify(require.resolve(name))}`)
  .replace(':root {', ':host {')
  .replace('  html, body, #root { height: 100%; overflow: hidden; }\n', '')
  .replace('  body {', '  .syntra-original {');
const cssPath = path.join(here, 'source.css');
await fs.writeFile(cssPath, isolated);
const result = await postcss([tailwind({ base: here })]).process(isolated, { from: cssPath });
await fs.writeFile(
  path.join(here, 'styles.generated.ts'),
  `// Generated from the pinned upstream stylesheet by compile-styles.mjs.\nexport const syntraStyles = ${JSON.stringify(result.css)};\n`,
);
console.log(JSON.stringify({ cssBytes: result.css.length, source: 'current canonical Replit frontend; see syntra-transfer-manifest.json' }));
