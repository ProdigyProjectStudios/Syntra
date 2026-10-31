import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = await fs.readFile(path.join(here, 'frontend/index.css'), 'utf8');
const isolated = source
  .replace(/^@import url\([^\n]+\);\s*/m, '')
  .replace("@import 'tailwindcss';", '@import "tailwindcss" source(none);\n@source "./frontend";')
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
console.log(JSON.stringify({ cssBytes: result.css.length, source: 'c6b74fcc195135ee2b9227d65fec459638afc586' }));
