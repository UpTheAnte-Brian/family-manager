import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAllowanceRequestKindLabel,
  getSignedAllowanceRequestAmount,
} from "@/lib/allowance/request-kind";

describe("allowance request kind helpers", () => {
  it("signs debit requests as negative amounts", () => {
    assert.equal(getSignedAllowanceRequestAmount(3.5, "credit"), 3.5);
    assert.equal(getSignedAllowanceRequestAmount(3.5, "debit"), -3.5);
  });

  it("returns readable request kind labels", () => {
    assert.equal(getAllowanceRequestKindLabel("credit"), "Credit");
    assert.equal(getAllowanceRequestKindLabel("debit"), "Debit");
  });
});
