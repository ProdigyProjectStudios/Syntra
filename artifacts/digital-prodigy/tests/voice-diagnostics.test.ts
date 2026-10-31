import assert from "node:assert/strict";
import { test } from "node:test";
import { VoiceDiagnostics } from "../src/lib/development-voice/voice-diagnostics.ts";

function fixture() {
  const original = Object.getOwnPropertyDescriptor(globalThis, "performance");
  const entries: Array<{ name: string; startTime: number; duration: number }> = [];
  let now = 0;
  Object.defineProperty(globalThis, "performance", { configurable: true, value: {
    now: () => now,
    getEntriesByName: (name: string) => entries.filter(entry => entry.name === name),
    clearMeasures: (name: string) => {
      for (let index = entries.length - 1; index >= 0; index--) if (entries[index].name === name) entries.splice(index, 1);
    },
    measure: (name: string, options: { start: number; duration: number }) => { entries.push({ name, startTime: options.start, duration: options.duration }); },
  } });
  return {
    diagnostics: new VoiceDiagnostics(), entries,
    at: (time: number) => { now = time; },
    durations: (metric: string) => entries.filter(entry => entry.name === `syntra.voice.${metric}`).map(entry => entry.duration),
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
