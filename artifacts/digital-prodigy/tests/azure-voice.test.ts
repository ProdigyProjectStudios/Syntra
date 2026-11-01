import assert from "node:assert/strict";
import { test } from "node:test";
import { createAzureVoiceAdapter } from "../src/lib/development-voice/azure-voice.ts";
import { blankBrief } from "../../../lib/consultation/src/native-repository.ts";
import { manualBrief } from "../../../lib/consultation/src/engine.ts";
import { getSpecialistProfile } from "../../../lib/consultation/src/specialists.ts";
import type { ConsultationRuntime, Message, SpecialistId, TurnInput, TurnReply, VoiceConnection, VoiceEvent } from "../../../lib/consultation/src/types.ts";
import { ResultReason } from "microsoft-cognitiveservices-speech-sdk";
import { sdkRecognitionFixture } from "./azure-sdk-fixture.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const resultFor = (input: TurnInput): TurnReply => ({
  visitorMessage: { id: 1, role: "visitor", content: input.content, depth: input.depth, createdAt: "2026-10-31T00:00:00Z" },
  message: { id: 2, role: "advisor", content: "Start with the existing customer workflow.", depth: input.depth, createdAt: "2026-10-31T00:00:00Z" },
  brief: blankBrief(), suggestedNextSteps: [], specialist: input.specialist,
});

