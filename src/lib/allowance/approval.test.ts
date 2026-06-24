import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canApproveAllowanceRequests } from "@/lib/allowance/approval";

describe("allowance approval access", () => {
  it("allows approval for a household admin regardless of the selected profile", () => {
    assert.equal(
      canApproveAllowanceRequests({
        householdRole: "parent",
        selectedMemberRole: "parent",
      }),
      true,
    );
    assert.equal(
      canApproveAllowanceRequests({
        householdRole: "owner",
        selectedMemberRole: "parent",
      }),
      true,
    );
    assert.equal(
      canApproveAllowanceRequests({
        householdRole: "parent",
        selectedMemberRole: "child",
      }),
      true,
    );
    assert.equal(
      canApproveAllowanceRequests({
        householdRole: "child",
        selectedMemberRole: "parent",
      }),
      false,
    );
  });
});
