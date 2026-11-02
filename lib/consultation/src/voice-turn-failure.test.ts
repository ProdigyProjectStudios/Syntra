import assert from "node:assert/strict";
import { test } from "node:test";
import { voiceTurnFailureMessage } from "./voice-turn-failure.ts";

test("daily AI allowance rejection explains the reset without losing the original request", () => {
  const message = voiceTurnFailureMessage({ status: 429, data: { error: "Syntra's daily AI allowance has been reached. It resets at midnight UTC." } });
  assert.match(message!, /midnight UTC/);
  assert.match(message!, /original request is saved/);
  assert.match(voiceTurnFailureMessage({ status: 429, data: { error: "Syntra's shared AI allowance has been reached. Please try again later." } })!, /daily AI allowance/);
});

test("rate-limit errors never expose arbitrary server text or disguise uncertain failures", () => {
  assert.match(voiceTurnFailureMessage({ status: 429, data: { error: "Please wait a minute before sending more messages." } })!, /wait a minute/);
  const privateText = "Private provider response and transcript";
  assert.ok(!voiceTurnFailureMessage({ status: 429, data: { error: privateText } })!.includes(privateText));
  assert.equal(voiceTurnFailureMessage({ status: 502, data: { error: privateText } }), undefined);
  assert.equal(voiceTurnFailureMessage(new Error(privateText)), undefined);
});
