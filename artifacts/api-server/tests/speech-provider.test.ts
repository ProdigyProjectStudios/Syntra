import assert from "node:assert/strict";
import { test } from "node:test";
import { createSpeechTokenBroker, speechConfiguration } from "../src/lib/speech-provider.ts";

const environment = {
  SYNTRA_VOICE_PROVIDER: "azure", AZURE_SPEECH_KEY: "TEST-ONLY-SUBSCRIPTION-KEY", AZURE_SPEECH_REGION: "uksouth",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

test("speech remains unavailable without complete safe configuration and makes no provider call", async () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls++; return new Response("fixture-token"); };
  for (const env of [{}, { ...environment, SYNTRA_VOICE_PROVIDER: "none" },
    { ...environment, AZURE_SPEECH_KEY: "" }, { ...environment, AZURE_SPEECH_REGION: "uksouth/../../other" }]) {
    assert.deepEqual(speechConfiguration(env), { enabled: false, provider: "none", region: null });
    await assert.rejects(createSpeechTokenBroker(env, request)("visitor"), { status: 503 });
  }
  assert.equal(calls, 0);
});

test("speech credential requests coalesce and only the temporary token reaches the caller", async () => {
  let calls = 0;
  const response = deferred<Response>();
  const request: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), "https://uksouth.api.cognitive.microsoft.com/sts/v1.0/issueToken");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("Ocp-Apim-Subscription-Key"), environment.AZURE_SPEECH_KEY);
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal instanceof AbortSignal, "A provider timeout must be attached");
    return response.promise;
  };
  const broker = createSpeechTokenBroker(environment, request, () => 1_000);
  const requests = [broker("visitor-a"), broker("visitor-b"), broker("visitor-c")];
  assert.equal(calls, 1);
  response.resolve(new Response("temporary-fixture-token"));
  const replies = await Promise.all(requests);
  for (const reply of replies) {
    assert.equal(reply.token, "temporary-fixture-token");
    assert.equal(reply.region, "uksouth");
    assert.ok(reply.expiresAt > 1_000);
    assert.ok(!JSON.stringify(reply).includes(environment.AZURE_SPEECH_KEY));
  }
  assert.deepEqual(await broker("visitor-d"), replies[0]);
  assert.equal(calls, 1);
});

test("speech cached tokens refresh before expiry without reusing an expired authorization", async () => {
  let now = 1_000, calls = 0;
  const request: typeof fetch = async () => new Response(`temporary-token-${++calls}`);
  const broker = createSpeechTokenBroker(environment, request, () => now);
  const first = await broker("visitor");
  now += 60_000;
  assert.equal((await broker("visitor")).token, first.token);
  assert.equal(calls, 1);
  now = first.expiresAt - 119_000;
  const refreshed = await broker("visitor");
  assert.notEqual(refreshed.token, first.token);
  assert.ok(refreshed.expiresAt > first.expiresAt);
  assert.equal(calls, 2);
});

test("speech rejects failed and malformed authorization without leaking provider response bodies", async () => {
  const cases = [new Response("private-provider-error", { status: 403 }), new Response(""),
    new Response("token with whitespace"), new Response("x".repeat(16_385))];
  for (const response of cases) {
    const broker = createSpeechTokenBroker(environment, async () => response);
    await assert.rejects(broker("visitor"), error => {
      assert.equal((error as { status: number }).status, 503);
      assert.ok(!(error as Error).message.includes("private-provider-error"));
      assert.ok(!(error as Error).message.includes(environment.AZURE_SPEECH_KEY));
      return true;
    });
  }
});

test("speech provider failure releases its in-flight slot so a later retry can recover", async () => {
  let calls = 0;
  const request: typeof fetch = async () => {
    calls++;
    if (calls === 1) return new Response("unavailable", { status: 503 });
    return new Response("recovered-temporary-token");
  };
  const broker = createSpeechTokenBroker(environment, request);
  await assert.rejects(broker("visitor"), { status: 503 });
  assert.equal((await broker("visitor")).token, "recovered-temporary-token");
  assert.equal(calls, 2);
});

test("speech reconnect limits apply per visitor and recover after their interval", async () => {
  let now = 1_000, calls = 0;
  const broker = createSpeechTokenBroker(environment, async () => { calls++; return new Response(`temporary-${calls}`); }, () => now);
  for (let index = 0; index < 8; index++) await broker("visitor-a");
  await assert.rejects(broker("visitor-a"), { status: 429 });
  assert.equal(calls, 1, "Cached requests must still be rate limited without repeated provider costs");
  await broker("visitor-b");
  now += 600_001;
  assert.ok((await broker("visitor-a")).token);
  assert.equal(calls, 2);
});

test("speech global admission limit cannot be bypassed by cycling visitor identities", async () => {
  let calls = 0;
  const broker = createSpeechTokenBroker(environment, async () => { calls++; return new Response("temporary-token"); }, () => 1_000);
  for (let index = 0; index < 120; index++) await broker(`visitor-${index}`);
  await assert.rejects(broker("another-visitor"), { status: 429 });
  assert.equal(calls, 1);
});

test("speech configuration normalizes nonsecret deployment values and rejects blank keys", () => {
  assert.deepEqual(speechConfiguration({ ...environment, SYNTRA_VOICE_PROVIDER: " Azure ", AZURE_SPEECH_REGION: " UKSouth " }),
    { enabled: true, provider: "azure", region: "uksouth" });
  assert.deepEqual(speechConfiguration({ ...environment, AZURE_SPEECH_KEY: "  " }),
    { enabled: false, provider: "none", region: null });
});

test("resource changes isolate pending and cached tokens without mixing regions or keys", async () => {
  const env = { ...environment };
  const old = deferred<Response>();
  let calls = 0;
  const broker = createSpeechTokenBroker(env, async (_url, init) => {
    calls++;
    const key = new Headers(init?.headers).get("Ocp-Apim-Subscription-Key");
    return key === environment.AZURE_SPEECH_KEY ? old.promise : new Response(`new-resource-${calls}`);
  });
  const original = broker("visitor-a");
  env.AZURE_SPEECH_REGION = "eastus";
  env.AZURE_SPEECH_KEY = "REPLACEMENT-FIXTURE-KEY";
  const repaired = await broker("visitor-b");
  assert.equal(repaired.region, "eastus");
  assert.equal(repaired.token, "new-resource-2");
  old.resolve(new Response("old-resource-token"));
  const prior = await original;
  assert.equal(prior.region, "uksouth");
  assert.equal(prior.token, "old-resource-token");
  assert.deepEqual(await broker("visitor-c"), repaired, "Late old authorization cannot replace the repaired resource cache");
  env.AZURE_SPEECH_KEY = "SECOND-REPLACEMENT-FIXTURE";
  assert.equal((await broker("visitor-d")).token, "new-resource-3", "Changing a key in the same region invalidates authorization too");
  assert.equal(calls, 3);
});

test("network and credential-body failures stay private and release authorization for retry", async () => {
  let calls = 0;
  const broker = createSpeechTokenBroker(environment, async () => {
    if (++calls === 1) throw new Error("private-proxy-url-and-credential");
    if (calls === 2) return new Response(new ReadableStream({ start(controller) {
      controller.error(new Error("private-body-failure"));
    } }));
    return new Response("recovered-token");
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(broker("visitor"), error => {
      assert.equal((error as { status: number }).status, 503);
      assert.equal((error as Error).message.includes("private"), false);
      return true;
    });
  }
  assert.equal((await broker("visitor")).token, "recovered-token");
});
