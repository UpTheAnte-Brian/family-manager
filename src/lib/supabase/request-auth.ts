import { createServerSupabaseAdminClient } from "@/lib/supabase/server";

type AuthenticatedRequestUser = {
  accessToken: string;
  email: string;
  id: string;
};

export async function requireAuthenticatedRequestUser(
  request: Request,
): Promise<AuthenticatedRequestUser | Response> {
  const accessToken = readBearerToken(request.headers.get("authorization"));

  if (!accessToken) {
    return Response.json(
      {
        error: "Sign in before using this endpoint.",
      },
      { status: 401 },
    );
  }

  try {
    const supabase = createServerSupabaseAdminClient();
    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      return Response.json(
        {
          error: "Your session is no longer valid. Sign in again.",
        },
        { status: 401 },
      );
    }

    const email = data.user.email?.trim().toLowerCase();

    if (!email) {
      return Response.json(
        {
          error: "The signed-in account does not have an email address.",
        },
        { status: 403 },
      );
    }

    return {
      accessToken,
      email,
      id: data.user.id,
    };
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Could not validate the signed-in user.",
      },
      { status: 500 },
    );
  }
}

function readBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return "";
  }

  return authorizationHeader.slice("Bearer ".length).trim();
}
