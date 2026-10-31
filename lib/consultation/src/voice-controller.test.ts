import assert from "node:assert/strict";
import { test } from "node:test";
import { ConversationVoiceController, type VoiceTurnPhase } from "./voice-controller.ts";
import { blankBrief } from "./native-repository.ts";
import type { Depth, SpecialistId, TurnInput, TurnReply, VoiceEvent } from "./types.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function reply(input: TurnInput, id = 1): TurnReply {
  return {
    visitorMessage: { id, role: "visitor", content: input.content, depth: input.depth, createdAt: "2026-10-31T00:00:00Z" },
    message: { id: id + 1, role: "advisor", content: `Answer to ${input.content}`, depth: input.depth, createdAt: "2026-10-31T00:00:00Z" },
    brief: blankBrief(), suggestedNextSteps: [], specialist: input.specialist,
  };
}

type Ports = ConstructorParameters<typeof ConversationVoiceController>[0];
type Options = NonNullable<ConstructorParameters<typeof ConversationVoiceController>[1]>;
function fixture(options: Partial<Options> = {}, initialPending?: TurnInput) {
  const events: VoiceEvent[] = [];
  const sends: TurnInput[] = [];
  const spoken: Array<{ text: string; signal: AbortSignal; start: () => void }> = [];
  const pending: Array<TurnInput | null> = [];
  const phases: VoiceTurnPhase[] = [];
  const timers: Array<{ run: () => void; canceled: boolean }> = [];
  let stops = 0, nextId = 0, depth: Depth = "detailed";
  let specialist: SpecialistId = "syntra";
  let sendImpl: Ports["send"] = async input => reply(input, sends.length * 2);
  let speakImpl: Ports["speak"] = async (_text, _signal, onPlaybackStart) => { onPlaybackStart(); };
  let persistImpl: NonNullable<Ports["onPendingChange"]> = () => {};
  let phaseImpl: NonNullable<Ports["onTurnPhase"]> = () => {};
  const ports: Ports = {
    send: input => { sends.push(structuredClone(input)); return sendImpl(input); },
    speak: (text, signal, start) => { spoken.push({ text, signal, start }); return speakImpl(text, signal, start); },
    stopPlayback: () => { stops++; },
    emit: event => { events.push(event); },
    getDepth: () => depth,
    getSpecialist: () => specialist,
    requestId: () => `voice_request_${++nextId}`,
    ...(initialPending ? { pendingTurn: initialPending } : {}),
    onPendingChange: input => { persistImpl(input); pending.push(input ? structuredClone(input) : null); },
    onTurnPhase: event => { phases.push({ ...event }); phaseImpl(event); },
  };
  const controller = new ConversationVoiceController(ports, {
    schedule: run => {
      const timer = { run, canceled: false };
      timers.push(timer);
      return () => { timer.canceled = true; };
    },
    ...options,
  });
  const say = (id: string, text: string) => {
    controller.speechStarted();
    controller.final(id, text);
    controller.speechEnded();
    controller.flush();
  };
  return {
    controller, events, sends, spoken, pending, phases, say,
    stops: () => stops,
    setDepth: (value: Depth) => { depth = value; },
    setSpecialist: (value: SpecialistId) => { specialist = value; },
    setSend: (value: Ports["send"]) => { sendImpl = value; },
    setSpeak: (value: Ports["speak"]) => { speakImpl = value; },
    setPersist: (value: NonNullable<Ports["onPendingChange"]>) => { persistImpl = value; },
    setPhase: (value: NonNullable<Ports["onTurnPhase"]>) => { phaseImpl = value; },
    runClock: () => {
      for (const timer of timers.splice(0)) if (!timer.canceled) timer.run();
    },
  };
}

test("voice silence and interim captions never invent a conversation turn", async () => {
  const f = fixture();
  f.runClock();
  f.controller.speechStarted();
  f.controller.interim("partial-1", "I am thinking about a portal");
  f.controller.speechEnded();
  f.runClock();
  await settle();
  assert.equal(f.sends.length, 0);
  assert.equal(f.spoken.length, 0);
  assert.ok(f.events.some(event => event.type === "transcript" && event.role === "visitor" && !event.final));
  f.controller.close();
});

