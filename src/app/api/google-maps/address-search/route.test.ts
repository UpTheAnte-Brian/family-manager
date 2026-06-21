import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET } from "./route";

describe("address search route", () => {
  it("rejects requests without a bearer token", async () => {
    const response = await GET(new Request("http://localhost/api/google-maps/address-search?q=test"));
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error, "Sign in before using this endpoint.");
  });
});
