import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

// Exercise the actual hook and PCM player. Only React's render bookkeeping,
// browser devices and the Azure SDK/service are simulated; no cloud calls.
const require = createRequire(new URL('../../api-server/package.json', import.meta.url));
const { build } = require('esbuild');
const bundle = await build({
  entryPoints: [new URL('../src/hooks/use-chat-speech.ts', import.meta.url).pathname],
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
  define: { 'import.meta.env.VITE_SYNTRA_VOICE_PROVIDER': '"azure"' },
  plugins: [{
    name: 'chat-speech-fixtures',
    setup(builder: any) {
      builder.onResolve({ filter: /^(react|microsoft-cognitiveservices-speech-sdk|@\/lib\/development-voice\/azure-voice)$/ },
        (args: any) => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args: any) => ({ contents: args.path === 'react'
        ? `export const useRef = value => ({ current: value });
           export const useState = value => { const i = globalThis.__chat.states.push(value) - 1; return [value, next => { globalThis.__chat.states[i] = next; }]; };
           export const useEffect = fn => { const cleanup = fn(); if(cleanup) globalThis.__chat.cleanup.push(cleanup); };
           export const useLayoutEffect = useEffect;`
        : args.path.startsWith('@/')
          ? `export async function tokenFor() { globalThis.__chat.tokens++; return { token: 'synthetic', region: 'test', expiresAt: Date.now()+300000 }; }`
          : `export const SpeechConfig = {fromAuthorizationToken: () => ({})};
             export const SpeechSynthesisOutputFormat = {Raw24Khz16BitMonoPcm: 1};
             export const ResultReason = {RecognizedSpeech: 1, SynthesizingAudioCompleted: 2};
             export const AudioConfig = {fromStreamInput: () => ({close(){}})};
             export const SpeechRecognizer = class {
               constructor(){ globalThis.__chat.recognizer=this; }
               startContinuousRecognitionAsync(ok){ok();}
               stopContinuousRecognitionAsync(ok){ok();}
               close(){this.closed=true;}
             };
             export const SpeechSynthesizer = class {
               constructor(){globalThis.__chat.synth=this;}
               speakTextAsync(text,ok,fail){ this.ok=ok; this.fail=fail; }
               close(){this.closed=true;}
             };`,
      }));
    },
  }],
});
const { useChatSpeech } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

async function fixture(t: any, denied = false, delayed = false) {
  const state: any = { states: [], cleanup: [], sources: [], tokens: 0, micStops: 0, contexts: [], permission: null };
  const globals = ['window', 'navigator', '__chat'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  Object.defineProperty(globalThis, '__chat', { configurable: true, value: state });
  class Context {
    state = 'running'; currentTime = 0; destination = {};
    constructor() { state.contexts.push(this); }
    async resume() {}
    async close() { this.state = 'closed'; }
    createAnalyser() { return { connect() {}, disconnect() {}, fftSize: 0 }; }
    createBuffer(_channels: number, frames: number, rate: number) { return { duration: frames / rate, getChannelData: () => new Float32Array(frames) }; }
    createBufferSource() {
      const source = { buffer: null, onended: null, stopped: false, connect() {}, disconnect() {}, start() {}, stop() { this.stopped = true; } };
      state.sources.push(source); return source;
    }
  }
  const stream = { getTracks: () => [{ stop: () => { state.micStops++; } }] };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: Context } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => {
    if (denied) throw new DOMException('denied', 'NotAllowedError');
    if (delayed) return new Promise(resolve => { state.permission = () => resolve(stream); });
    return stream;
  } } } });
  const speech = useChatSpeech(async () => 1, 'en-GB-SoniaNeural', null);
  t.after(() => {
    speech.stop(); state.cleanup.forEach((close: () => void) => close());
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return { state, speech };
}

test('chat read-aloud resets only after the last audible chunk and reuses authorization', async t => {
  const { state, speech } = await fixture(t);
  speech.play('A reply'); await settle();
  const first = state.synth;
  first.synthesizing(null, { result: { audioData: new Int16Array([100, -100]).buffer } });
  first.synthesizing(null, { result: { audioData: new Int16Array([200, -200]).buffer } });
  assert.equal(state.states[0], 'playing');
  first.ok({ reason: 2 }); await settle();
  assert.equal(state.states[0], 'playing', 'Network completion must not cut off the voice');
  state.sources[0].onended(); await settle();
  assert.equal(state.states[0], 'playing');
  state.sources[1].onended(); await settle();
  assert.equal(state.states[0], 'idle');
  assert.equal(first.closed, true);
  assert.ok(state.contexts.every((context: any) => context.state === 'closed'));
  speech.play('Another reply'); await settle();
  assert.equal(state.tokens, 1, 'Toggling speech must not mint a token every time');
});

test('dictation updates an unsent draft and finishing releases the mic', async t => {
  const { state, speech } = await fixture(t);
  let draft = 'Existing text';
  speech.dictate(draft, (value: string) => { draft = value; }); await settle();
  assert.equal(state.states[0], 'dictating');
  state.recognizer.recognized(null, { result: { reason: 1, text: 'New words.' } });
  assert.equal(draft, 'Existing text New words.');
  speech.finish();
  assert.equal(state.states[0], 'idle');
  assert.ok(state.micStops > 0);
  assert.equal(state.recognizer.closed, true);
});

test('permission denial restores idle state and preserves the draft', async t => {
  const { state, speech } = await fixture(t, true);
  let draft = 'Keep this';
  speech.dictate(draft, (value: string) => { draft = value; }); await settle();
  assert.equal(draft, 'Keep this');
  assert.equal(state.states[0], 'idle');
  assert.match(state.states[1], /Allow microphone access/);
});

test('cancelled permission grants release late tracks and never connect recognition', async t => {
  const { state, speech } = await fixture(t, false, true);
  speech.dictate('', () => {}); speech.stop();
  state.permission(); await settle();
  assert.equal(state.micStops, 1);
  assert.equal(state.recognizer, undefined);
  assert.equal(state.states[0], 'idle');
});

test('microphone capture interrupts and releases chat playback without overlapping resources', async t => {
  const { state, speech } = await fixture(t);
  speech.play('A reply'); await settle();
  const synth = state.synth;
  synth.synthesizing(null, { result: { audioData: new Int16Array([1, -1]).buffer } });
  speech.dictate('', () => {}); await settle();
  assert.equal(synth.closed, true);
  assert.ok(state.sources.every((source: any) => source.stopped));
  assert.equal(state.states[0], 'dictating');
  synth.ok({ reason: 2 }); await settle();
  assert.equal(state.states[0], 'dictating', 'Late completion must not reset a newer recording');
});

test('synthesis failure restores the play control', async t => {
  const { state, speech } = await fixture(t);
  speech.play('A reply'); await settle();
  state.synth.fail(); await settle();
  assert.equal(state.states[0], 'idle');
  assert.match(state.states[1], /Playback failed/);
});
