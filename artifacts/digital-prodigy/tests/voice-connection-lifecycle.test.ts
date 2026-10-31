import assert from "node:assert/strict";
import { test } from "node:test";
import { VoiceConnectionLifecycle, reconnectFailure } from "../src/components/voice-connection-lifecycle.ts";
import type { VoiceConnection, VoiceEvent } from "../../../lib/consultation/src/types.ts";

const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test("voice terminal event before acquisition closes the late connection without reviving controls", () => {
  const controller = new AbortController();
  const lifecycle = new VoiceConnectionLifecycle(controller.signal);
  let closes = 0;
  const connection: VoiceConnection = { close() { closes++; } };
  assert.equal(lifecycle.admitEvent({ type: "state", state: "closed" }), true);
  assert.equal(lifecycle.closed, true);
  assert.equal(lifecycle.attach(connection), false);
  assert.equal(lifecycle.connection, null);
  assert.equal(lifecycle.attach(connection), false);
  lifecycle.dispose();
  assert.equal(closes, 1, "Both late acquisition and effect cleanup refer to the same released handle");
});

test("voice released stream rejects late output while preserving its final error as reconnect guidance", () => {
  const lifecycle = new VoiceConnectionLifecycle(new AbortController().signal);
  let closes = 0;
  assert.equal(lifecycle.attach({ close() { closes++; } }), true);
  assert.equal(lifecycle.admitEvent({ type: "state", state: "closed" }), true);
  const stale: VoiceEvent[] = [
    { type: "state", state: "speaking" },
    { type: "amplitude", value: 0.8 },
    { type: "transcript", role: "advisor", text: "Late response", final: true },
    { type: "specialist", specialist: "technical" },
    { type: "input", speaking: true },
  ];
  for (const event of stale) assert.equal(lifecycle.admitEvent(event), false, event.type);
  const lastError = { type: "error", message: "The microphone disconnected.", retryable: false, recovery: "turn" } as const;
  assert.equal(lifecycle.admitEvent(lastError), true);
  assert.deepEqual(reconnectFailure(lastError), {
    message: "The microphone disconnected.", recoverable: true, retryable: true,
  }, "A closed controller cannot service its former turn/playback retry method");
  assert.equal(lifecycle.connection, null);
  assert.equal(closes, 1);
  lifecycle.dispose();
  assert.equal(lifecycle.admitEvent(lastError), false);
});

test("voice connection ownership rejects a second handle and releases each resource once", () => {
  const lifecycle = new VoiceConnectionLifecycle(new AbortController().signal);
  let firstClosed = 0, secondClosed = 0;
  const first = { close() { firstClosed++; } };
  const second = { close() { secondClosed++; } };
  assert.equal(lifecycle.attach(first), true);
  assert.equal(lifecycle.attach(second), false);
  assert.equal(lifecycle.connection, first);
  lifecycle.dispose();
  lifecycle.dispose();
  assert.equal(firstClosed, 1);
  assert.equal(secondClosed, 1);
});

test("voice close failure is handled once and late rejection after disposal cannot update the UI", async () => {
  for (const asynchronously of [false, true]) {
    const abort = new AbortController();
    let notices = 0, closes = 0;
    const lifecycle = new VoiceConnectionLifecycle(abort.signal, () => { notices++; });
    lifecycle.attach({ close() {
      closes++;
      if (asynchronously) return Promise.reject(new Error("Provider close failed"));
      throw new Error("Provider close failed");
    } });
    assert.doesNotThrow(() => lifecycle.admitEvent({ type: "state", state: "closed" }));
    await settle();
    assert.equal(lifecycle.closeFailed, true);
    assert.equal(notices, 1);
    lifecycle.dispose();
    assert.equal(closes, 1);
  }
  let reject!: (error: Error) => void;
  let notices = 0;
  const lifecycle = new VoiceConnectionLifecycle(new AbortController().signal, () => { notices++; });
  lifecycle.attach({ close: () => new Promise<void>((_resolve, no) => { reject = no; }) });
  lifecycle.dispose();
  reject(new Error("Late provider rejection"));
  await settle();
  assert.equal(lifecycle.closeFailed, true);
  assert.equal(notices, 0);
});

test("voice aborted acquisition releases a late handle and rejects all of its events", () => {
  const abort = new AbortController();
  const lifecycle = new VoiceConnectionLifecycle(abort.signal);
  abort.abort();
  let closes = 0;
  assert.equal(lifecycle.attach({ close() { closes++; } }), false);
  assert.equal(lifecycle.admitEvent({ type: "error", message: "Stale error" }), false);
  assert.equal(lifecycle.connection, null);
  assert.equal(closes, 1);
  lifecycle.dispose();
});