test("voice endpointing coalesces final fragments and deduplicates provider results", async () => {
  const f = fixture();
  f.controller.speechStarted();
  f.controller.final("fragment-1", "We need a client portal.");
  f.controller.final("fragment-1", "We need a client portal.");
  f.controller.interim("fragment-2", "It should connect");
  f.controller.final("fragment-2", "It should connect to our CRM.");
  f.controller.speechEnded();
  assert.equal(f.sends.length, 0, "Do not submit fragments before the end-of-turn silence");
  f.runClock();
  await settle();
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].content, "We need a client portal. It should connect to our CRM.");
  assert.equal(f.spoken.length, 1);
  f.controller.close();
});

test("voice identical words in separate native results remain legitimate separate turns", async () => {
  const f = fixture();
  f.say("yes-1", "Yes");
  await settle();
  f.say("yes-2", "Yes");
  await settle();
  assert.equal(f.sends.length, 2);
  assert.notEqual(f.sends[0].requestId, f.sends[1].requestId);
  assert.equal(f.sends[0].content, f.sends[1].content);
  f.controller.close();
});

test("voice barge-in stops immediately and serializes the next turn behind an unresolved model", async () => {
  const f = fixture();
  const first = deferred<TurnReply>(), second = deferred<TurnReply>();
  f.setSend(() => f.sends.length === 1 ? first.promise : second.promise);
  f.say("first", "Explain the portal");
  await settle();
  const before = f.stops();
  f.controller.speechStarted();
  assert.ok(f.stops() > before, "Playback cancellation must happen synchronously on speech start");
  f.controller.final("second", "Actually focus on automation");
  f.controller.speechEnded();
  f.controller.flush();
  assert.equal(f.sends.length, 1, "An unresolved persisted request must not race a second model call");
  first.resolve(reply(f.sends[0]));
  await settle();
  assert.equal(f.sends.length, 2);
  assert.equal(f.spoken.length, 0, "The superseded response must not begin speaking");
  assert.ok(f.events.some(event => event.type === "conversation-updated"), "A committed older turn must still refresh canonical history and brief");
  assert.ok(!f.events.some(event => event.type === "transcript" && event.role === "advisor"));
  second.resolve(reply(f.sends[1], 3));
  await settle();
  assert.deepEqual(f.spoken.map(entry => entry.text), ["Answer to Actually focus on automation"]);
  f.controller.close();
});

test("voice canceled playback cannot block the next turn even if its provider never settles", async () => {
  const f = fixture();
  const never = deferred<void>();
  f.setSpeak((_text, _signal, start) => {
    start();
    return f.spoken.length === 1 ? never.promise : Promise.resolve();
  });
  f.say("first", "Explain the portal");
  await settle();
  assert.equal(f.spoken.length, 1);
  const before = f.stops();
  f.controller.interrupt();
  assert.ok(f.stops() > before);
  assert.equal(f.spoken[0].signal.aborted, true);
  f.say("second", "Focus on integrations");
  await settle();
  assert.equal(f.sends.length, 2);
  assert.equal(f.spoken.length, 2);
  f.controller.close();
});

test("voice uncertain sends freeze new intent and retry the exact reviewed request", async () => {
  const f = fixture();
  const first = deferred<TurnReply>();
  f.setSend(input => f.sends.length === 1 ? first.promise : Promise.resolve(reply(input)));
  f.setDepth("concise");
  f.say("first", "Help scope my portal");
  await settle();
  f.say("queued", "We use HubSpot");
  first.reject(new Error("Acknowledgement lost"));
  await settle();
  assert.equal(f.sends.length, 1);
  assert.ok(f.events.some(event => event.type === "error" && event.recovery === "turn" && event.retryable));
  assert.deepEqual(f.pending.find(input => input !== null), f.sends[0]);
  f.setDepth("deep_dive");
  f.controller.retryTurn();
  await settle();
  assert.ok(f.sends.length >= 2);
  assert.deepEqual(f.sends[1], f.sends[0], "Retry must retain original content, depth and idempotency key");
  assert.ok(f.pending.includes(null), "Only confirmed completion can release the persisted pending intent");
  f.controller.close();
});

test("voice reconnect restores an uncertain intent without automatically resending it", async () => {
  const saved: TurnInput = { content: "Scope a client portal", depth: "concise", requestId: "saved_voice_request" };
  const f = fixture({}, saved);
  f.setDepth("deep_dive");
  await settle();
  assert.equal(f.sends.length, 0);
  f.controller.retryTurn();
  await settle();
  assert.deepEqual(f.sends, [saved]);
  f.controller.close();
});

