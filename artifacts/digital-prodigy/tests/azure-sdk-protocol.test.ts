import assert from "node:assert/strict";
import { test } from "node:test";
import { ResultReason, type SpeechRecognitionResult } from "microsoft-cognitiveservices-speech-sdk";
import { sdkRecognitionFixture } from "./azure-sdk-fixture.ts";

test("installed Azure SDK shares its result ID across phrase results until a new service context", async () => {
  const finals: SpeechRecognitionResult[] = [];
  const sdk = await sdkRecognitionFixture({ recognized: event => { finals.push(event.result); } });
  const requestId = sdk.resultId;
  await sdk.phrase("First request.", 10_000_000, 20_000_000);
  await sdk.phrase("Second request.", 50_000_000, 20_000_000);
  assert.deepEqual(finals.map(result => result.resultId), [requestId, requestId]);
  assert.deepEqual(finals.map(result => result.offset), [10_000_000, 50_000_000]);
  assert.ok(finals.every(result => result.reason === ResultReason.RecognizedSpeech));
  await sdk.nextServiceTurn();
  assert.notEqual(sdk.resultId, requestId);
  await sdk.close();
});

test("installed Azure SDK retains refined final offsets and timed NoMatch within one request", async () => {
  const partials: SpeechRecognitionResult[] = [], finals: SpeechRecognitionResult[] = [];
  const sdk = await sdkRecognitionFixture({
    recognizing: event => { partials.push(event.result); },
    recognized: event => { finals.push(event.result); },
  });
  await sdk.hypothesis("Plan the integration", 10_000_000, 15_000_000);
  await sdk.phrase("Plan the integration.", 12_000_000, 18_000_000);
  await sdk.phrase("", 50_000_000, 4_000_000, "NoMatch");
  assert.equal(partials[0].resultId, finals[0].resultId);
  assert.notEqual(partials[0].offset, finals[0].offset);
  assert.equal(finals[1].reason, ResultReason.NoMatch);
  assert.equal(finals[1].resultId, finals[0].resultId);
  assert.equal(finals[1].offset, 50_000_000);
  await sdk.close();
});