/** Provider/browser fakes validate ownership and event ordering, never audible quality. */
function fixture() {
  const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
  const replaceGlobal = (name: string, value: unknown) => {
    originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  const originalDateNow = Date.now;
  let now = originalDateNow(), nextTimer = 0, nextFrame = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const frames = new Map<number, FrameRequestCallback>();
  const setTimer = (callback: () => void, delay = 0) => {
    const id = ++nextTimer;
    timers.set(id, { at: now + delay, callback });
    return id;
  };
  const clearTimer = (id: number) => { timers.delete(id); };
  const advance = (milliseconds: number) => {
    const until = now + milliseconds;
    for (let calls = 0; calls < 1000; calls++) {
      const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) { now = until; return; }
      now = next[1].at; timers.delete(next[0]); next[1].callback();
    }
    throw new Error("Unexpected timer loop in fake browser");
  };
  class Track {
    readonly kind = "audio";
    enabled = true;
    readyState = "live";
    stops = 0;
    listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    stop() { this.stops++; this.readyState = "ended"; }
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const listeners = this.listeners.get(type) ?? new Set(); listeners.add(listener); this.listeners.set(type, listeners);
    }
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) { this.listeners.get(type)?.delete(listener); }
    end() {
      this.readyState = "ended";
      const event = new Event("ended");
      for (const listener of [...(this.listeners.get("ended") ?? [])]) {
        if (typeof listener === "function") listener(event); else listener.handleEvent(event);
      }
    }
  }
  const streams: Stream[] = [];
  class Stream {
    readonly track = new Track();
    constructor() { streams.push(this); }
    getTracks() { return [this.track]; }
    getAudioTracks() { return [this.track]; }
    clone() { return new Stream(); }
  }
  class AudioNode {
    disconnected = false;
    connect() { return this; }
    disconnect() { this.disconnected = true; }
  }
  class Analyser extends AudioNode {
    fftSize = 256;
    level = 0;
    getFloatTimeDomainData(buffer: Float32Array) { buffer.fill(this.level); }
  }
  class Source extends AudioNode {
    buffer: { duration: number } | null = null;
    onended: (() => void) | null = null;
    stopped = false;
    ended = false;
    startAt: number | undefined;
    start(time: number) { this.startAt = time; }
    stop() { this.stopped = true; }
    finish() { this.ended = true; this.onended?.(); }
  }
  const contexts: AudioContextFake[] = [];
  let audioResume: (() => Promise<void>) | undefined;
  class AudioContextFake {
    state = "running";
    destination = new AudioNode();
    analysers: Analyser[] = [];
    sources: Source[] = [];
    closes = 0;
    listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    constructor() { contexts.push(this); }
    get currentTime() { return now / 1000; }
    createAnalyser() { const analyser = new Analyser(); this.analysers.push(analyser); return analyser; }
    createMediaStreamSource() { return new AudioNode(); }
    createBuffer(_channels: number, length: number, rate: number) {
      const samples = new Float32Array(length);
      return { duration: length / rate, getChannelData: () => samples };
    }
    createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const listeners = this.listeners.get(type) ?? new Set(); listeners.add(listener); this.listeners.set(type, listeners);
    }
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) { this.listeners.get(type)?.delete(listener); }
    setState(state: string) {
      this.state = state;
      const event = new Event("statechange");
      for (const listener of [...(this.listeners.get("statechange") ?? [])]) {
        if (typeof listener === "function") listener(event); else listener.handleEvent(event);
      }
    }
    async resume() { if (audioResume) return audioResume(); this.setState("running"); }
    async close() { this.closes++; this.setState("closed"); }
  }
  const stream = new Stream();
  const storage = new Map<string, string>();
  const events: VoiceEvent[] = [], sends: TurnInput[] = [];
  let mediaCalls = 0, tokenCalls = 0;
  let getMedia = async () => stream;
  let fetchToken = async (_url: unknown, _init?: RequestInit) => new Response(JSON.stringify({ token: "fake-short-lived-token", region: "uksouth", expiresAt: now + 540_000 }), { status: 200 });
  let send: (input: TurnInput) => Promise<TurnReply> = async input => resultFor(input);
  let startup: "success" | "failure" | "pending" = "success";
  let shutdown: "success" | "failure" | "pending" = "success";
  const recognizers: Recognizer[] = [], syntheses: Synthesizer[] = [];
  const inputConfigs: Array<{ stream: Stream; closes: number; close(): void }> = [];
  class Config {
    speechRecognitionLanguage = "";
    speechSynthesisVoiceName = "";
    speechSynthesisOutputFormat = "";
    static fromAuthorizationToken(_token: string, _region: string) { return new Config(); }
    setProperty() {}
  }
  type RecognitionEvent = { result: { resultId: string; text: string; reason: number; offset?: number; duration?: number } };
  class Recognizer {
    static enableTelemetry() {}
    speechStartDetected?: () => void;
    speechEndDetected?: () => void;
    recognizing?: (sender: unknown, event: RecognitionEvent) => void;
    recognized?: (sender: unknown, event: RecognitionEvent) => void;
    canceled?: () => void;
    sessionStopped?: () => void;
    authorizationToken = "";
    closes = 0;
    starts = 0;
    closeSucceeded?: () => void;
    closeFailed?: () => void;
    config: { stream: Stream };
    constructor(_speech: Config, audio: { stream: Stream }) { this.config = audio; recognizers.push(this); }
    startContinuousRecognitionAsync(success: () => void, failure: () => void) {
      this.starts++;
      if (startup === "success") queueMicrotask(success);
      else if (startup === "failure") queueMicrotask(failure);
    }
    stopContinuousRecognitionAsync(success: () => void) { queueMicrotask(success); }
    close(success?: () => void, failure?: () => void) {
      this.closes++; this.config.stream.getTracks().forEach(track => track.stop());
      this.closeSucceeded = success; this.closeFailed = failure;
      if (shutdown === "success" && success) queueMicrotask(success);
      else if (shutdown === "failure" && failure) queueMicrotask(failure);
    }
    partial(id: string, text: string, offset?: number, duration?: number) { this.recognizing?.(this, { result: { resultId: id, text, offset, duration, reason: ResultReason.RecognizingSpeech } }); }
    final(id: string, text: string, offset?: number, duration?: number) { this.recognized?.(this, { result: { resultId: id, text, offset, duration, reason: ResultReason.RecognizedSpeech } }); }
    noMatch(id: string, offset?: number, duration?: number) { this.recognized?.(this, { result: { resultId: id, text: "", offset, duration, reason: ResultReason.NoMatch } }); }
  }
  class Synthesizer {
    synthesizing?: (sender: unknown, event: { result: { audioData: ArrayBuffer } }) => void;
    succeeded?: (result: { reason: number }) => void;
    failed?: () => void;
    closes = 0;
    text = "";
    readonly config: Config;
    constructor(config: Config) { this.config = config; syntheses.push(this); }
    speakTextAsync(text: string, success: (result: { reason: number }) => void, failure: () => void) {
      this.text = text; this.succeeded = success; this.failed = failure;
    }
    close(success?: () => void) { this.closes++; if (success) queueMicrotask(success); }
    audio(values = [1200, -1200]) {
      const data = new ArrayBuffer(values.length * 2), view = new DataView(data);
      values.forEach((value, index) => view.setInt16(index * 2, value, true));
      this.synthesizing?.(this, { result: { audioData: data } });
    }
    complete() { this.succeeded?.({ reason: ResultReason.SynthesizingAudioCompleted }); }
  }
  const sdk = {
    SpeechRecognizer: Recognizer, SpeechSynthesizer: Synthesizer, SpeechConfig: Config,
    AudioConfig: { fromStreamInput(input: Stream) {
      const config = { stream: input, closes: 0, close() { this.closes++; input.getTracks().forEach(track => track.stop()); } };
      inputConfigs.push(config); return config;
    } },
    PropertyId: { Speech_SegmentationSilenceTimeoutMs: "segmentation" },
    SpeechSynthesisOutputFormat: { Raw24Khz16BitMonoPcm: "pcm" },
    ResultReason,
  };
  replaceGlobal("window", { AudioContext: AudioContextFake, setTimeout: setTimer, clearTimeout: clearTimer });
  replaceGlobal("AudioContext", AudioContextFake);
  replaceGlobal("navigator", { mediaDevices: { getUserMedia: () => { mediaCalls++; return getMedia(); } } });
  replaceGlobal("sessionStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } });
  replaceGlobal("fetch", (url: unknown, init?: RequestInit) => { tokenCalls++; return fetchToken(url, init); });
  replaceGlobal("setTimeout", setTimer);
  replaceGlobal("clearTimeout", clearTimer);
  replaceGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++nextFrame; frames.set(id, callback); return id; });
  replaceGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
  Date.now = () => now;
  const runtime: Pick<ConsultationRuntime, "messages"> = {
    messages: { send: async (_id, input) => { sends.push(structuredClone(input)); return send(input); } },
  };
  const loadSdk = async () => sdk as unknown as typeof import("microsoft-cognitiveservices-speech-sdk");
  return {
    events, sends, stream, streams, contexts, recognizers, syntheses, inputConfigs, storage, advance, loadSdk, runtime,
    newStream: () => new Stream(),
    mediaCalls: () => mediaCalls, tokenCalls: () => tokenCalls,
    pendingTimers: () => timers.size, pendingFrames: () => frames.size,
    adapter: (load = loadSdk) => createAzureVoiceAdapter(runtime, { enabled: true, loadSdk: load }),
    setMedia: (implementation: typeof getMedia) => { getMedia = implementation; },
    setToken: (implementation: typeof fetchToken) => { fetchToken = implementation; },
    setSend: (implementation: typeof send) => { send = implementation; },
    setAudioResume: (value: () => Promise<void>) => { audioResume = value; },
    setStartup: (value: typeof startup) => { startup = value; },
    setShutdown: (value: typeof shutdown) => { shutdown = value; },
    capture: (event: VoiceEvent) => { events.push(event); },
    runFrame(time: number) {
      const callbacks = [...frames.values()]; frames.clear();
      callbacks.forEach(callback => callback(time));
    },
    restore() {
      Date.now = originalDateNow;
      for (const [name, descriptor] of originalGlobals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
      timers.clear(); frames.clear();
    },
  };
}

