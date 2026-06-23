import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planRoutineTemplateSync } from "@/lib/routines/template-sync";

describe("planRoutineTemplateSync", () => {
  it("preserves matching member-step pairs and only updates changed fields", () => {
    assert.deepEqual(
      planRoutineTemplateSync({
        category: "morning-routine",
        daysOfWeek: ["MO", "TU"],
        existing: [
          {
            actionItemId: "action-1",
            category: "morning-routine",
            daysOfWeek: ["MO", "TU"],
            durationMinutes: 5,
            memberId: "member-1",
            offsetMinutes: 0,
            orderIndex: 0,
            stepId: "brush-teeth",
            templateName: "Morning",
            title: "Brush teeth",
          },
          {
            actionItemId: "action-2",
            category: "morning-routine",
            daysOfWeek: ["MO", "TU"],
            durationMinutes: 5,
            memberId: "member-1",
            offsetMinutes: 5,
            orderIndex: 1,
            stepId: "make-bed",
            templateName: "Morning",
            title: "Make bed",
          },
        ],
        memberIds: ["member-1"],
        steps: [
          {
            durationMinutes: 5,
            id: "brush-teeth",
            title: "Brush teeth",
          },
          {
            durationMinutes: 6,
            id: "make-bed",
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
            category: "morning-routine",
            daysOfWeek: ["MO", "TU"],
            durationMinutes: 6,
            memberId: "member-1",
            offsetMinutes: 5,
            orderIndex: 1,
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
        category: "night-routine",
        daysOfWeek: ["MO", "WE"],
        existing: [
          {
            actionItemId: "action-1",
            category: "morning-routine",
            daysOfWeek: ["MO", "TU"],
            durationMinutes: 5,
            memberId: "member-1",
            offsetMinutes: 0,
            orderIndex: 0,
            stepId: "brush-teeth",
            templateName: "Morning",
            title: "Brush teeth",
          },
          {
            actionItemId: "action-2",
            category: "morning-routine",
            daysOfWeek: ["MO", "TU"],
            durationMinutes: 5,
            memberId: "member-2",
            offsetMinutes: 5,
            orderIndex: 0,
            stepId: "make-bed",
            templateName: "Morning",
            title: "Make bed",
          },
        ],
        memberIds: ["member-1", "member-2"],
        steps: [
          {
            durationMinutes: 5,
            id: "brush-teeth",
            title: "Brush teeth",
          },
        ],
        templateName: "Summer Morning",
      }),
      {
        create: [
          {
            category: "night-routine",
            daysOfWeek: ["MO", "WE"],
            durationMinutes: 5,
            memberId: "member-2",
            offsetMinutes: 0,
            orderIndex: 0,
            stepId: "brush-teeth",
            templateName: "Summer Morning",
            title: "Brush teeth",
          },
        ],
        removeActionItemIds: ["action-2"],
        update: [
          {
            actionItemId: "action-1",
            category: "night-routine",
            daysOfWeek: ["MO", "WE"],
            durationMinutes: 5,
            memberId: "member-1",
            offsetMinutes: 0,
            orderIndex: 0,
            stepId: "brush-teeth",
            templateName: "Summer Morning",
            title: "Brush teeth",
          },
        ],
      },
    );
  });
});
