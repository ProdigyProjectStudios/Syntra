import assert from "node:assert/strict";
import { test } from "node:test";
import { PcmPlayer } from "../src/lib/development-voice/pcm-player.ts";

class FakeAnalyser {
  fftSize = 0;
  connected = false;
  disconnected = false;
  connect() { this.connected = true; }
  disconnect() { this.disconnected = true; }
}
class FakeBuffer {
  readonly samples: Float32Array;
  readonly duration: number;
  constructor(length: number, rate: number) {
    this.samples = new Float32Array(length);
    this.duration = length / rate;
  }
  getChannelData() { return this.samples; }
}
class FakeSource {
  buffer: FakeBuffer | null = null;
  onended: (() => void) | null = null;
  startAt: number | undefined;
  stopped = false;
  disconnected = false;
  connect() {}
  disconnect() { this.disconnected = true; }
  start(time: number) { this.startAt = time; }
  stop() { this.stopped = true; }
  finish() { this.onended?.(); }
}
class FakeContext {
  currentTime = 10;
  state = "running";
  destination = {};
  analyser = new FakeAnalyser();
  sources: FakeSource[] = [];
  createAnalyser() { return this.analyser; }
  createBuffer(_channels: number, length: number, rate: number) { return new FakeBuffer(length, rate); }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source; }
}
function fixture() {
  const context = new FakeContext();
  return { context, player: new PcmPlayer(context as unknown as AudioContext) };
}
function pcm(values: number[]) {
  const bytes = new ArrayBuffer(values.length * 2);
  const view = new DataView(bytes);
  values.forEach((value, index) => view.setInt16(index * 2, value, true));
  return bytes;
}

test("PCM streaming preserves signed samples across odd-byte transport boundaries", async () => {
  const { player, context } = fixture();
  let starts = 0;
  const playback = player.begin(() => { starts++; });
  player.append(Uint8Array.of(0).buffer);
  assert.equal(context.sources.length, 0);
  player.append(Uint8Array.of(128, 255, 127, 0).buffer);
  player.append(Uint8Array.of(0).buffer);
  assert.deepEqual(context.sources.flatMap(source => Array.from(source.buffer!.samples)), [-1, 32767 / 32768, 0]);
  assert.equal(starts, 1, "Only the first audible chunk starts the response");
  player.end();
  context.sources.forEach(source => source.finish());
  await playback;
  player.dispose();
});

test("PCM chunks play consecutively and completion waits for the last scheduled sample", async () => {
  const { player, context } = fixture();
  let ended = false;
  const playback = player.begin(() => {}).then(() => { ended = true; });
  player.append(pcm(Array(24).fill(800)));
  player.append(pcm(Array(48).fill(-800)));
  assert.equal(context.sources[0].startAt, 10);
  assert.equal(context.sources[1].startAt, 10.001);
  player.end();
  await Promise.resolve();
  assert.equal(ended, false, "Synthesis completion is not audio playback completion");
  context.sources[0].finish();
  await Promise.resolve();
  assert.equal(ended, false);
  context.sources[1].finish();
  await playback;
  assert.equal(ended, true);
  player.dispose();
});

test("PCM interruption synchronously stops every owned node and releases pending playback", async () => {
  const { player, context } = fixture();
  const playback = player.begin(() => {});
  player.append(pcm([900, -900]));
  player.append(pcm([1200, -1200]));
  player.stop();
  assert.ok(context.sources.every(source => source.stopped && source.disconnected && source.onended === null));
  const count = context.sources.length;
  player.append(pcm([1, 2]));
  assert.equal(context.sources.length, count, "Late transport data after cancellation must be ignored");
  await playback;
  player.stop();
  player.dispose();
  assert.equal(context.analyser.disconnected, true);
});

test("PCM late end callbacks from interrupted output cannot complete a successor response", async () => {
  const { player, context } = fixture();
  const first = player.begin(() => {});
  player.append(pcm([100]));
  const staleEnd = context.sources[0].onended!;
  player.stop();
  await first;
  let secondEnded = false;
  const second = player.begin(() => {}).then(() => { secondEnded = true; });
  player.append(pcm([200]));
  player.end();
  staleEnd();
  await Promise.resolve();
  assert.equal(secondEnded, false);
  context.sources[1].finish();
  await second;
  assert.equal(secondEnded, true);
  player.dispose();
});

test("PCM suspended output fails before declaring that audio is playing", async () => {
  const { player, context } = fixture();
  context.state = "suspended";
  let starts = 0;
  const playback = player.begin(() => { starts++; });
  assert.throws(() => player.append(pcm([100])), /enable audio playback/);
  assert.equal(context.sources.length, 0);
  assert.equal(starts, 0);
  player.stop();
  await playback;
  player.dispose();
});

test("PCM empty or incomplete streams fail without playback and release the next response", async () => {
  const { player, context } = fixture();
  let starts = 0;
  for (const chunk of [new ArrayBuffer(0), Uint8Array.of(128).buffer]) {
    let released = false;
    const playback = player.begin(() => { starts++; }).then(() => { released = true; });
    player.append(chunk);
    assert.throws(() => player.end(), /audio|PCM|sample/i);
    await playback;
    assert.equal(released, true, "A failed stream must not leave an unresolved playback operation");
    assert.equal(starts, 0, "Incomplete PCM must not claim that the agent spoke");
    assert.equal(context.sources.length, 0);
  }
  const next = player.begin(() => { starts++; });
  player.append(pcm([600, -600]));
  assert.equal(starts, 1);
  assert.deepEqual(Array.from(context.sources[0].buffer!.samples), [600 / 32768, -600 / 32768]);
  player.end();
  context.sources[0].finish();
  await next;
  player.dispose();
});
