import assert from "node:assert/strict";
import { test } from "node:test";
import { BargeInGate } from "../src/lib/development-voice/barge-in-gate.ts";

test("local barge-in requires sustained onset and emits one start/end per quiet-bounded burst", () => {
  const gate = new BargeInGate();
  assert.equal(gate.sample(0.1, true, false, 0), null);
  assert.equal(gate.sample(0.1, true, false, 100), null);
  assert.equal(gate.sample(0.001, true, false, 120), null, "A brief click must reset the onset window");
  assert.equal(gate.sample(0.1, true, false, 200), null);
  assert.equal(gate.sample(0.1, true, false, 340), "start");
  assert.equal(gate.sample(0.1, false, false, 500), null, "Stopping playback must not retrigger the current burst");
  assert.equal(gate.sample(0.001, false, false, 600), null);
  assert.equal(gate.sample(0.001, false, false, 949), null);
  assert.equal(gate.sample(0.001, false, false, 950), "end");
  assert.equal(gate.sample(0.001, false, false, 1300), null);
});

test("local barge-in calibrates room noise but never learns a recognized speaker as noise", () => {
  const room = new BargeInGate();
  for (let time = 0; time <= 6000; time += 100) room.sample(0.05, false, false, time);
  for (let time = 6100; time <= 6600; time += 100) assert.equal(room.sample(0.06, true, false, time), null);
  assert.equal(room.sample(0.16, true, false, 6700), null);
  assert.equal(room.sample(0.16, true, false, 6840), "start");
  room.reset();
  assert.equal(room.sample(0.06, true, false, 7000), null);
  assert.equal(room.sample(0.06, true, false, 7300), null, "Reset clears the onset latch without forgetting calibrated room noise");

  const speaking = new BargeInGate();
  for (let time = 0; time <= 6000; time += 100) speaking.sample(0.5, false, true, time);
  assert.equal(speaking.sample(0.03, true, false, 6100), null);
  assert.equal(speaking.sample(0.03, true, false, 6240), "start");
  speaking.reset();
  assert.equal(speaking.sample(Number.NaN, true, false, 6300), null);
  assert.equal(speaking.sample(-1, true, false, 6500), null);
  assert.equal(speaking.sample(0.03, true, false, 6600), null);
  assert.equal(speaking.sample(0.03, true, false, 6740), "start");
});
