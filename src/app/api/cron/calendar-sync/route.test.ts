import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET } from "./route";

describe("calendar sync cron route", () => {
  it("rejects unauthorized requests", async () => {
    const response = await GET(new Request("http://localhost/api/cron/calendar-sync"));
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error, "Unauthorized cron request.");
  });
});
