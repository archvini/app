import test from "node:test";
import assert from "node:assert/strict";
import { checkRegister, checkObstacle } from "./validate.js";

test("cadastro", () => {
  assert.equal(checkRegister({ name: "Ana", email: "a@b.com", password: "12345678" }), null);
  assert.ok(checkRegister({ name: "Ana", email: "a@b.com", password: "123" }));
  assert.ok(checkRegister({ name: "A", email: "ruim", password: "12345678" }));
});

test("obstáculo", () => {
  assert.equal(checkObstacle({ type: "buraco", lat: -3.7, lng: -38.5 }), null);
  assert.ok(checkObstacle({ type: "x", lat: -3.7, lng: -38.5 }));
  assert.ok(checkObstacle({ type: "buraco", lat: NaN, lng: 1 }));
});