test("Azure accepts a second SDK phrase sharing the first phrase's service result ID", async t => {
  const f = fixture();
  const connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
  const recognizer = f.recognizers[0];
  const sdk = await sdkRecognitionFixture({
    recognizing: event => recognizer.recognizing?.(recognizer, event),
    recognized: event => recognizer.recognized?.(recognizer, event),
  });
  t.after(async () => { await connection.close(); await sdk.close(); f.restore(); });
  for (const [index, text] of ["Plan our portal.", "Connect our CRM."].entries()) {
    const offset = 10_000_000 + index * 50_000_000;
    recognizer.speechStartDetected?.();
    await sdk.hypothesis(text, offset, 10_000_000);
    recognizer.speechEndDetected?.();
    await sdk.phrase(text, offset, 20_000_000);
    f.advance(1000); await settle();
    assert.equal(f.sends.length, index + 1, "Each SDK audio segment must produce one consultation turn despite a shared service request ID");
    f.syntheses[index].audio(); f.syntheses[index].complete();
    f.contexts[0].sources.at(-1)!.finish(); await settle();
    assert.equal(connection.canSwitchSpecialist!(), true);
  }
});

test("Azure runs ten SDK-shaped turns with one shared persisted conversation, specialist voices, barge-in and reopen", async t => {
  const f = fixture();
  const memory = {
    brief: manualBrief(blankBrief(), { budget: "£9000", integrations: "Existing CRM" }, 0),
    messages: [] as Message[], receipts: new Map<string, TurnReply>(),
  };
  const modelContexts: Array<{ history: Message[]; brief: typeof memory.brief }> = [];
  f.setSend(async input => {
    const previous = memory.receipts.get(input.requestId);
    if (previous) return structuredClone({ ...previous, brief: memory.brief });
    modelContexts.push({ history: structuredClone(memory.messages), brief: structuredClone(memory.brief) });
    const response = resultFor(input);
    response.visitorMessage.id = memory.messages.length + 1;
    response.message.id = memory.messages.length + 2;
    response.brief = structuredClone(memory.brief);
    memory.messages.push(response.visitorMessage, response.message);
    memory.receipts.set(input.requestId, structuredClone(response));
    return response;
  });
  const adapter = f.adapter();
  let connection: VoiceConnection | undefined;
  const parsers: Awaited<ReturnType<typeof sdkRecognitionFixture>>[] = [];
  t.after(async () => {
    await connection?.close();
    for (const parser of parsers) await parser.close();
    f.restore();
  });
  connection = await adapter.connect(1, f.capture, new AbortController().signal);
  const recognizer = f.recognizers[0];
  const sdk = await sdkRecognitionFixture({
    recognizing: event => recognizer.recognizing?.(recognizer, event),
    recognized: event => recognizer.recognized?.(recognizer, event),
  });
  parsers.push(sdk);
  const profiles: SpecialistId[] = ["syntra", "technical", "automation"];
  let active: SpecialistId = "syntra", typedTurns = 0;
  for (let index = 0; index < 10; index++) {
    // The sixth utterance interrupts the fifth answer through actual ASR callbacks.
    if (index !== 5) {
      active = profiles[index % profiles.length];
      await connection.setSpecialist!(active);
    }
    const text = index === 2 || index === 3 ? "Yes." : `Project requirement ${index + 1}.`;
    const offset = 10_000_000 + index * 100_000_000;
    recognizer.speechStartDetected?.();
    await sdk.hypothesis(text, offset, 5_000_000);
    if (index === 5) assert.equal(f.contexts[0].sources[4].stopped, true, "New speech must stop the previous owned audio synchronously");
    await sdk.hypothesis(text, offset, 12_000_000);
    recognizer.speechEndDetected?.();
    await sdk.phrase(text, offset + 1_000_000, 20_000_000);
    await sdk.phrase(text, offset + 1_000_000, 20_000_000); // duplicate provider delivery
    f.advance(1000); await settle();
    assert.equal(f.sends.length, index + 1 + typedTurns);
    assert.equal(memory.messages.length, 2 * (index + 1 + typedTurns));
    assert.equal(f.sends.at(-1)!.specialist, active);
    const synthesis = f.syntheses[index];
    assert.equal(synthesis.config.speechSynthesisVoiceName, getSpecialistProfile(active).voiceId);
    synthesis.audio();
    if (index === 5) {
      f.syntheses[4].audio(); f.syntheses[4].complete();
      assert.equal(f.contexts[0].sources[5].stopped, false, "Canceled synthesis cannot stop the next answer");
    }
    if (index !== 4) {
      synthesis.complete(); f.contexts[0].sources.at(-1)!.finish(); await settle();
      assert.equal(f.events.filter(event => event.type === "state").at(-1)?.state, "listening");
      assert.equal(connection.canSwitchSpecialist!(), true);
    }
    if (index === 3) {
      memory.brief = manualBrief(memory.brief, { budget: "£10000" }, memory.brief.revision);
      await f.runtime.messages.send(1, { content: "Keep our revised budget and existing CRM.", depth: "detailed", requestId: "typed_shared_context" });
      typedTurns++;
    }
  }
  assert.equal(f.recognizers.length, 1, "Normal continuous turns must reuse one recognizer");
  assert.equal(f.sends.length, 11);
  assert.equal(new Set(f.sends.map(input => input.requestId)).size, 11);
  assert.equal(memory.messages.length, 22);
  assert.equal(memory.brief.budget, "£10000");
  assert.equal(memory.brief.integrations, "Existing CRM");
  assert.equal(modelContexts.at(-1)!.history.length, 20);
  assert.equal(modelContexts.at(-1)!.brief.budget, "£10000");
  assert.equal(f.storage.has("syntra.development.voice.pending.v1:1"), false);
  await connection.close();
  assert.ok(f.streams.every(stream => stream.track.readyState === "ended"));
  const replacement = f.newStream(); f.setMedia(async () => replacement);
  connection = await adapter.connect(1, f.capture, new AbortController().signal, { specialist: "automation" });
  const current = f.recognizers.at(-1)!;
  const reopened = await sdkRecognitionFixture({
    recognizing: event => current.recognizing?.(current, event),
    recognized: event => current.recognized?.(current, event),
  });
  parsers.push(reopened);
  await sdk.phrase("Old recognizer callback after reopen.", 2_000_000_000, 20_000_000);
  f.advance(1000); await settle();
  assert.equal(f.sends.length, 11);
  current.speechStartDetected?.();
  await reopened.hypothesis("Continue from our saved brief.", 10_000_000, 10_000_000);
  current.speechEndDetected?.();
  await reopened.phrase("Continue from our saved brief.", 11_000_000, 20_000_000);
  f.advance(1000); await settle();
  assert.equal(f.sends.length, 12);
  assert.equal(memory.messages.length, 24);
  assert.equal(modelContexts.at(-1)!.history.length, 22);
  assert.equal(modelContexts.at(-1)!.brief.budget, "£10000");
  assert.equal(f.syntheses.at(-1)!.config.speechSynthesisVoiceName, getSpecialistProfile("automation").voiceId);
  f.syntheses.at(-1)!.audio(); f.syntheses.at(-1)!.complete();
  f.contexts.at(-1)!.sources.at(-1)!.finish(); await settle();
  assert.equal(connection.canSwitchSpecialist!(), true);
});

