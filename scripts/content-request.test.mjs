import assert from "node:assert/strict";
import test from "node:test";

const { createEncryptedPayloadRequest } = await import("../src/lib/contentRequest.ts").catch(() => ({
  createEncryptedPayloadRequest: null,
}));

test("requests the encrypted snapshot without reusing a stale browser cache", () => {
  assert.equal(typeof createEncryptedPayloadRequest, "function", "content request helper is not implemented");

  const request = createEncryptedPayloadRequest("https://example.com/dashboard/");

  assert.equal(request.url, "https://example.com/dashboard/data.enc");
  assert.equal(request.cache, "no-store");
});
