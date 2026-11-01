import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

test('neural assembly and motion survive caption-driven canvas resizing', async t => {
  const { build } = createRequire(new URL('../../api-server/package.json', import.meta.url))('esbuild');
  const cells: any[] = [];
  const effects: (() => void)[] = [];
  let cursor = 0;
  const equal = (a: unknown[], b: unknown[]) => a?.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    useRef(value: unknown) {
      const index = cursor++;
      return cells[index] ??= { current: value };
    },
    useMemo(fn: () => unknown, deps: unknown[]) {
      const index = cursor++;
      if (!cells[index] || !equal(cells[index].deps, deps)) cells[index] = { deps, value: fn() };
      return cells[index].value;
    },
    useEffect(fn: () => (() => void) | undefined, deps: unknown[]) {
      const index = cursor++;
      if (!cells[index] || !equal(cells[index].deps, deps)) {
        effects.push(() => {
          cells[index]?.cleanup?.();
          cells[index] = { deps, cleanup: fn() };
        });
      }
    },
  };
  let now = 1000;
  let frame: ((time: number) => void) | undefined;
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, { get: (_, name) => name === 'createRadialGradient' ? () => gradient : () => {} });
  const canvas = () => ({ getContext: () => context });
  const globals = {
    __syntraNeuralTestHooks: hooks,
    window: { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) },
    document: { hidden: false, createElement: canvas },
    requestAnimationFrame: (callback: (time: number) => void) => { frame = callback; return 1; },
    cancelAnimationFrame: () => { frame = undefined; },
  };
  for (const [key, value] of Object.entries(globals)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => old ? Object.defineProperty(globalThis, key, old) : Reflect.deleteProperty(globalThis, key));
  }
  t.mock.method(performance, 'now', () => now);
  const bundled = await build({
    entryPoints: [new URL('../src/components/neural-core.tsx', import.meta.url).pathname],
    bundle: true, write: false, format: 'esm', jsx: 'automatic',
    plugins: [{
      name: 'isolated-canvas-hooks',
      setup(api: any) {
        api.onResolve({ filter: /^(react|react\/jsx-runtime|@\/hooks\/use-media-query|@\/hooks\/use-visual-activity)$/ },
          ({ path }: { path: string }) => ({ path, namespace: 'fixture' }));
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }: { path: string }) => ({
          contents: path === 'react' ? 'export const {useRef,useMemo,useEffect}=globalThis.__syntraNeuralTestHooks;'
            : path === 'react/jsx-runtime' ? 'export const jsx=(type,props)=>({type,props});export {jsx as jsxs};'
            : path.includes('media-query') ? 'export const useMediaQuery=()=>false;'
            : 'export const useVisualActivity=()=>true;',
        }));
      },
    }],
  });
  const { NeuralCore } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  function render(size: number, state = 'idle') {
    cursor = 0;
    const tree = NeuralCore({ size, state, nodes: 48, bloom: false });
    tree.props.ref.current = {};
    for (const child of tree.props.children) {
      if (child?.type === 'canvas') child.props.ref.current ??= canvas();
    }
    effects.splice(0).forEach(effect => effect());
  }
  render(300);
  now = 4000;
  frame!(now);
  // ResizeObserver reacts to changing transcript/status height during speech.
  render(260, 'speaking');
  const animation = cells.find(cell => cell?.current?.born !== undefined);
  assert.ok(animation, 'canvas cleanup retains animation progress');
  assert.equal(animation.current.born, 1000, 'entrance starts only at initial mount');
  assert.ok(animation.current.t > 0);
  assert.ok(animation.current.vis > 0);
  now = 7000;
  frame!(now);
  render(320, 'idle');
  assert.equal(animation.current.born, 1000, 'response resize cannot restart assembly');
  assert.ok(animation.current.t > 0.05, 'motion continues rather than resetting');
  for (const cell of cells) cell?.cleanup?.();
});