test("Azure final offset refinement keeps the original partial correlated", async t => {
  const f = fixture();
  const connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
  t.after(async () => { await connection.close(); f.restore(); });
  const recognizer = f.recognizers[0];
  recognizer.speechStartDetected?.();
  recognizer.partial("shared-request", "Plan the integration", 10_000_000, 1_000_000);
  const interim = f.events.filter(event => event.type === "transcript" && !event.final).at(-1)!;
  recognizer.speechEndDetected?.();
  recognizer.final("shared-request", "Plan the integration.", 12_000_000, 20_000_000);
  f.advance(1000); await settle();
  assert.equal(f.sends.length, 1, "A refined start beyond a short partial span must not leave recognition pending");
  const final = f.events.filter(event => event.type === "transcript" && event.role === "visitor" && event.final).at(-1)!;
  assert.equal(final.id, interim.id);
});

test("Azure accepts audio beyond a refined final end and suppresses its late duplicate during new input", async t => {
  const f = fixture();
  const connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
  t.after(async () => { await connection.close(); f.restore(); });
  const recognizer = f.recognizers[0];
  recognizer.speechStartDetected?.();
  recognizer.partial("shared-request", "First request", 100, 400);
  recognizer.speechEndDetected?.(); recognizer.final("shared-request", "First request.", 110, 370);
  f.advance(1000); await settle();
  f.syntheses[0].audio(); f.syntheses[0].complete(); f.contexts[0].sources[0].finish(); await settle();
  recognizer.speechStartDetected?.();
  recognizer.partial("shared-request", "Next request", 490, 5);
  const currentCaption = f.events.filter(event => event.type === "transcript").at(-1)!;
  assert.equal(currentCaption.text, "Next request", "An old broad hypothesis must not swallow audio beyond its refined final end");
  recognizer.final("shared-request", "First request.", 110, 370);
  f.advance(1000); await settle();
  assert.equal(f.sends.length, 1);
  assert.equal(connection.canSwitchSpecialist!(), false);
  recognizer.speechEndDetected?.(); recognizer.final("shared-request", "Next request.", 490, 200);
  f.advance(1000); await settle();
  assert.equal(f.sends.length, 2);
  assert.equal(f.sends[1].content, "Next request.");
});

test("Azure late older final cannot settle a newer overlapping partial", async t => {
  const f = fixture();
  const connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
  t.after(async () => { await connection.close(); f.restore(); });
  const recognizer = f.recognizers[0];
  recognizer.speechStartDetected?.(); recognizer.partial("shared-request", "First point", 100, 100);
  recognizer.speechEndDetected?.();
  recognizer.speechStartDetected?.(); recognizer.partial("shared-request", "Second point", 250, 100);
  recognizer.final("shared-request", "First point.", 150, 150);
  f.advance(1000); await settle();
  assert.equal(f.sends.length, 0, "The older refined final must not settle the current partial");
  assert.equal(f.events.filter(event => event.type === "input").at(-1)?.speaking, true);
  recognizer.speechEndDetected?.(); recognizer.final("shared-request", "Second point.", 250, 100);
  f.advance(1000); await settle();
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].content, "First point. Second point.");
});

test("Azure NoMatch does not consume every later phrase with the same service ID", async t => {
  const f = fixture();
  const connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
  t.after(async () => { await connection.close(); f.restore(); });
  const recognizer = f.recognizers[0];
  recognizer.speechStartDetected?.(); recognizer.noMatch("shared-request", 100, 100);
  assert.equal(connection.canSwitchSpecialist!(), true);
  recognizer.speechStartDetected?.(); recognizer.partial("shared-request", "A genuine request", 500, 100);
  recognizer.speechEndDetected?.(); recognizer.final("shared-request", "A genuine request.", 510, 200);
  f.advance(1000); await settle();
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].content, "A genuine request.");
});