test("voice cannot admit a model turn before saving its safe recovery identity", async () => {
  const f = fixture();
  f.setPersist(() => { throw new Error("Session storage unavailable"); });
  f.say("first", "Scope my project");
  await settle();
  assert.equal(f.sends.length, 0);
  assert.ok(f.events.some(event => event.type === "error" && event.recovery === "turn"));
  f.setPersist(() => {});
  f.controller.retryTurn();
  await settle();
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].requestId, "voice_request_1");
  f.controller.close();
});

test("voice recovery after a receipt-cache failure does not repeat the committed model call", async () => {
  const f = fixture();
  f.setPersist(input => { if (input === null) throw new Error("Failed to clear saved intent"); });
  f.say("first", "Scope my project");
  await settle();
  assert.equal(f.sends.length, 1);
  assert.equal(f.spoken.length, 0);
  f.setPersist(() => {});
  f.controller.retryTurn();
  await settle();
  assert.equal(f.sends.length, 1, "A known committed reply must be reused after local cache failure");
  assert.equal(f.spoken.length, 1);
  assert.equal(f.pending.at(-1), null);
  f.controller.close();
});

test("voice synthesis failure recovers playback without repeating a persisted model request", async () => {
  const f = fixture();
  f.setSpeak(async () => { throw new Error("Audio transport failed"); });
  f.say("first", "Explain the approach");
  await settle();
  assert.equal(f.sends.length, 1);
  assert.ok(f.events.some(event => event.type === "error" && event.recovery === "playback"));
  f.controller.retryTurn();
  await settle();
  assert.equal(f.sends.length, 1);
  f.setSpeak(async (_text, _signal, start) => { start(); });
  f.controller.retryPlayback();
  await settle();
  assert.equal(f.sends.length, 1);
  assert.equal(f.spoken.length, 2);
  assert.equal(f.spoken[0].text, f.spoken[1].text);
  f.controller.close();
});

test("voice speaking state follows actual playback rather than synthesis startup", async () => {
  const f = fixture();
  const audio = deferred<void>();
  f.setSpeak(() => audio.promise);
  f.say("first", "Give me a recommendation");
  await settle();
  assert.equal(f.spoken.length, 1);
  assert.ok(!f.events.some(event => event.type === "state" && event.state === "speaking"));
  f.spoken[0].start();
  assert.ok(f.events.some(event => event.type === "state" && event.state === "speaking"));
  audio.resolve();
  await settle();
  assert.ok(f.events.some(event => event.type === "state" && event.state === "listening"));
  f.controller.close();
});

test("voice queue bounds reject oversized speech visibly without truncating a model request", async () => {
  const f = fixture({ maxQueuedCharacters: 20 });
  assert.equal(f.controller.final("oversized", "This transcript is longer than the configured voice queue limit"), false);
  f.controller.flush();
  await settle();
  assert.equal(f.sends.length, 0);
  assert.ok(f.events.some(event => event.type === "error"));
  f.controller.close();
});

test("voice backpressure identifies a rejected phrase and permits it after queued speech drains", async () => {
  const f = fixture({ maxQueuedFinals: 2 });
  assert.equal(f.controller.final("one", "First point."), true);
  assert.equal(f.controller.final("two", "Second point."), true);
  assert.equal(f.controller.final("held", "Third point."), false);
  f.controller.flush();
  await settle();
  assert.equal(f.sends[0].content, "First point. Second point.");
  assert.equal(f.controller.final("held", "Third point."), true);
  f.controller.flush();
  await settle();
  assert.equal(f.sends[1].content, "Third point.");
  f.controller.close();
});

test("voice rejection after a new speech onset still drains previously accepted fragments", async () => {
  const f = fixture({ maxQueuedCharacters: 24 });
  f.controller.final("accepted", "First point.");
  f.controller.speechStarted();
  assert.equal(f.controller.final("rejected", "This phrase cannot fit in the remaining queue"), false);
  f.runClock();
  await settle();
  assert.equal(f.sends.length, 1, "A rejected phrase must not strand earlier accepted speech");
  assert.equal(f.sends[0].content, "First point.");
  assert.equal(f.events.filter(event => event.type === "input").at(-1)?.speaking, false);
  f.controller.close();
});

