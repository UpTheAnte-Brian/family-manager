import type { LocalResponsibilityItem, ResponsibilityCategory } from "@/lib/today/types";

type ParentResponsibilityInput = {
  id: string;
  title: string;
  assigneeIds: string[];
  category: ResponsibilityCategory;
  startTime?: string;
  endTime?: string;
};

const importedAt = "2026-05-01T15:00:00.000-05:00";
const fridayMeetingWindow = {
  daysOfWeek: ["FR" as const],
  startTime: "15:00",
  endTime: "16:00",
};

const weeklyMeetingItems: ParentResponsibilityInput[] = [
  {
    id: "weekly-parent-meeting",
    title: "Weekly parent meeting",
    assigneeIds: ["brian", "angela"],
    category: "family-planning",
  },
  {
    id: "mason-birthday-thaler-check",
    title: "Write check for Mason's birthday party at Thaler ($221.14)",
    assigneeIds: ["brian", "angela"],
    category: "finance",
  },
  {
    id: "career-coach-networking",
    title: "Career coach: ask for interview help and mock interviews",
    assigneeIds: ["brian"],
    category: "work",
  },
  {
    id: "ai-tech-certifications",
    title: "Research certifications for AI or tech",
    assigneeIds: ["brian"],
    category: "work",
  },
  {
    id: "reach-out-john-ahou",
    title: "Reach out to John from AHOU",
    assigneeIds: ["brian"],
    category: "work",
  },
  {
    id: "fix-sprinklers",
    title: "Fix sprinklers",
    assigneeIds: ["brian"],
    category: "home-maintenance",
  },
  {
    id: "stoop-second-coat",
    title: "Put one more coat on stoop",
    assigneeIds: ["brian"],
    category: "home-maintenance",
  },
  {
    id: "pack-for-stage",
    title: "Pack for stage",
    assigneeIds: ["brian"],
    category: "chores",
  },
  {
    id: "fertilize-gardens",
    title: "Fertilize gardens",
    assigneeIds: ["brian"],
    category: "home-maintenance",
  },
  {
    id: "power-washing",
    title: "Power washing",
    assigneeIds: ["brian"],
    category: "home-maintenance",
  },
  {
    id: "screen-cleaning",
    title: "Screen cleaning",
    assigneeIds: ["brian"],
    category: "home-maintenance",
  },
  {
    id: "window-washing",
    title: "Window washing",
    assigneeIds: ["brian"],
    category: "home-maintenance",
  },
  {
    id: "fix-road-garden",
    title: "Fix the garden by the road",
    assigneeIds: ["brian"],
    category: "home-maintenance",
  },
  {
    id: "create-parenting-plan",
    title: "Create a parenting plan",
    assigneeIds: ["brian"],
    category: "family-planning",
  },
  {
    id: "budget-after-taxes",
    title: "Budget after we've submitted taxes",
    assigneeIds: ["brian"],
    category: "finance",
  },
  {
    id: "church-business-autopay",
    title: "Set up auto-pay for the church from the business",
    assigneeIds: ["brian"],
    category: "finance",
  },
  {
    id: "brett-fire-hazards",
    title: "Brett fire hazards",
    assigneeIds: ["brian"],
    category: "home-maintenance",
  },
  {
    id: "cancel-southwest-membership-fee",
    title: "Call to cancel Southwest and get membership fee back",
    assigneeIds: ["brian"],
    category: "finance",
  },
  {
    id: "mason-fall-soccer-signup",
    title: "Sign Mason up for fall soccer",
    assigneeIds: ["brian"],
    category: "sports",
  },
  {
    id: "kenz-fall-soccer-signup",
    title: "Sign Kenz up for fall soccer",
    assigneeIds: ["brian"],
    category: "sports",
  },
  {
    id: "networking-leads-goal",
    title: "Goal: talk to more people, network, and find leads",
    assigneeIds: ["brian"],
    category: "work",
  },
  {
    id: "finish-a-task-goal",
    title: "Goal: finish a task",
    assigneeIds: ["brian"],
    category: "personal",
  },
  {
    id: "keep-up-with-house-goal",
    title: "Goal: keep up with house",
    assigneeIds: ["brian"],
    category: "home-maintenance",
  },
  {
    id: "plan-stage",
    title: "Plan stage",
    assigneeIds: ["angela"],
    category: "chores",
  },
  {
    id: "angela-resume",
    title: "Resume",
    assigneeIds: ["angela"],
    category: "work",
  },
  {
    id: "angela-apply-for-job",
    title: "Apply for job",
    assigneeIds: ["angela"],
    category: "work",
  },
  {
    id: "kenz-games",
    title: "Look up games to play for Kenz",
    assigneeIds: ["angela"],
    category: "family-planning",
  },
  {
    id: "mason-games",
    title: "Look up games to play for Mason",
    assigneeIds: ["angela"],
    category: "family-planning",
  },
  {
    id: "kenz-party-pizza",
    title: "Order pizza for Kenz party",
    assigneeIds: ["angela"],
    category: "family-planning",
  },
  {
    id: "clean-house",
    title: "Clean house",
    assigneeIds: ["angela", "brian"],
    category: "chores",
  },
  {
    id: "stage",
    title: "Stage",
    assigneeIds: ["angela", "brian"],
    category: "chores",
  },
  {
    id: "plant-grass",
    title: "Plant grass",
    assigneeIds: ["angela", "brian"],
    category: "home-maintenance",
  },
  {
    id: "weeding",
    title: "Weeding",
    assigneeIds: ["angela", "brian"],
    category: "home-maintenance",
  },
  {
    id: "finish-side-house-weeding",
    title: "Finish weeding side of house",
    assigneeIds: ["angela", "brian"],
    category: "home-maintenance",
  },
  {
    id: "amazon-returns",
    title: "Amazon returns",
    assigneeIds: ["angela", "brian"],
    category: "chores",
  },
  {
    id: "refrigerator-section-protein-bar",
    title: "Refrigerator section protein bar",
    assigneeIds: ["angela", "brian"],
    category: "personal",
  },
  {
    id: "built-puff-protein-bars",
    title: "Built Puff protein bars: chocolate and chocolate",
    assigneeIds: ["angela", "brian"],
    category: "personal",
  },
];

export const parentResponsibilities: LocalResponsibilityItem[] = weeklyMeetingItems.flatMap((item) =>
  item.assigneeIds.map((assigneeId) => ({
    id: `${item.id}-${assigneeId}`,
    title: item.title,
    category: item.category,
    assigneeId,
    ...fridayMeetingWindow,
    startTime: item.startTime ?? fridayMeetingWindow.startTime,
    endTime: item.endTime ?? fridayMeetingWindow.endTime,
    createdAt: importedAt,
  })),
);
