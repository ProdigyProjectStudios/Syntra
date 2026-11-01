import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { visitorSession } from "./visitor-session";

function run(cookie?: string) {
  let issued: { name: string; token: string; options: Record<string, unknown> } | undefined;
  const req = { cookies: cookie ? { "syntra.sid": cookie } : {} } as Request;
  const res = {
    locals: {},
    cookie(name: string, token: string, options: Record<string, unknown>) {
      issued = { name, token, options };
    },
  } as unknown as Response;
  let nextCalled = false;
  visitorSession(req, res, (() => { nextCalled = true; }) as NextFunction);
  return { issued, hash: res.locals.visitorSessionHash as string, nextCalled };
}

test("visitor session is private, stable within a browser, and different across browsers", () => {
  const first = run();
  assert.equal(first.nextCalled, true);
  assert.equal(first.issued?.name, "syntra.sid");
  assert.equal(first.issued?.options.httpOnly, true);
  assert.equal(first.issued?.options.sameSite, "lax");
  assert.equal(first.issued?.options.path, "/api");
  assert.match(first.hash, /^[a-f0-9]{64}$/);

  const sameBrowser = run(first.issued!.token);
  assert.equal(sameBrowser.hash, first.hash);
  assert.equal(sameBrowser.issued, undefined);

  const otherBrowser = run();
  assert.notEqual(otherBrowser.hash, first.hash);
  assert.notEqual(otherBrowser.issued!.token, first.issued!.token);
});

test("malformed session tokens are replaced", () => {
  const result = run("guessable-token");
  assert.ok(result.issued?.token);
  assert.notEqual(result.issued?.token, "guessable-token");
});