test("voice duplicate final callbacks cannot cancel a trusted endpoint or add another request", async () => {
  for (const repeated of ["First point.", "Unexpected changed duplicate."]) {
    const f = fixture();
    f.controller.final("accepted", "First point.");
    f.controller.speechStarted();
    f.controller.speechEnded();
    f.controller.noMatch();
    assert.equal(f.controller.final("accepted", repeated), false);
    f.runClock();
    await settle();
    assert.equal(f.sends.length, 1);
    assert.equal(f.sends[0].content, "First point.");
    assert.equal(f.events.filter(event => event.type === "input").at(-1)?.speaking, false);
    assert.equal(f.controller.canSwitchSpecialist(), true);
    f.controller.close();
  }
});

test("voice stale duplicate cannot end a newer identified utterance", async () => {
  const f = fixture();
  f.controller.final("accepted", "First point.");
  f.controller.interim("current", "Second point");
  assert.equal(f.controller.final("accepted", "First point."), false);
  f.runClock();
  await settle();
  assert.equal(f.sends.length, 0, "The current partial is still being spoken");
  assert.equal(f.events.filter(event => event.type === "input").at(-1)?.speaking, true);
  assert.equal(f.controller.canSwitchSpecialist(), false);
  f.controller.final("current", "Second point.");
  f.runClock();
  await settle();
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].content, "First point. Second point.");
  f.controller.close();
});

test("voice delayed earlier final joins the queue without finalizing the newer partial", async () => {
  const f = fixture();
  f.controller.interim("earlier", "First point");
  f.controller.speechEnded();
  f.controller.interim("newer", "Second point");
  f.controller.final("earlier", "First point.");
  f.runClock();
  await settle();
  assert.equal(f.sends.length, 0);
  assert.equal(f.controller.canSwitchSpecialist(), false);
  const caption = f.events.filter(event => event.type === "transcript").at(-1)!;
  assert.equal(caption.id, "newer");
  assert.equal(caption.final, false);
  assert.equal(caption.text, "First point. Second point");
  f.controller.final("newer", "Second point.");
  f.runClock();
  await settle();
  assert.equal(f.sends[0].content, "First point. Second point.");
  assert.equal(f.sends.length, 1);
  f.controller.close();
});

test("voice no-match preserves accepted fragments and does not clear newer input", async () => {
  const f = fixture();
  f.controller.final("accepted", "We need a portal.");
  f.controller.interim("current", "Unclear extra phrase");
  f.controller.noMatch("older-result");
  f.runClock();
  await settle();
  assert.equal(f.sends.length, 0);
  assert.equal(f.events.filter(event => event.type === "input").at(-1)?.speaking, true);
  assert.ok(!f.events.some(event => event.type === "transcript-clear"));
  f.controller.noMatch("current");
  f.runClock();
  await settle();
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].content, "We need a portal.");
  assert.ok(f.events.some(event => event.type === "transcript-clear" && event.id === "current"));
  assert.ok(f.events.some(event => event.type === "transcript" && event.role === "visitor" && event.final && event.text === "We need a portal."));
  f.controller.close();
});

test("voice terminal no-match IDs cannot unlock or relabel a later utterance", async () => {
  const f = fixture();
  f.controller.interim("rejected", "Uncertain phrase");
  f.controller.noMatch("rejected");
  assert.equal(f.controller.canSwitchSpecialist(), true);
  f.setSpecialist("automation");
  f.controller.speechStarted();
  f.controller.noMatch("rejected");
  assert.equal(f.controller.canSwitchSpecialist(), false, "An old terminal result is not the end of the new recognition cycle");
  f.controller.interim("rejected", "A late changed partial");
  assert.equal(f.controller.final("rejected", "A late changed final"), false);
  f.runClock(); await settle();
  assert.equal(f.sends.length, 0);
  f.controller.interim("new-result", "Automate our workflow");
  f.controller.final("new-result", "Automate our workflow");
  f.runClock(); await settle();
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].content, "Automate our workflow");
  assert.equal(f.sends[0].specialist, "automation");
  f.controller.close();
});