test("Azure ambiguous untimed terminals retire before clearing either bare or identified new input", async () => {
  for (const withHypothesis of [false, true]) {
    const f = fixture();
    let connection: VoiceConnection | undefined;
    try {
      connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
      const recognizer = f.recognizers[0];
      recognizer.speechStartDetected?.(); recognizer.speechEndDetected?.(); recognizer.noMatch("shared-request", 0, 0);
      assert.equal(connection.canSwitchSpecialist!(), true);
      recognizer.speechStartDetected?.();
      if (withHypothesis) recognizer.partial("shared-request", "Current identified words", 1000, 100);
      assert.equal(connection.canSwitchSpecialist!(), false);
      recognizer.noMatch("shared-request", 0, 0);
      assert.equal(recognizer.closes, 1, "Ambiguous identity must retire the old recognizer synchronously, even before a new hypothesis");
      await settle();
      assert.equal(f.recognizers.length, 2);
      assert.equal(f.sends.length, 0);
      recognizer.final("shared-request", "A late old final", 1000, 200);
      f.advance(1000); await settle();
      assert.equal(f.sends.length, 0);
      const replacement = f.recognizers[1];
      replacement.speechStartDetected?.(); replacement.final("shared-request", "Please use this repeated request.", 1000, 200);
      f.advance(1000); await settle();
      assert.equal(f.sends.length, 1);
      assert.equal(f.sends[0].content, "Please use this repeated request.");
    } finally {
      await connection?.close();
      f.restore();
    }
  }
});

test("Azure repeated reopen drains owned resources and ignores retired callbacks across ten sessions", async t => {
  const f = fixture();
  const adapter = f.adapter();
  let connection: VoiceConnection | undefined;
  t.after(async () => { await connection?.close(); f.restore(); });
  for (let session = 0; session < 10; session++) {
    const stream = session === 0 ? f.stream : f.newStream();
    f.setMedia(async () => stream);
    connection = await adapter.connect(1, f.capture, new AbortController().signal);
    const recognizer = f.recognizers.at(-1)!;
    recognizer.speechStartDetected?.(); recognizer.partial("reused-provider-id", `Request ${session}`, 10_000_000, 10_000_000);
    recognizer.speechEndDetected?.(); recognizer.final("reused-provider-id", `Request ${session}.`, 11_000_000, 20_000_000);
    f.advance(1000); await settle();
    assert.equal(f.sends.length, session + 1);
    const synthesis = f.syntheses.at(-1)!;
    synthesis.audio(); synthesis.complete();
    const context = f.contexts.at(-1)!;
    context.sources.at(-1)!.finish(); await settle();
    await connection.close(); await settle();
    assert.equal(f.pendingTimers(), 0, "Retired sessions must not retain authorization, endpoint or playback timers");
    assert.equal(f.pendingFrames(), 0, "Retired sessions must not retain microphone animation callbacks");
    assert.ok(f.streams.every(item => item.track.readyState === "ended"));
    assert.ok(f.contexts.every(item => item.closes === 1));
    assert.ok(f.recognizers.every(item => item.closes === 1));
    assert.ok(f.inputConfigs.every(item => item.closes === 1));
    assert.ok(f.syntheses.every(item => item.closes === 1));
    assert.ok(context.sources.every(item => (item.stopped || item.ended) && item.disconnected));
    const before = f.events.length;
    recognizer.speechStartDetected?.(); recognizer.final("reused-provider-id", "Late retired intent", 100_000_000, 10_000_000);
    synthesis.audio(); synthesis.complete();
    f.advance(1000); await settle();
    assert.equal(f.sends.length, session + 1);
    assert.equal(f.events.length, before);
  }
  assert.equal(f.recognizers.length, 10);
  assert.equal(f.mediaCalls(), 10);
  assert.equal(new Set(f.sends.map(input => input.requestId)).size, 10);
});

test("Azure abort during SDK acquisition never asks for a token or microphone", async t => {
  const f = fixture(); t.after(f.restore);
  const sdk = deferred<Awaited<ReturnType<typeof f.loadSdk>>>();
  const abort = new AbortController();
  const connecting = f.adapter(() => sdk.promise).connect(1, f.capture, abort.signal);
  const rejection = assert.rejects(connecting, { name: "AbortError" });
  abort.abort();
  sdk.resolve(await f.loadSdk());
  await rejection;
  assert.equal(f.tokenCalls(), 0);
  assert.equal(f.mediaCalls(), 0);
});

test("Azure abort while microphone permission is pending rejects promptly and releases a late grant", async t => {
  const f = fixture(); t.after(f.restore);
  const grant = deferred<typeof f.stream>(); f.setMedia(() => grant.promise);
  const abort = new AbortController();
  let rejected = false;
  const connecting = f.adapter().connect(1, f.capture, abort.signal);
  const rejection = assert.rejects(connecting, { name: "AbortError" }).then(() => { rejected = true; });
  await settle();
  assert.equal(f.mediaCalls(), 1);
  abort.abort();
  await settle();
  assert.equal(rejected, true, "Closing voice must not wait for the browser permission dialog");
  grant.resolve(f.stream);
  await rejection; await settle();
  assert.equal(f.stream.track.readyState, "ended");
  assert.equal(f.contexts.length, 0);
  assert.equal(f.recognizers.length, 0);
});

