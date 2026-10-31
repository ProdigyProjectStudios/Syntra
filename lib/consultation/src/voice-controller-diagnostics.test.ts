import assert from "node:assert/strict";
import { test } from "node:test";
import { ConversationVoiceController, type VoiceControllerDiagnostic, type VoiceTurnPorts } from "./voice-controller.ts";
import { blankBrief } from "./native-repository.ts";
import type { TurnInput, TurnReply } from "./types.ts";

const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function reply(input: TurnInput): TurnReply {
  return {
    visitorMessage: { id: 1, role: "visitor", content: input.content, depth: input.depth, createdAt: "2026-10-31T00:00:00Z" },
    message: { id: 2, role: "advisor", content: "A private saved reply", depth: input.depth, createdAt: "2026-10-31T00:00:00Z" },
    brief: blankBrief(), suggestedNextSteps: [], specialist: input.specialist,
  };
}
function fixture() {
  const diagnostics: VoiceControllerDiagnostic[] = [];
  const sends: TurnInput[] = [];
  const playback: Array<{ start: () => void; signal: AbortSignal }> = [];
  let nextRequest = 0;
  let send: VoiceTurnPorts["send"] = async input => reply(input);
  let speak: VoiceTurnPorts["speak"] = async (_text, _signal, start) => { start(); };
  let observe = (_event: VoiceControllerDiagnostic) => {};
  const controller = new ConversationVoiceController({
    send: input => { sends.push({ ...input }); return send(input); },
    speak: (text, signal, start) => { playback.push({ start, signal }); return speak(text, signal, start); },
    stopPlayback() {}, emit() {}, getDepth: () => "detailed", getSpecialist: () => "technical",
    requestId: () => `private-request-${++nextRequest}`,
    onDiagnostic: event => { diagnostics.push(event); observe(event); },
  }, { schedule: () => () => {} });
  return {
    controller, diagnostics, sends, playback,
    setSend: (value: VoiceTurnPorts["send"]) => { send = value; },
    setSpeak: (value: VoiceTurnPorts["speak"]) => { speak = value; },
    setObserve: (value: typeof observe) => { observe = value; },
  };
}

test("controller diagnostics identify a queued final blocked by another unresolved recognition", async () => {
  const f = fixture();
  f.controller.interim("private-current-result", "Private unfinished words");
  f.controller.final("private-earlier-result", "Private accepted words");
  f.controller.flush();
  await settle();
  assert.equal(f.sends.length, 0);
  const blocked = f.diagnostics.find(event => event.event === "endpoint" && event.outcome === "blocked");
  assert.equal(blocked?.reason, "input-pending");
  assert.equal(blocked?.snapshot.recognitionPending, true);
  assert.equal(blocked?.snapshot.queuedFinals, 1);
  assert.equal(blocked?.snapshot.active, false);
  f.controller.noMatch("private-stale-result");
  assert.equal(f.diagnostics.at(-1)?.reason, "different-result");
  f.controller.noMatch("private-current-result");
  f.controller.flush();
  await settle();
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].content, "Private accepted words");
  assert.ok(f.diagnostics.some(event => event.event === "admission" && event.outcome === "admitted"));
  f.controller.close();
});

test("controller diagnostics distinguish active model work from uncertain-turn recovery", async () => {
  const f = fixture();
  const first = deferred<TurnReply>();
  f.setSend(() => first.promise);
  f.controller.final("private-first", "Private first request");
  f.controller.flush();
  f.controller.final("private-second", "Private second request");
  f.controller.flush();
  const active = f.diagnostics.find(event => event.event === "admission" && event.reason === "active-turn");
  assert.equal(active?.snapshot.active, true);
  assert.equal(active?.snapshot.queuedFinals, 1);
  assert.equal(active?.snapshot.endpointReady, true);
  first.reject(new Error("Private network details must not enter diagnostics"));
  await settle();
  f.controller.flush();
  const uncertain = f.diagnostics.find(event => event.event === "admission" && event.reason === "failed-turn");
  assert.equal(uncertain?.snapshot.failed, true);
  assert.equal(uncertain?.snapshot.active, false);
  assert.equal(uncertain?.snapshot.queuedFinals, 1);
  f.setSend(async input => reply(input));
  f.controller.retryTurn();
  await settle();
  assert.equal(f.sends.length, 3);
  assert.deepEqual(f.sends[1], f.sends[0]);
  assert.equal(f.sends[2].content, "Private second request");
  assert.ok(f.diagnostics.some(event => event.event === "admission" && event.outcome === "retry"));
  assert.ok(f.diagnostics.some(event => event.event === "model" && event.outcome === "completed"));
  f.controller.close();
});

test("controller diagnostics follow actual playback completion and stop after close", async () => {
  const f = fixture();
  const audio = deferred<void>();
  f.setSpeak(() => audio.promise);
  f.controller.final("private-utterance", "Private request");
  f.controller.flush();
  await settle();
  const scheduled = f.diagnostics.find(event => event.event === "playback" && event.outcome === "scheduled");
  assert.equal(scheduled?.snapshot.playback, true);
  assert.equal(scheduled?.snapshot.playbackStarted, false);
  f.playback[0].start();
  const started = f.diagnostics.find(event => event.event === "playback" && event.outcome === "started");
  assert.equal(started?.snapshot.playbackStarted, true);
  audio.resolve();
  await settle();
  const completed = f.diagnostics.find(event => event.event === "playback" && event.outcome === "completed");
  assert.equal(completed?.snapshot.playback, false);
  assert.equal(completed?.snapshot.active, false);
  f.controller.close();
  assert.equal(f.diagnostics.at(-1)?.event, "close");
  const count = f.diagnostics.length;
  f.playback[0].start();
  f.controller.final("private-late", "Private late request");
  f.controller.close();
  assert.equal(f.diagnostics.length, count);
});

test("controller diagnostic snapshots contain no private data and observers cannot change a turn", async () => {
  const f = fixture();
  f.setObserve(event => {
    if (event.event === "final" && event.outcome === "accepted") {
      event.snapshot.queuedFinals = 999;
      event.snapshot.recognitionPending = true;
    }
    throw new Error("A diagnostic sink failed");
  });
  for (let turn = 0; turn < 2; turn++) {
    f.controller.final(`private-result-${turn}`, `Private customer request ${turn}`);
    f.controller.flush();
    await settle();
  }
  assert.equal(f.sends.length, 2);
  assert.equal(f.playback.length, 2);
  const serialized = JSON.stringify(f.diagnostics);
  for (const privateValue of ["private-result", "private-request", "Private customer", "private saved", "technical", "detailed"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  for (const event of f.diagnostics) {
    assert.deepEqual(Object.keys(event).sort(), event.reason ? ["event", "outcome", "reason", "snapshot"] : ["event", "outcome", "snapshot"]);
    for (const [key, value] of Object.entries(event.snapshot)) {
      assert.equal(typeof value, key === "queuedFinals" ? "number" : "boolean");
    }
  }
  f.controller.close();
});
