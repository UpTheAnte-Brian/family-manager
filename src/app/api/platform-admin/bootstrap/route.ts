import { createServerSupabaseAdminClient } from "@/lib/supabase/server";
import { requireAuthenticatedRequestUser } from "@/lib/supabase/request-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authenticatedUser = await requireAuthenticatedRequestUser(request);

  if (authenticatedUser instanceof Response) {
    return authenticatedUser;
  }

  const allowedEmails = readPlatformAdminBootstrapEmails();

  if (!allowedEmails.includes(authenticatedUser.email)) {
    return Response.json(
      {
        error: "This account is not allowed to bootstrap platform admin access.",
      },
      { status: 403 },
    );
  }

  try {
    const supabase = createServerSupabaseAdminClient();
    const { error } = await supabase.from("platform_admins").upsert(
      {
        auth_user_id: authenticatedUser.id,
        email: authenticatedUser.email,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "auth_user_id",
      },
    );

    if (error) {
      throw error;
    }

    return Response.json({
      bootstrapped: true,
      email: authenticatedUser.email,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Could not grant platform admin access.",
      },
      { status: 500 },
    );
  }
}

function readPlatformAdminBootstrapEmails() {
  return (process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}