test("Azure authorization timeout rejects a stalled fetch and cannot acquire a late microphone", async t => {
  const f = fixture(); t.after(f.restore);
  const token = deferred<Response>(); f.setToken(() => token.promise);
  const connecting = f.adapter().connect(1, f.capture, new AbortController().signal);
  const rejected = assert.rejects(connecting, /authorization timed out/i);
  await settle();
  assert.equal(f.tokenCalls(), 1);
  f.advance(15_000);
  await rejected;
  assert.equal(f.mediaCalls(), 0);
  const count = f.events.length;
  token.resolve(new Response(JSON.stringify({ token: "late-token", region: "uksouth", expiresAt: Date.now() + 540_000 }), { status: 200 }));
  await settle();
  assert.equal(f.mediaCalls(), 0);
  assert.equal(f.events.length, count);
});

test("Azure reconnect never opens a second unresolved microphone permission request", async t => {
  const f = fixture(); t.after(f.restore);
  const grant = deferred<typeof f.stream>(); f.setMedia(() => grant.promise);
  const adapter = f.adapter();
  const first = adapter.connect(1, f.capture, new AbortController().signal);
  const rejectedFirst = assert.rejects(first, { name: "AbortError" });
  await settle();
  await assert.rejects(adapter.connect(1, f.capture, new AbortController().signal), /microphone permission request/i);
  await rejectedFirst;
  assert.equal(f.mediaCalls(), 1);
  grant.resolve(f.stream); await settle();
  assert.equal(f.stream.track.readyState, "ended");
  const replacement = f.newStream(); f.setMedia(async () => replacement);
  const connected = await adapter.connect(1, f.capture, new AbortController().signal);
  assert.equal(f.mediaCalls(), 2);
  await connected.close();
});

test("Azure provider startup failure releases all acquired browser and SDK resources", async t => {
  const f = fixture(); t.after(f.restore); f.setStartup("failure");
  await assert.rejects(f.adapter().connect(1, f.capture, new AbortController().signal), /connect|speech|microphone/i);
  await settle();
  assert.ok(f.streams.every(stream => stream.track.readyState === "ended"));
  assert.equal(f.contexts[0].state, "closed");
  assert.equal(f.recognizers[0].closes, 1);
  assert.equal(f.inputConfigs[0].closes, 1);
});

test("Azure microphone loss closes the transport and prevents later recognition or playback", async t => {
  const f = fixture(); t.after(f.restore);
  const connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
  const recognizer = f.recognizers[0];
  f.stream.track.end();
  await settle();
  assert.ok(f.events.some(event => event.type === "state" && event.state === "closed"));
  assert.ok(f.events.some(event => event.type === "error"));
  const before = f.events.length;
  recognizer.partial("stale", "Stale words"); recognizer.final("stale", "Stale words");
  f.advance(1000); await settle();
  assert.equal(f.sends.length, 0);
  assert.equal(f.events.length, before);
  await connection.close();
  assert.equal(f.recognizers[0].closes, 1);
});

test("Azure superseding connection closes its predecessor before allocating another microphone", async t => {
  const f = fixture(); t.after(f.restore);
  const adapter = f.adapter();
  const first = await adapter.connect(1, f.capture, new AbortController().signal);
  const firstRecognizer = f.recognizers[0];
  const replacement = f.newStream();
  f.setMedia(async () => {
    assert.equal(f.stream.track.readyState, "ended");
    assert.equal(firstRecognizer.closes, 1);
    return replacement;
  });
  const second = await adapter.connect(1, f.capture, new AbortController().signal);
  await first.close();
  assert.equal(replacement.track.readyState, "live", "Closing an old returned handle must not close its successor");
  await second.close();
  assert.equal(replacement.track.readyState, "ended");
});

test("Azure mute retires recognition callbacks and unmute captures through a fresh owned clone", async t => {
  const f = fixture(); t.after(f.restore);
  const connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
  const old = f.recognizers[0];
  old.partial("old-partial", "Unfinished words");
  await connection.setMuted!(true);
  assert.equal(f.stream.track.enabled, false);
  assert.equal(f.stream.track.readyState, "live");
  assert.notEqual(old.config.stream, f.stream, "The SDK must not own the retained browser microphone track");
  await connection.setMuted!(false);
  const current = f.recognizers.at(-1)!;
  assert.notEqual(current, old);
  assert.equal(f.stream.track.enabled, true);
  assert.equal(current.config.stream.track.readyState, "live");
  old.final("old-partial", "Stale buffered words");
  old.canceled?.();
  f.advance(1000); await settle();
  assert.equal(f.sends.length, 0);
  assert.ok(!f.events.some(event => event.type === "state" && event.state === "closed"));
  current.final("new-utterance", "Plan the workflow");
  f.advance(1000); await settle();
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].content, "Plan the workflow");
  await connection.close();
});

test("Azure unmute waits for asynchronous SDK shutdown before opening the next recognizer", async t => {
  const f = fixture(); t.after(f.restore);
  const connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
  const old = f.recognizers[0]; f.setShutdown("pending");
  const muting = Promise.resolve(connection.setMuted!(true));
  const unmuting = Promise.resolve(connection.setMuted!(false));
  await settle();
  assert.equal(old.closes, 1);
  assert.equal(f.recognizers.length, 1, "Owning a fresh clone does not prove the provider connection has retired");
  old.final("retired", "An old recognition result");
  old.closeSucceeded!();
  await muting; await unmuting; await settle();
  assert.equal(f.recognizers.length, 2);
  assert.equal(f.sends.length, 0);
  f.setShutdown("success");
  await connection.close();
});

