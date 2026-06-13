import { getChoreAllowanceAmount, toAllowanceCents } from "@/lib/allowance/storage";
import type { WeeklyChore, WeeklyChoreAssignmentTemplate } from "@/lib/planner/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export async function createRemoteChoreCompletion({
  assignment,
  chore,
  earnsAllowance = true,
  householdId,
  occurrenceDate,
  remoteMemberId,
}: {
  assignment: WeeklyChoreAssignmentTemplate;
  chore?: WeeklyChore;
  earnsAllowance?: boolean;
  householdId: string;
  occurrenceDate: string;
  remoteMemberId: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const completedAt = `${occurrenceDate}T${assignment.endTime}:00`;
  const { data, error } = await supabase
    .from("chore_completions")
    .insert({
      household_id: householdId,
      chore_id: assignment.choreId,
      assignment_template_id: assignment.id,
      occurrence_date: occurrenceDate,
      completed_by_member_id: remoteMemberId,
      completed_at: completedAt,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw error;
  }

  const allowanceAmount = getChoreAllowanceAmount(chore);

  if (earnsAllowance && allowanceAmount) {
    const { error: allowanceError } = await supabase.from("allowance_entries").insert({
      household_id: householdId,
      household_member_id: remoteMemberId,
      chore_completion_id: data.id,
      chore_id: assignment.choreId,
      entry_type: "chore_completion",
      amount_cents: toAllowanceCents(allowanceAmount),
      occurred_at: completedAt,
      metadata: {
        assignmentTemplateId: assignment.id,
        choreTitle: chore?.title ?? null,
      },
    });

    if (allowanceError) {
      await supabase.from("chore_completions").delete().eq("household_id", householdId).eq("id", data.id);
      throw allowanceError;
    }
  }

  return {
    completedAt,
    id: data.id,
  };
}

export async function deleteRemoteChoreCompletion(householdId: string, completionId: string) {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase
    .from("chore_completions")
    .delete()
    .eq("household_id", householdId)
    .eq("id", completionId);

  if (error) {
    throw error;
  }
}