test("voice no-match offers the interrupted model reply without automatic speech or another request", async () => {
  for (const completedBeforeNoMatch of [false, true]) {
    const f = fixture();
    const model = deferred<TurnReply>();
    f.setSend(() => model.promise);
    f.say("request", "Explain the integration");
    f.controller.interim("unclear", "Maybe");
    if (completedBeforeNoMatch) {
      model.resolve(reply(f.sends[0]));
      await settle();
      assert.equal(f.spoken.length, 0);
    }
    f.controller.noMatch("unclear");
    if (!completedBeforeNoMatch) model.resolve(reply(f.sends[0]));
    await settle();
    assert.equal(f.spoken.length, 0, "A rejected utterance must not automatically revive old audio");
    assert.ok(f.events.some(event => event.type === "error" && event.recovery === "playback" && event.retryable));
    f.controller.retryPlayback();
    await settle();
    assert.equal(f.sends.length, 1);
    assert.equal(f.spoken.length, 1);
    assert.equal(f.spoken[0].text, "Answer to Explain the integration");
    f.controller.close();
  }
});

test("voice no-match can replay a stopped speaker without repeating the model", async () => {
  const f = fixture();
  const oldPlayback = deferred<void>();
  f.setSpeak(async (_text, _signal, start) => { start(); return f.spoken.length === 1 ? oldPlayback.promise : undefined; });
  f.say("request", "Explain the integration");
  await settle();
  const first = f.spoken[0];
  f.controller.interim("noise", "Uncertain sound");
  assert.equal(first.signal.aborted, true);
  f.controller.noMatch("noise");
  await settle();
  assert.equal(f.spoken.length, 1);
  f.controller.retryPlayback();
  await settle();
  assert.equal(f.sends.length, 1);
  assert.equal(f.spoken.length, 2);
  oldPlayback.resolve();
  await settle();
  assert.equal(f.spoken.length, 2, "The interrupted transport finishing late cannot replay again");
  f.controller.close();
});

test("voice explicit stop discards provisional recovery even if no-match and model completion arrive later", async () => {
  const f = fixture();
  const model = deferred<TurnReply>();
  f.setSend(() => model.promise);
  f.say("request", "Explain the integration");
  f.controller.interim("noise", "Uncertain sound");
  f.controller.interrupt();
  f.controller.noMatch("noise");
  model.resolve(reply(f.sends[0]));
  await settle();
  f.controller.retryPlayback();
  await settle();
  assert.equal(f.sends.length, 1);
  assert.equal(f.spoken.length, 0);
  assert.ok(!f.events.some(event => event.type === "error" && event.recovery === "playback"));
  f.controller.close();
});

test("voice close cancels queued work and suppresses late model, playback and caption callbacks", async () => {
  const f = fixture();
  const first = deferred<TurnReply>();
  f.setSend(() => first.promise);
  f.say("first", "Plan my portal");
  await settle();
  f.say("queued", "Connect the CRM");
  const before = f.stops();
  f.controller.close();
  assert.ok(f.stops() > before);
  const eventCount = f.events.length;
  first.resolve(reply(f.sends[0]));
  f.runClock();
  f.controller.interim("late", "A stale recognition event");
  f.controller.final("late-final", "Another stale event");
  await settle();
  assert.equal(f.sends.length, 1);
  assert.equal(f.spoken.length, 0);
  assert.equal(f.events.length, eventCount);
  assert.ok(!f.pending.includes(null), "Closing an unresolved adapter must preserve its recovery record for the next connection");
});

test("voice specialist selection is captured at the first finalized phrase of the turn", async () => {
  const f = fixture();
  f.setSpecialist("technical");
  f.controller.final("one", "Plan the integration.");
  assert.equal(f.controller.canSwitchSpecialist(), false);
  // Even a faulty host preference change cannot relabel an already reviewed utterance.
  f.setSpecialist("automation");
  f.controller.final("two", "It must preserve our existing CRM.");
  f.controller.flush();
  await settle();
  assert.equal(f.sends[0].specialist, "technical");
  assert.equal(f.sends[0].content, "Plan the integration. It must preserve our existing CRM.");
  assert.equal(f.pending.find(input => input !== null)?.specialist, "technical");
  f.controller.close();
});

