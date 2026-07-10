import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSupabaseLikeErrorMessage } from "@/lib/supabase/error-message";

describe("getSupabaseLikeErrorMessage", () => {
  it("reads PostgREST-style message fields from plain objects", () => {
    assert.equal(
      getSupabaseLikeErrorMessage(
        {
          details: "fallback details",
          message: "column reference \"household_member_id\" is ambiguous",
        },
        "Fallback error",
      ),
      'column reference "household_member_id" is ambiguous',
    );
  });

  it("falls back when no usable message is present", () => {
    assert.equal(getSupabaseLikeErrorMessage({ message: "" }, "Fallback error"), "Fallback error");
  });
});
