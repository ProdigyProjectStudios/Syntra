import assert from "node:assert/strict";
import { test } from "node:test";
import { createAzureVoiceAdapter } from "../src/lib/development-voice/azure-voice.ts";
import { blankBrief } from "../../../lib/consultation/src/native-repository.ts";
import type { ConsultationRuntime, TurnInput, TurnReply, VoiceEvent } from "../../../lib/consultation/src/types.ts";

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
    startAt: number | undefined;
    start(time: number) { this.startAt = time; }
    stop() { this.stopped = true; }
    finish() { this.onended?.(); }
  }
  const contexts: AudioContextFake[] = [];
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
    async resume() { this.setState("running"); }
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
  type RecognitionEvent = { result: { resultId: string; text: string; reason: string } };
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
    partial(id: string, text: string) { this.recognizing?.(this, { result: { resultId: id, text, reason: "RecognizingSpeech" } }); }
    final(id: string, text: string) { this.recognized?.(this, { result: { resultId: id, text, reason: "RecognizedSpeech" } }); }
    noMatch(id: string) { this.recognized?.(this, { result: { resultId: id, text: "", reason: "NoMatch" } }); }
  }
  class Synthesizer {
    synthesizing?: (sender: unknown, event: { result: { audioData: ArrayBuffer } }) => void;
    succeeded?: (result: { reason: string }) => void;
    failed?: () => void;
    closes = 0;
    text = "";
    readonly config: Config;
    constructor(config: Config) { this.config = config; syntheses.push(this); }
    speakTextAsync(text: string, success: (result: { reason: string }) => void, failure: () => void) {
      this.text = text; this.succeeded = success; this.failed = failure;
    }
    close(success?: () => void) { this.closes++; if (success) queueMicrotask(success); }
    audio(values = [1200, -1200]) {
      const data = new ArrayBuffer(values.length * 2), view = new DataView(data);
      values.forEach((value, index) => view.setInt16(index * 2, value, true));
      this.synthesizing?.(this, { result: { audioData: data } });
    }
    complete() { this.succeeded?.({ reason: "SynthesizingAudioCompleted" }); }
  }
  const sdk = {
    SpeechRecognizer: Recognizer, SpeechSynthesizer: Synthesizer, SpeechConfig: Config,
    AudioConfig: { fromStreamInput(input: Stream) {
      const config = { stream: input, closes: 0, close() { this.closes++; input.getTracks().forEach(track => track.stop()); } };
      inputConfigs.push(config); return config;
    } },
    PropertyId: { Speech_SegmentationSilenceTimeoutMs: "segmentation" },
    SpeechSynthesisOutputFormat: { Raw24Khz16BitMonoPcm: "pcm" },
    ResultReason: { RecognizedSpeech: "RecognizedSpeech", NoMatch: "NoMatch", SynthesizingAudioCompleted: "SynthesizingAudioCompleted" },
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
    events, sends, stream, streams, contexts, recognizers, syntheses, inputConfigs, storage, advance, loadSdk,
    newStream: () => new Stream(),
    mediaCalls: () => mediaCalls, tokenCalls: () => tokenCalls,
    adapter: (load = loadSdk) => createAzureVoiceAdapter(runtime, { enabled: true, loadSdk: load }),
    setMedia: (implementation: typeof getMedia) => { getMedia = implementation; },
    setToken: (implementation: typeof fetchToken) => { fetchToken = implementation; },
    setSend: (implementation: typeof send) => { send = implementation; },
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
