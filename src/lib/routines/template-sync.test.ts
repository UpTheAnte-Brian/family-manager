import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planRoutineTemplateSync } from "@/lib/routines/template-sync";

describe("planRoutineTemplateSync", () => {
  it("preserves matching member-step pairs and only updates changed fields", () => {
    assert.deepEqual(
      planRoutineTemplateSync({
        daysOfWeek: ["MO", "TU"],
        existing: [
          {
            actionItemId: "action-1",
            daysOfWeek: ["MO", "TU"],
            endTime: "07:35",
            memberId: "member-1",
            startTime: "07:30",
            stepId: "brush-teeth",
            templateName: "Morning",
            title: "Brush teeth",
          },
          {
            actionItemId: "action-2",
            daysOfWeek: ["MO", "TU"],
            endTime: "07:40",
            memberId: "member-1",
            startTime: "07:35",
            stepId: "make-bed",
            templateName: "Morning",
            title: "Make bed",
          },
        ],
        memberIds: ["member-1"],
        steps: [
          {
            endTime: "07:35",
            id: "brush-teeth",
            startTime: "07:30",
            title: "Brush teeth",
          },
          {
            endTime: "07:42",
            id: "make-bed",
            startTime: "07:36",
            title: "Make bed neatly",
          },
        ],
        templateName: "Morning",
      }),
      {
        create: [],
        removeActionItemIds: [],
        update: [
          {
            actionItemId: "action-2",
            daysOfWeek: ["MO", "TU"],
            endTime: "07:42",
            memberId: "member-1",
            startTime: "07:36",
            stepId: "make-bed",
            templateName: "Morning",
            title: "Make bed neatly",
          },
        ],
      },
    );
  });

  it("creates new pairs and removes obsolete ones without touching retained ids", () => {
    assert.deepEqual(
      planRoutineTemplateSync({
        daysOfWeek: ["MO", "WE"],
        existing: [
          {
            actionItemId: "action-1",
            daysOfWeek: ["MO", "TU"],
            endTime: "07:35",
            memberId: "member-1",
            startTime: "07:30",
            stepId: "brush-teeth",
            templateName: "Morning",
            title: "Brush teeth",
          },
          {
            actionItemId: "action-2",
            daysOfWeek: ["MO", "TU"],
            endTime: "07:40",
            memberId: "member-2",
            startTime: "07:35",
            stepId: "make-bed",
            templateName: "Morning",
            title: "Make bed",
          },
        ],
        memberIds: ["member-1", "member-2"],
        steps: [
          {
            endTime: "07:35",
            id: "brush-teeth",
            startTime: "07:30",
            title: "Brush teeth",
          },
        ],
        templateName: "Summer Morning",
      }),
      {
        create: [
          {
            daysOfWeek: ["MO", "WE"],
            endTime: "07:35",
            memberId: "member-2",
            startTime: "07:30",
            stepId: "brush-teeth",
            templateName: "Summer Morning",
            title: "Brush teeth",
          },
        ],
        removeActionItemIds: ["action-2"],
        update: [
          {
            actionItemId: "action-1",
            daysOfWeek: ["MO", "WE"],
            endTime: "07:35",
            memberId: "member-1",
            startTime: "07:30",
            stepId: "brush-teeth",
            templateName: "Summer Morning",
            title: "Brush teeth",
          },
        ],
      },
    );
  });
});
