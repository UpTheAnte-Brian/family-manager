import assert from "node:assert/strict";
import test from "node:test";
import { formatClockTime, formatTimeRange } from "@/lib/time/format";

test("formats clock times with AM and PM", () => {
  assert.equal(formatClockTime("00:05"), "12:05 AM");
  assert.equal(formatClockTime("12:00"), "12:00 PM");
  assert.equal(formatClockTime("16:20"), "4:20 PM");
});

test("formats time ranges without military time", () => {
  assert.equal(formatTimeRange("16:00", "16:20"), "4:00 PM–4:20 PM");
  assert.equal(formatTimeRange("00:00", "23:59"), "All day");
});
