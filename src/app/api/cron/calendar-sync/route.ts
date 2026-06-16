import {
  isScheduledCalendarSourceDue,
  syncScheduledCalendarSource,
  type ScheduledCalendarSourceRow,
} from "@/lib/calendar/scheduled-sync";
import { createServerSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json(
      {
        error: "Unauthorized cron request.",
      },
      { status: 401 },
    );
  }

  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase
    .from("calendar_sources")
    .select(
      "id, household_id, external_key, label, url, enabled, sync_mode, last_synced_at, last_applied_at, last_sync_status, last_sync_message, metadata, households(timezone)",
    )
    .eq("enabled", true)
    .eq("sync_mode", "scheduled")
    .returns<ScheduledCalendarSourceRow[]>();

  if (error) {
    return Response.json(
      {
        error: error.message,
      },
      { status: 500 },
    );
  }

  const dueSources = (data ?? []).filter((source) => isScheduledCalendarSourceDue(source));
  const results = [];

  for (const source of dueSources) {
    results.push(await syncScheduledCalendarSource(supabase, source));
  }

  return Response.json({
    checkedSources: data?.length ?? 0,
    dueSources: dueSources.length,
    results,
  });
}

function isAuthorizedCronRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authorization === `Bearer ${cronSecret}`) {
    return true;
  }

  return request.headers.get("user-agent") === "vercel-cron/1.0";
}
