import assert from "node:assert/strict";
import { test } from "node:test";
import { createConversationAdmissionGate } from "../src/lib/conversation-admission.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test("conversation admission excludes concurrent requests before receipt lookup and throughout model work", async () => {
  const admission = createConversationAdmissionGate();
  const lookup = deferred<string | null>(), model = deferred<string>();
  let receiptCalls = 0, modelCalls = 0;
  const request = () => admission.run("owner-a:1", async () => {
    receiptCalls++;
    const receipt = await lookup.promise;
    if (receipt) return receipt;
    modelCalls++;
    return model.promise;
  });
  const first = request();
  await assert.rejects(request(), { status: 409 });
  assert.equal(receiptCalls, 1, "A second request must be rejected before even its first asynchronous lookup");
  assert.equal(modelCalls, 0);
  lookup.resolve(null); await settle();
  assert.equal(modelCalls, 1);
  await assert.rejects(request(), { status: 409 });
  assert.equal(receiptCalls, 1);
  model.resolve("saved-reply");
  assert.equal(await first, "saved-reply");
  assert.equal(await admission.run("owner-a:1", async () => "saved-receipt"), "saved-receipt");
  assert.equal(modelCalls, 1);
});

test("conversation admission releases after receipt return, immediate failure and asynchronous failure", async () => {
  const admission = createConversationAdmissionGate();
  const paths: Array<() => Promise<string>> = [
    async () => "existing-receipt",
    () => { throw new Error("Validation or rate limit failed"); },
    async () => { await settle(); throw new Error("Receipt store or provider failed"); },
  ];
  for (const [index, work] of paths.entries()) {
    const result = admission.run("owner-a:1", work);
    if (index === 0) assert.equal(await result, "existing-receipt");
    else await assert.rejects(result, /failed/);
    assert.equal(await admission.run("owner-a:1", async () => "next-request"), "next-request",
      "Every terminal path must permit the next request");
  }
});

test("conversation admission keeps unrelated owners and consultations independent", async () => {
  const admission = createConversationAdmissionGate();
  const pending = deferred<void>();
  const first = admission.run("owner-a:1", () => pending.promise);
  assert.equal(await admission.run("owner-a:2", async () => "another-project"), "another-project");
  assert.equal(await admission.run("owner-b:1", async () => "another-owner"), "another-owner");
  await assert.rejects(admission.run("owner-a:1", async () => "duplicate"), { status: 409 });
  pending.resolve(); await first;
});