test("Azure shutdown timeout never starts a second provider recognizer", async t => {
  const f = fixture(); t.after(f.restore);
  const connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
  const old = f.recognizers[0]; f.setShutdown("pending");
  const muting = Promise.resolve(connection.setMuted!(true));
  void muting.catch(() => {});
  const unmuting = Promise.resolve(connection.setMuted!(false));
  const rejection = assert.rejects(unmuting, /clos|stop|retir|shut|release/i);
  await settle();
  f.advance(5000);
  await rejection;
  await Promise.allSettled([muting]);
  assert.equal(f.recognizers.length, 1);
  assert.ok(f.events.some(event => event.type === "state" && event.state === "closed"));
  old.closeSucceeded?.(); await settle();
  assert.equal(f.recognizers.length, 1, "Late shutdown acknowledgement must not restart a terminal connection");
  await connection.close();
});

test("Azure close preserves an uncertain turn and suppresses all late output", async t => {
  const f = fixture(); t.after(f.restore);
  const model = deferred<TurnReply>(); f.setSend(() => model.promise);
  const connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
  f.recognizers[0].final("request", "Plan our portal");
  f.advance(1000); await settle();
  assert.equal(f.sends.length, 1);
  const pending = f.storage.get("syntra.development.voice.pending.v1:1");
  assert.ok(pending);
  await connection.close();
  const count = f.events.length;
  model.resolve(resultFor(f.sends[0]));
  await settle();
  assert.equal(f.storage.get("syntra.development.voice.pending.v1:1"), pending);
  assert.equal(f.syntheses.length, 0);
  assert.equal(f.events.length, count);
});

test("Azure suspended output recovers only playback and ignores canceled synthesis callbacks", async t => {
  const f = fixture(); t.after(f.restore);
  const connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
  f.recognizers[0].final("request", "Plan the workflow");
  f.advance(1000); await settle();
  const prior = f.syntheses[0], context = f.contexts[0];
  prior.audio();
  assert.ok(f.events.some(event => event.type === "state" && event.state === "speaking"));
  context.setState("suspended");
  await settle();
  assert.equal(context.sources[0].stopped, true);
  assert.ok(f.events.some(event => event.type === "error" && event.recovery === "playback"));
  prior.audio();
  assert.equal(context.sources.length, 1);
  await connection.retryPlayback!();
  await settle();
  assert.equal(f.sends.length, 1, "Output recovery must not create a second model request");
  assert.equal(f.syntheses.length, 2);
  f.syntheses[1].audio();
  prior.complete();
  await settle();
  assert.equal(context.sources[1].stopped, false, "A canceled synthesis completion cannot stop its successor");
  f.syntheses[1].complete(); context.sources[1].finish();
  await settle();
  await connection.close();
});

test("Azure local-only noise stops output without stranding the session on a missing SDK result", async t => {
  const f = fixture(); t.after(f.restore);
  const connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
  f.recognizers[0].final("request", "Explain the workflow");
  f.advance(1000); await settle();
  f.syntheses[0].audio();
  const context = f.contexts[0], input = context.analysers[1];
  input.level = 0.2;
  f.runFrame(0); f.runFrame(140);
  assert.equal(context.sources[0].stopped, true, "Local onset must cancel owned playback immediately");
  input.level = 0;
  f.runFrame(150); f.runFrame(500);
  await settle();
  assert.equal(connection.canSwitchSpecialist!(), false, "Allow a short recognition grace period before abandoning the unrecognized burst");
  f.advance(5000); await settle();
  assert.equal(f.sends.length, 1, "Unrecognized noise must not create a visitor turn");
  assert.equal(connection.canSwitchSpecialist!(), true, "A retired local-only recognition cycle must not remain locked");
  assert.equal(f.recognizers.length, 2);
  f.recognizers[0].final("stale-local-cycle", "A delayed result from the retired cycle");
  f.advance(1000); await settle();
  assert.equal(f.sends.length, 1);
  assert.ok(f.events.some(event => event.type === "error" && event.recovery === "playback"), "The saved response should remain explicitly replayable");
  assert.equal(f.syntheses.length, 1, "Recovery must not automatically resume canceled audio");
  await connection.close();
});

test("Azure local-only grace never abandons a genuine identified utterance", async t => {
  const f = fixture(); t.after(f.restore);
  const connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
  f.recognizers[0].final("request", "Explain the workflow");
  f.advance(1000); await settle();
  f.syntheses[0].audio();
  const input = f.contexts[0].analysers[1];
  input.level = 0.2; f.runFrame(0); f.runFrame(140);
  input.level = 0; f.runFrame(150); f.runFrame(500);
  const recognizer = f.recognizers[0];
  recognizer.partial("identified", "I want a portal");
  f.advance(6000); await settle();
  assert.equal(recognizer.closes, 0);
  assert.equal(f.recognizers.length, 1);
  assert.equal(connection.canSwitchSpecialist!(), false);
  assert.equal(f.sends.length, 1);
  recognizer.final("identified", "I want a portal");
  f.advance(1000); await settle();
  assert.equal(f.sends.length, 2);
  assert.equal(f.sends[1].content, "I want a portal");
  await connection.close();
});

test("Azure mute during fallback shutdown cannot resurrect a retired recognizer", async t => {
  const f = fixture(); t.after(f.restore);
  const connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
  f.recognizers[0].final("request", "Explain the workflow");
  f.advance(1000); await settle();
  f.syntheses[0].audio();
  const input = f.contexts[0].analysers[1], old = f.recognizers[0];
  input.level = 0.2; f.runFrame(0); f.runFrame(140);
  input.level = 0; f.runFrame(150); f.runFrame(500);
  f.setShutdown("pending");
  f.advance(5000); await settle();
  assert.equal(old.closes, 1);
  await connection.setMuted!(true);
  old.closeSucceeded!(); await settle();
  assert.equal(f.recognizers.length, 1, "The abandoned restart must check mute/generation after awaiting shutdown");
  assert.equal(f.stream.track.enabled, false);
  await connection.setMuted!(false);
  assert.equal(f.recognizers.length, 2);
  assert.equal(f.recognizers[1].config.stream.track.readyState, "live");
  f.setShutdown("success");
  await connection.close();
});

