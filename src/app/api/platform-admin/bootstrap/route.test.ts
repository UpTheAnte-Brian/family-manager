import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST, persistPlatformAdminAccess } from "./route";

describe("platform admin bootstrap route", () => {
  it("rejects requests without a bearer token", async () => {
    const response = await POST(new Request("http://localhost/api/platform-admin/bootstrap", { method: "POST" }));
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error, "Sign in before using this endpoint.");
  });

  it("reassigns a bootstrapped email to the current auth user", async () => {
    const calls: string[] = [];

    await persistPlatformAdminAccess(
      {
        async findByEmail(email) {
          calls.push(`find:${email}`);
          return {
            auth_user_id: "stale-user-id",
            email,
          };
        },
        async replaceUserForEmail(email, authenticatedUser) {
          calls.push(`replace:${email}:${authenticatedUser.id}`);
        },
        async saveForUser() {
          calls.push("save");
        },
      },
      {
        accessToken: "token",
        email: "bwjohnson1@gmail.com",
        id: "current-user-id",
      },
    );

    assert.deepEqual(calls, [
      "find:bwjohnson1@gmail.com",
      "replace:bwjohnson1@gmail.com:current-user-id",
    ]);
  });

  it("upserts when the email is not already bootstrapped", async () => {
    const calls: string[] = [];

    await persistPlatformAdminAccess(
      {
        async findByEmail(email) {
          calls.push(`find:${email}`);
          return null;
        },
        async replaceUserForEmail() {
          calls.push("replace");
        },
        async saveForUser(authenticatedUser) {
          calls.push(`save:${authenticatedUser.id}`);
        },
      },
      {
        accessToken: "token",
        email: "bwjohnson1@gmail.com",
        id: "current-user-id",
      },
    );

    assert.deepEqual(calls, [
      "find:bwjohnson1@gmail.com",
      "save:current-user-id",
    ]);
  });
});
