import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canApproveAllowanceRequests } from "@/lib/allowance/approval";

describe("allowance approval access", () => {
  it("allows approval only in parent view for a household admin", () => {
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
      false,
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