test("Azure model deadline preserves the original intent and discards late audio until receipt retry", async t => {
  const f = fixture(); t.after(f.restore);
  const uncertain = deferred<TurnReply>();
  f.setSend(input => f.sends.length === 1 ? uncertain.promise : Promise.resolve(resultFor(input)));
  const connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
  f.recognizers[0].final("request", "Plan our portal");
  f.advance(1000); await settle();
  const original = structuredClone(f.sends[0]);
  const saved = f.storage.get("syntra.development.voice.pending.v1:1");
  assert.ok(saved);
  f.advance(120_000); await settle();
  assert.ok(f.events.some(event => event.type === "error" && event.recovery === "turn" && event.originalTurn?.requestId === original.requestId));
  assert.equal(f.sends.length, 1);
  uncertain.resolve(resultFor(original)); await settle();
  assert.equal(f.syntheses.length, 0, "A late response after the ambiguous deadline cannot silently speak");
  assert.equal(f.storage.get("syntra.development.voice.pending.v1:1"), saved);
  await connection.retryTurn!(); await settle();
  assert.deepEqual(f.sends, [original, original], "The retry must ask for the original receipt, not a new intent");
  assert.equal(f.syntheses.length, 1);
  assert.equal(f.storage.has("syntra.development.voice.pending.v1:1"), false);
  await connection.close();
});


test("Azure adopts gesture-unlocked audio and releases it when closed", async t => {
  const f = fixture(); t.after(f.restore);
  const adapter = f.adapter();
  const gesture = new AbortController();
  adapter.prepare!(gesture.signal);
  assert.equal(f.contexts.length, 1);
  const connection = await adapter.connect(1, f.capture, new AbortController().signal);
  assert.equal(f.contexts.length, 1, "Connection must reuse the gesture-owned context");
  gesture.abort();
  assert.equal(f.contexts[0].closes, 0, "Adoption transfers cleanup to the connection");
  await connection.close();
  assert.equal(f.contexts[0].closes, 1);
});

test("Azure audio activation timeout releases capture without announcing listening", async t => {
  const f = fixture(); t.after(f.restore);
  const resumed = deferred<void>();
  f.setAudioResume(() => resumed.promise);
  const opening = f.adapter().connect(1, f.capture, new AbortController().signal);
  const rejected = assert.rejects(opening, /Audio needs a browser gesture/);
  await settle();
  assert.equal(f.contexts.length, 1);
  f.advance(5_001);
  await rejected;
  assert.equal(f.stream.track.readyState, "ended");
  assert.equal(f.contexts[0].closes, 1);
  assert.equal(f.recognizers.length, 0);
  assert.equal(f.events.some(e => e.type === "state" && e.state === "listening"), false);
  assert.equal(f.pendingTimers(), 0);
  resumed.resolve(); await settle();
  assert.equal(f.recognizers.length, 0, "Late resume never resurrects a retired connection");
});

test("Azure rejected audio activation fails promptly and cleans up permission capture", async t => {
  const f = fixture(); t.after(f.restore);
  f.setAudioResume(async () => { throw new DOMException("Audio activation blocked", "NotAllowedError"); });
  await assert.rejects(f.adapter().connect(1, f.capture, new AbortController().signal), /Audio could not start/);
  assert.equal(f.stream.track.readyState, "ended");
  assert.equal(f.contexts[0].closes, 1);
  assert.equal(f.recognizers.length, 0);
  assert.equal(f.pendingTimers(), 0);
});

test("Azure close during audio activation rejects promptly and ignores a late resume", async t => {
  const f = fixture(); t.after(f.restore);
  const resumed = deferred<void>();
  f.setAudioResume(() => resumed.promise);
  const abort = new AbortController();
  const opening = f.adapter().connect(1, f.capture, abort.signal);
  const rejected = assert.rejects(opening, error => error instanceof Error && error.name === "AbortError");
  await settle();
  abort.abort(); await rejected;
  assert.equal(f.stream.track.readyState, "ended");
  assert.equal(f.contexts[0].closes, 1);
  assert.equal(f.pendingTimers(), 0);
  resumed.resolve(); await settle();
  assert.equal(f.recognizers.length, 0);
  assert.equal(f.events.some(e => e.type === "state" && e.state === "listening"), false);
});

test("Azure resource-region repair retires the old recognizer instead of applying mismatched authorization", async t => {
  const f = fixture(); t.after(f.restore);
  let calls = 0;
  f.setToken(async () => new Response(JSON.stringify({ token: `fake-token-${++calls}`, region: calls === 1 ? "uksouth" : "westeurope", expiresAt: Date.now() + 540_000 }), { status: 200 }));
  const connection = await f.adapter().connect(1, f.capture, new AbortController().signal);
  const response = deferred<TurnReply>();
  f.setSend(() => response.promise);
  f.recognizers[0].final("region-repair", "A safe synthetic request");
  f.advance(1000); await settle();
  // Busy turns prevent idle close while token renewal reaches its real deadline.
  f.advance(420_000); await settle();
  assert.equal(calls, 2);
  assert.equal(f.recognizers[0].authorizationToken, "", "Never send new-region authorization to the previous endpoint");
  assert.equal(f.recognizers[0].closes, 1);
  assert.equal(f.stream.track.readyState, "ended");
  assert.equal(f.events.at(-1)?.type, "error");
  await connection.close();
});
