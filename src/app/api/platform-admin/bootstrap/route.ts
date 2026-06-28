import { createServerSupabaseAdminClient } from "@/lib/supabase/server";
import { getSupabaseLikeErrorMessage } from "@/lib/supabase/error-message";
import { requireAuthenticatedRequestUser } from "@/lib/supabase/request-auth";

export const dynamic = "force-dynamic";

type AuthenticatedRequestUser = Awaited<ReturnType<typeof requireAuthenticatedRequestUser>> extends infer Result
  ? Exclude<Result, Response>
  : never;

type PlatformAdminRow = {
  auth_user_id: string;
  email: string;
};

type PlatformAdminStore = {
  findByEmail: (email: string) => Promise<PlatformAdminRow | null>;
  saveForUser: (authenticatedUser: AuthenticatedRequestUser) => Promise<void>;
  replaceUserForEmail: (email: string, authenticatedUser: AuthenticatedRequestUser) => Promise<void>;
};

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
    await persistPlatformAdminAccess(createPlatformAdminStore(supabase), authenticatedUser);

    return Response.json({
      bootstrapped: true,
      email: authenticatedUser.email,
    });
  } catch (error) {
    return Response.json(
      {
        error: getSupabaseLikeErrorMessage(error, "Could not grant platform admin access."),
      },
      { status: 500 },
    );
  }
}

export async function persistPlatformAdminAccess(
  store: PlatformAdminStore,
  authenticatedUser: AuthenticatedRequestUser,
) {
  const existingAdmin = await store.findByEmail(authenticatedUser.email);

  if (existingAdmin && existingAdmin.auth_user_id !== authenticatedUser.id) {
    await store.replaceUserForEmail(authenticatedUser.email, authenticatedUser);
    return;
  }

  await store.saveForUser(authenticatedUser);
}

function readPlatformAdminBootstrapEmails() {
  return (process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function createPlatformAdminStore(
  supabase: ReturnType<typeof createServerSupabaseAdminClient>,
): PlatformAdminStore {
  return {
    async findByEmail(email) {
      const { data, error } = await supabase
        .from("platform_admins")
        .select("auth_user_id, email")
        .ilike("email", email)
        .maybeSingle<PlatformAdminRow>();

      if (error) {
        throw error;
      }

      return data;
    },
    async saveForUser(authenticatedUser) {
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
    },
    async replaceUserForEmail(email, authenticatedUser) {
      const { error } = await supabase
        .from("platform_admins")
        .update({
          auth_user_id: authenticatedUser.id,
          email: authenticatedUser.email,
          updated_at: new Date().toISOString(),
        })
        .ilike("email", email);

      if (error) {
        throw error;
      }
    },
  };
}
