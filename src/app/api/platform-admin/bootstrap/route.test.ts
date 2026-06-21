import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST } from "./route";

describe("platform admin bootstrap route", () => {
  it("rejects requests without a bearer token", async () => {
    const response = await POST(new Request("http://localhost/api/platform-admin/bootstrap", { method: "POST" }));
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error, "Sign in before using this endpoint.");
  });
});
