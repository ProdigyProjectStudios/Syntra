import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { withPostgresQueryDeadline } from "../src/lib/postgres-query-deadline.ts";
import { createPostgresConversationAdmissionGate } from "../src/lib/postgres-admission.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

class Client extends EventEmitter {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: boolean[] = [];
  acquired = new Set<string>();
  failCommit = false;
  blockLock?: Promise<void>;
  readonly locks: Set<string>;
  constructor(locks: Set<string>) { super(); this.locks = locks; }
  async query(text: string, values: unknown[]) {
    this.calls.push({ text, values });
    const key = String(values[0]);
    if (text.includes("pg_try_advisory_xact_lock")) {
      await this.blockLock;
      if (this.locks.has(key)) return { rows: [{ acquired: false }] };
      this.locks.add(key); this.acquired.add(key);
      return { rows: [{ acquired: true }] };
    }
    if (text === "COMMIT" || text === "ROLLBACK") {
      if (text === "COMMIT" && this.failCommit) throw new Error("Private connection detail");
      for (const held of this.acquired) this.locks.delete(held);
      this.acquired.clear();
    }
    return { rows: [] };
  }
  release(destroy = false) {
    this.releases.push(destroy);
    if (destroy) for (const key of this.acquired) this.locks.delete(key);
  }
}
async function transaction<T>(client: Client, work: (client: Client) => Promise<T>): Promise<T> {
  await client.query("BEGIN", []);
  try {
    const value = await work(client);
    await client.query("COMMIT", []);
    return value;
  } catch (error) {
    await client.query("ROLLBACK", []);
    throw error;
  }
}
function fixture() {
  const locks = new Set<string>();
  const clients: Client[] = [];
  const pool = { async connect() { const client = new Client(locks); clients.push(client); return client; } };
  return { locks, clients, pool };
}

test("separate autoscaled gates exclude a duplicate model call and release for receipt replay", async () => {
  const f = fixture();
  const workerA = createPostgresConversationAdmissionGate(f.pool, transaction);
  const workerB = createPostgresConversationAdmissionGate(f.pool, transaction);
  const model = deferred<string>();
  let modelCalls = 0;
  const first = workerA.run("private-owner:17", async client => {
    modelCalls++;
    assert.equal(client, f.clients[0], "Repository work uses the exact lock-owning client");
    return model.promise;
  });
  await settle();
  await assert.rejects(workerB.run("private-owner:17", async () => { modelCalls++; return "duplicate"; }), { status: 409 });
  assert.equal(modelCalls, 1);
  assert.deepEqual(f.clients[1].releases, [true]);
  model.resolve("saved reply");
  assert.equal(await first, "saved reply");
  assert.equal(await workerB.run("private-owner:17", async () => "saved receipt"), "saved receipt");
  assert.equal(f.locks.size, 0);
  assert.equal(modelCalls, 1);
  for (const client of f.clients) {
    assert.equal(client.listenerCount("error"), 0);
    assert.equal(client.releases.length, 1);
    for (const call of client.calls) {
      if (call.values.length) assert.match(String(call.values[0]), /^-?\d+$/);
      assert.equal(JSON.stringify(call).includes("private-owner"), false);
    }
  }
});

test("advisory gates allow independent consultations and owners concurrently", async () => {
  const f = fixture();
  const gate = createPostgresConversationAdmissionGate(f.pool, transaction);
  const pending = deferred<void>();
  const a = gate.run("owner-a:1", () => pending.promise);
  await settle();
  assert.equal(await gate.run("owner-a:2", async () => "second"), "second");
  assert.equal(await gate.run("owner-b:1", async () => "other owner"), "other owner");
  await assert.rejects(gate.run("owner-a:1", async () => "duplicate"), { status: 409 });
  pending.resolve(); await a;
  assert.equal(f.locks.size, 0);
});

test("model failure rolls back and destroys the released transaction before the next request", async () => {
  const f = fixture();
  const gate = createPostgresConversationAdmissionGate(f.pool, transaction);
  await assert.rejects(gate.run("owner:1", async () => { throw new Error("model failed"); }), /model failed/);
  assert.equal(f.locks.size, 0);
  assert.deepEqual(f.clients[0].releases, [true]);
  assert.equal(await gate.run("owner:1", async () => "retry"), "retry");
  assert.ok(f.clients[0].calls.some(call => call.text === "ROLLBACK"));
});

test("uncertain commit destroys its pooled transaction and never reports a saved reply", async () => {
  const f = fixture();
  const gate = createPostgresConversationAdmissionGate(f.pool, transaction);
  await assert.rejects(gate.run("owner:1", async client => { client.failCommit = true; return "unconfirmed"; }));
  assert.deepEqual(f.clients[0].releases, [true]);
  assert.equal(f.clients[0].listenerCount("error"), 0);
  assert.equal(f.locks.size, 0);
});

test("connection loss cannot report an unconfirmed result as success or return its session to the pool", async () => {
  const f = fixture();
  const gate = createPostgresConversationAdmissionGate(f.pool, transaction);
  await assert.rejects(gate.run("owner:1", async client => {
    client.emit("error", new Error("Private database details"));
    return "unconfirmed";
  }), { status: 503, message: "The consultation connection could not be confirmed. Retry your original request." });
  assert.deepEqual(f.clients[0].releases, [true]);
  assert.equal(f.clients[0].calls.some(call => call.text === "COMMIT"), false);
  assert.equal(f.clients[0].listenerCount("error"), 0);
});

test("timed out pool acquisition destroys a late client without starting model work", async () => {
  const connection = deferred<Client>();
  const gate = createPostgresConversationAdmissionGate({ connect: () => connection.promise }, transaction, 10);
  let called = false;
  await assert.rejects(gate.run("owner:1", async () => { called = true; }), { status: 503 });
  const client = new Client(new Set());
  connection.resolve(client); await settle();
  assert.equal(called, false);
  assert.deepEqual(client.releases, [true]);
});

test("timed out lock query destroys the session and does not invoke the model", async () => {
  const blocked = deferred<void>();
  const client = new Client(new Set());
  client.blockLock = blocked.promise;
  const gate = createPostgresConversationAdmissionGate({ connect: async () => client }, transaction, 10);
  let called = false;
  await assert.rejects(gate.run("owner:1", async () => { called = true; }), { status: 503 });
  assert.equal(called, false);
  assert.deepEqual(client.releases, [true]);
  assert.equal(client.listenerCount("error"), 0);
  blocked.reject(new Error("Closed connection")); await settle();
});


test("transaction query deadlines include BEGIN and COMMIT without mutating a pooled client", async () => {
  const calls: unknown[][] = [];
  const client = {
    setting: "original",
    async query(...args: unknown[]) { assert.equal(this, client); calls.push(args); return { rows: [] }; },
  };
  const scoped = withPostgresQueryDeadline(client, 1234);
  await scoped.query("BEGIN", []);
  const config = { text: "COMMIT", rowMode: "array", query_timeout: 0 };
  await scoped.query(config, ["bound"]);
  assert.deepEqual(calls, [[{ text: "BEGIN", query_timeout: 1234 }, []],
    [{ text: "COMMIT", rowMode: "array", query_timeout: 1234 }, ["bound"]]]);
  assert.equal(config.query_timeout, 0, "Caller query objects remain unchanged");
  assert.equal(client.setting, "original");
  await client.query("outside", []);
  assert.deepEqual(calls.at(-1), ["outside", []], "Pool checkout is not permanently modified");
});
