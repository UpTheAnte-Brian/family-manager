import fs from "node:fs";
import path from "node:path";
import { applySummerWorkdayPlan, summerWorkdayPlanSourceId } from "../src/lib/planner/summer-workday-plan";
import type { PlannerData } from "../src/lib/planner/types";

const plannerPath = path.resolve("data/summer-2026-planner.json");
const planner = JSON.parse(fs.readFileSync(plannerPath, "utf8")) as PlannerData;
const updatedPlanner = applySummerWorkdayPlan(planner);
const plannedEventCount = updatedPlanner.fixedEvents.filter(
  (event) => event.source === summerWorkdayPlanSourceId,
).length;

fs.writeFileSync(plannerPath, `${JSON.stringify(updatedPlanner, null, 2)}\n`);

console.log(`Generated ${plannedEventCount} summer workday plan events`);
console.log(`Source: ${summerWorkdayPlanSourceId}`);
console.log(`Updated ${plannerPath}`);
