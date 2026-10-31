import assert from "node:assert/strict";
import { test } from "node:test";
import { VoiceDiagnostics } from "../src/lib/development-voice/voice-diagnostics.ts";

function fixture() {
  const original = Object.getOwnPropertyDescriptor(globalThis, "performance");
  const entries: Array<{ name: string; startTime: number; duration: number; entryType?: string; detail?: Record<string, unknown> }> = [];
  let now = 0;
  Object.defineProperty(globalThis, "performance", { configurable: true, value: {
    now: () => now,
    getEntriesByName: (name: string, type?: string) => entries.filter(entry => entry.name === name && (!type || (entry.entryType ?? 'measure') === type)),
    clearMeasures: (name: string) => {
      for (let index = entries.length - 1; index >= 0; index--) if (entries[index].name === name) entries.splice(index, 1);
    },
    measure: (name: string, options: { start: number; duration: number }) => { entries.push({ name, startTime: options.start, duration: options.duration }); },
    clearMarks: (name: string) => {
      for (let index = entries.length - 1; index >= 0; index--) if (entries[index].name === name && entries[index].entryType === 'mark') entries.splice(index, 1);
    },
    mark: (name: string, options: { startTime?: number; detail?: Record<string, unknown> }) => {
      entries.push({ name, startTime: options.startTime ?? now, duration: 0, entryType: 'mark', detail: structuredClone(options.detail) });
    },
  } });
  return {
    diagnostics: new VoiceDiagnostics(), entries,
    at: (time: number) => { now = time; },
    durations: (metric: string) => entries.filter(entry => entry.name === `syntra.voice.${metric}`).map(entry => entry.duration),
    marks: () => entries.filter(entry => entry.entryType === 'mark'),
    restore() { if (original) Object.defineProperty(globalThis, "performance", original); else Reflect.deleteProperty(globalThis, "performance"); },
  };
}

test("voice diagnostics keeps only 64 finite recent samples per metric", t => {
  const f = fixture(); t.after(f.restore); f.at(1000);
  f.diagnostics.record("synthesis-network", 9);
  for (let value = 1; value <= 70; value++) f.diagnostics.record("model-response", value);
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) f.diagnostics.record("model-response", value);
  assert.deepEqual(f.durations("model-response"), Array.from({ length: 64 }, (_, index) => index + 7));
  assert.deepEqual(f.durations("synthesis-network"), [9]);
  assert.ok(f.entries.every(entry => Object.keys(entry).every(key => ["name", "startTime", "duration"].includes(key))));
});

test("structured voice diagnostics cannot copy transcripts, credentials, errors or provider identifiers", t => {
  const f = fixture(); t.after(f.restore);
  f.diagnostics.event('recognition.final', {
    epoch: 2, utterance: 3, offsetMs: 1250, durationMs: 800, timingAvailable: true, reusedProviderId: true,
    transcript: 'PRIVATE TRANSCRIPT', token: 'PRIVATE TOKEN', resultId: 'PRIVATE RESULT ID',
    accountId: 'PRIVATE ACCOUNT', error: new Error('PRIVATE ERROR'),
    state: 'PRIVATE STATE', outcome: 'PRIVATE OUTCOME', reason: 'PRIVATE REASON',
    liveTracks: Number.NaN, recognitionTracks: Number.POSITIVE_INFINITY, enabledTracks: -1,
  } as never);
  f.diagnostics.event('PRIVATE STAGE' as never, {});
  const marks = f.marks();
  assert.equal(marks.length, 1);
  const detail = marks[0].detail!;
  assert.deepEqual(Object.keys(detail).sort(), ['connection', 'count', 'durationMs', 'epoch', 'offsetMs', 'reusedProviderId', 'sequence', 'stage', 'timingAvailable', 'utterance'].sort());
  assert.equal(detail.utterance, 3);
  assert.equal(JSON.stringify(marks).includes('PRIVATE'), false);
});

test("structured diagnostics retain a bounded timeline with session-local counters after close", t => {
  const f = fixture(); t.after(f.restore);
  for (let index = 0; index < 600; index++) {
    f.at(index); f.diagnostics.event('capture.sample', { inputActive: index % 2 === 0 });
  }
  assert.ok(f.marks().length <= 512 && f.marks().length >= 256);
  assert.equal(f.marks()[0].detail!.count, 257);
  assert.equal(f.marks().at(-1)!.detail!.count, 600);
  f.diagnostics.event('connection.close'); f.diagnostics.clear();
  assert.equal(f.marks().at(-1)!.detail!.stage, 'connection.close');
  const previousConnection = f.marks().at(-1)!.detail!.connection;
  const next = new VoiceDiagnostics(); next.event('connection.open');
  assert.notEqual(f.marks().at(-1)!.detail!.connection, previousConnection);
  assert.equal(f.marks().at(-1)!.detail!.sequence, 1);
  assert.ok(f.marks().length <= 512);
});