test("voice input activity unlocks specialist selection after a no-match utterance", () => {
  const f = fixture();
  f.controller.interim("unclear", "A partly recognized phrase");
  assert.equal(f.controller.canSwitchSpecialist(), false);
  f.controller.speechEnded();
  assert.equal(f.controller.canSwitchSpecialist(), false, "A physical pause does not prove the pending recognition result is final");
  f.controller.noMatch("unclear");
  assert.equal(f.controller.canSwitchSpecialist(), true);
  const activity = f.events.filter(event => event.type === "input");
  assert.equal(activity[0].speaking, true);
  assert.equal(activity.at(-1)?.speaking, false);
  assert.equal(f.sends.length, 0, "A no-match utterance must not create a request merely to unlock navigation");
  f.controller.close();
});

test("voice recovery exposes the original immutable intent and diagnostics cannot disrupt retries", async () => {
  const f = fixture();
  f.setPhase(() => { throw new Error("Local performance diagnostics unavailable"); });
  f.setSend(input => f.sends.length === 1 ? Promise.reject(new Error("Acknowledgement lost")) : Promise.resolve(reply(input)));
  f.say("first", "Plan the architecture");
  await settle();
  f.say("later", "We use an existing CRM");
  const recovery = f.events.filter((event): event is Extract<VoiceEvent, { type: "error" }> => event.type === "error" && event.recovery === "turn").at(-1)!;
  assert.deepEqual(recovery.originalTurn, f.sends[0]);
  recovery.originalTurn!.content = "A consumer accidentally mutated its event";
  f.controller.retryTurn();
  await settle();
  assert.equal(f.sends.length, 3);
  assert.equal(f.sends[1].content, "Plan the architecture");
  assert.deepEqual(f.sends[1], f.sends[0]);
  assert.equal(f.sends[2].content, "We use an existing CRM");
  const admissions = f.phases.filter(event => event.phase === "admitted");
  assert.equal(admissions[0].turn, admissions[1].turn);
  assert.equal(admissions[1].retry, true);
  assert.notEqual(admissions[1].turn, admissions[2].turn);
  assert.deepEqual(f.phases.filter(event => event.phase === "playback").map(event => event.turn), [admissions[2].turn]);
  assert.ok(f.phases.every(event => Object.keys(event).every(key => ["turn", "phase", "retry"].includes(key))));
  f.controller.close();
});

test("voice specialist switching is blocked during input and model work but permits interrupted playback", async () => {
  const f = fixture();
  const model = deferred<TurnReply>();
  const playback = deferred<void>();
  f.setSend(() => model.promise);
  f.setSpeak((_text, _signal, start) => { start(); return playback.promise; });
  assert.equal(f.controller.canSwitchSpecialist(), true);
  f.controller.speechStarted();
  assert.equal(f.controller.canSwitchSpecialist(), false);
  f.controller.final("one", "Explain the architecture");
  assert.equal(f.controller.canSwitchSpecialist(), false);
  f.controller.speechEnded();
  f.controller.flush();
  await settle();
  assert.equal(f.controller.canSwitchSpecialist(), false);
  model.resolve(reply(f.sends[0]));
  await settle();
  assert.equal(f.controller.canSwitchSpecialist(), true, "Playback can be canceled without creating another model session");
  f.controller.interrupt();
  assert.equal(f.spoken[0].signal.aborted, true);
  f.setSpecialist("automation");
  f.setSend(async input => reply(input));
  f.setSpeak(async (_text, _signal, start) => { start(); });
  f.say("two", "Find the repetitive tasks");
  await settle();
  assert.equal(f.sends.length, 2);
  assert.equal(f.sends[1].specialist, "automation");
  f.controller.close();
  assert.equal(f.controller.canSwitchSpecialist(), false);
});

test("voice uncertain specialist turns keep the original identity across retry and reconnect", async () => {
  const f = fixture();
  f.setSpecialist("technical");
  f.setSend(async () => { throw new Error("Lost acknowledgement"); });
  f.say("one", "Design my integration");
  await settle();
  assert.equal(f.controller.canSwitchSpecialist(), false);
  const original = structuredClone(f.sends[0]);
  f.setSpecialist("automation");
  f.setSend(async input => reply(input));
  f.controller.retryTurn();
  await settle();
  assert.deepEqual(f.sends[1], original);
  f.controller.close();

  const recovered = fixture({}, original);
  recovered.setSpecialist("automation");
  assert.equal(recovered.controller.canSwitchSpecialist(), false);
  recovered.controller.retryTurn();
  await settle();
  assert.deepEqual(recovered.sends, [original]);
  recovered.controller.close();
});