test("controller diagnostics explain admission blocks without exposing utterance or request content", t => {
  const f = fixture(); t.after(f.restore);
  f.diagnostics.controller({ event: 'admission', outcome: 'blocked', reason: 'input-pending', snapshot: {
    userSpeaking: false, recognitionPending: true, queuedFinals: 1, active: false, failed: false,
    playback: false, playbackStarted: false, playbackRetry: false, endpointPending: false, endpointReady: true,
    transcript: 'PRIVATE CAPTION', requestId: 'PRIVATE REQUEST',
  } } as never);
  const detail = f.marks()[0].detail!;
  assert.equal(detail.stage, 'controller.admission');
  assert.equal(detail.reason, 'input-pending');
  assert.equal(detail.recognitionPending, true);
  assert.equal(detail.queuedFinals, 1);
  assert.equal(JSON.stringify(detail).includes('PRIVATE'), false);
});

test("a missing or rejecting Performance mark API cannot stop consultation timing", t => {
  const f = fixture(); t.after(f.restore);
  Object.defineProperty(performance, 'mark', { value: () => { throw new Error('No marks available'); } });
  assert.doesNotThrow(() => f.diagnostics.event('connection.open'));
  f.diagnostics.phase({ turn: 1, phase: 'queued' });
  f.at(50); f.diagnostics.phase({ turn: 1, phase: 'admitted' });
  assert.deepEqual(f.durations('final-to-admission'), [50]);
});

test("voice diagnostics correlates overlapping queued turns instead of using the latest global timestamp", t => {
  const f = fixture(); t.after(f.restore);
  f.at(0); f.diagnostics.phase({ turn: 1, phase: "queued" });
  f.at(10); f.diagnostics.phase({ turn: 2, phase: "queued" });
  f.at(20); f.diagnostics.phase({ turn: 1, phase: "admitted" });
  f.at(40); f.diagnostics.phase({ turn: 1, phase: "reply" });
  f.at(50); f.diagnostics.phase({ turn: 2, phase: "admitted" });
  f.at(60); f.diagnostics.phase({ turn: 2, phase: "reply" });
  f.at(70); f.diagnostics.phase({ turn: 1, phase: "playback" });
  f.at(80); f.diagnostics.phase({ turn: 2, phase: "playback" });
  assert.deepEqual(f.durations("final-to-admission"), [20, 40]);
  assert.deepEqual(f.durations("model-response"), [20, 10]);
  assert.deepEqual(f.durations("reply-to-audio"), [30, 20]);
  assert.deepEqual(f.durations("final-transcript-to-audio"), [70, 70]);
});

test("voice diagnostics excludes replayed or untracked speech from fresh end-to-end latency", t => {
  const f = fixture(); t.after(f.restore);
  f.at(0); f.diagnostics.phase({ turn: 1, phase: "queued" });
  f.at(10); f.diagnostics.phase({ turn: 1, phase: "admitted" });
  f.at(50); f.diagnostics.phase({ turn: 1, phase: "admitted", retry: true });
  f.at(70); f.diagnostics.phase({ turn: 1, phase: "reply", retry: true });
  f.at(100); f.diagnostics.phase({ turn: 1, phase: "playback", retry: true });
  f.diagnostics.phase({ turn: 999, phase: "playback", retry: true });
  assert.deepEqual(f.durations("final-to-admission"), [10]);
  assert.deepEqual(f.durations("model-response"), [], "Receipt recovery latency must not be presented as fresh model generation");
  assert.deepEqual(f.durations("turn-recovery"), [20]);
  assert.deepEqual(f.durations("final-transcript-to-audio"), []);
  f.diagnostics.clear();
  for (let turn = 0; turn < 33; turn++) f.diagnostics.phase({ turn, phase: "queued" });
  f.diagnostics.phase({ turn: 0, phase: "admitted" });
  f.diagnostics.phase({ turn: 0, phase: "reply" });
  f.diagnostics.phase({ turn: 0, phase: "playback" });
  assert.deepEqual(f.durations("final-transcript-to-audio"), [], "Evicted traces must not fabricate an end-to-end baseline");
});
