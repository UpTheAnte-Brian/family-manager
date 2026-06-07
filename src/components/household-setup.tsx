"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import type { HouseholdMember } from "@/lib/planner/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type SetupStatus = "idle" | "loading" | "success" | "error";

type MemberDraft = {
  birthDate: string;
  displayName: string;
  externalKey: string;
  preferredName: string;
  relationship: string;
  role: "parent" | "child";
  tempId: string;
};

type HouseholdSetupProps = {
  plannerMembers: HouseholdMember[];
};

const emptyMemberDraft = createBlankMemberDraft("parent");

export function HouseholdSetup({ plannerMembers }: HouseholdSetupProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [memberDrafts, setMemberDrafts] = useState<MemberDraft[]>([emptyMemberDraft]);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SetupStatus>("idle");
  const [message, setMessage] = useState("");
  const [isConfigured, setIsConfigured] = useState(true);

  useEffect(() => {
    let isActive = true;
    const authRedirectResult = getAuthRedirectResult();

    async function loadSession() {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data } = await supabase.auth.getSession();

        if (!isActive) {
          return;
        }

        setSession(data.session);
        setEmail(data.session?.user.email ?? "");
        if (authRedirectResult) {
          setPassword("");
          setStatus(authRedirectResult.status);
          setMessage(
            authRedirectResult.status === "error"
              ? authRedirectResult.message
              : data.session
                ? "Email confirmed. You are signed in. Create a household next."
                : "Email confirmed. Sign in to continue.",
          );
          clearAuthRedirectFromUrl();
        }

        const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
          setSession(nextSession);
          setEmail(nextSession?.user.email ?? "");
          if (event === "SIGNED_IN") {
            setPassword("");
          }
        });

        return listener.subscription;
      } catch (error) {
        if (isActive) {
          setIsConfigured(false);
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "Supabase is not configured.");
        }
      }
    }

    let subscription: { unsubscribe: () => void } | undefined;
    void loadSession().then((nextSubscription) => {
      subscription = nextSubscription;
    });

    return () => {
      isActive = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function signUp() {
    await runSetupAction(async () => {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getAuthRedirectTo(),
        },
      });

      if (error) {
        throw error;
      }

      setPassword("");
      setSession(data.session);

      if (!data.session) {
        return `Account created. Check ${email} for the confirmation email, then return here and sign in.`;
      }

      return "Account created. Create a household to start using Supabase data.";
    });
  }

  async function signIn() {
    await runSetupAction(async () => {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      setPassword("");
      setSession(data.session);
      return "Signed in. Create or select a household to start using Supabase data.";
    });
  }

  async function createHousehold() {
    await runSetupAction(async () => {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.rpc("create_household_for_current_user", {
        household_name: householdName,
        household_timezone: "America/Chicago",
      });

      if (error) {
        throw error;
      }

      const household = data as { id?: string; name?: string } | null;
      const householdId = household?.id;
      const memberRows = getValidMemberDrafts(memberDrafts);

      if (householdId && memberRows.length > 0) {
        const { error: membersError } = await supabase.from("household_members").upsert(
          memberRows.map((member) => ({
            household_id: householdId,
            external_key: member.externalKey,
            preferred_name: member.preferredName,
            display_name: member.displayName || member.preferredName,
            role: member.role,
            relationship: member.relationship || null,
            birth_date: member.birthDate || null,
            metadata: {},
          })),
          {
            onConflict: "household_id,external_key",
          },
        );

        if (membersError) {
          throw membersError;
        }
      }

      return `Created ${household?.name ?? "household"} with ${memberRows.length} member${memberRows.length === 1 ? "" : "s"}. Calendar sources now sync through Supabase when this account is signed in.`;
    });
  }

  async function signOut() {
    await runSetupAction(async () => {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      setSession(null);
      setPassword("");
      return "Signed out.";
    });
  }

  async function runSetupAction(action: () => Promise<string>) {
    setStatus("loading");
    setMessage("");

    try {
      const nextMessage = await action();
      setStatus("success");
      setMessage(nextMessage);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Setup failed.");
    }
  }

  function loadPlannerMembers() {
    setMemberDrafts(plannerMembers.map(mapPlannerMemberToDraft));
  }

  function addMember(role: "parent" | "child") {
    setMemberDrafts((current) => [...current, createBlankMemberDraft(role)]);
  }

  function removeMember(tempId: string) {
    setMemberDrafts((current) =>
      current.length === 1 ? [createBlankMemberDraft("parent")] : current.filter((member) => member.tempId !== tempId),
    );
  }

  function updateMember(tempId: string, patch: Partial<MemberDraft>) {
    setMemberDrafts((current) =>
      current.map((member) =>
        member.tempId === tempId
          ? {
              ...member,
              ...patch,
              externalKey:
                patch.preferredName && member.externalKey === createMemberExternalKey(member.preferredName)
                  ? createMemberExternalKey(patch.preferredName)
                  : patch.externalKey ?? member.externalKey,
            }
          : member,
      ),
    );
  }

  return (
    <main className="min-h-screen bg-[#eef2f6] text-[#17202a]">
      <section className="border-b border-[#cbd5df] bg-[#f8fafc]">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-5 py-6 sm:px-8">
          <div className="flex flex-wrap gap-4">
            <Link className="text-sm font-semibold text-[#1f6f8b]" href="/">
              Dashboard
            </Link>
            <Link className="text-sm font-semibold text-[#1f6f8b]" href="/admin">
              Admin
            </Link>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
              Supabase setup
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">
              Household access
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#4c5965]">
              Create or sign in to the account that should own a household. Household data is
              separated by membership, so another family can create its own household without
              seeing yours.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-5 px-5 py-5 sm:px-8">
        {!isConfigured ? (
          <div className="border border-[#cbd5df] bg-white p-4 shadow-sm">
            <h2 className="text-xl font-semibold">Supabase is not configured</h2>
            <p className="mt-2 text-sm leading-6 text-[#4c5965]">{message}</p>
          </div>
        ) : (
          <>
            <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
              <h2 className="text-xl font-semibold">Account</h2>
              <div className="mt-4 grid gap-4">
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">Email</span>
                  <input
                    autoComplete="email"
                    className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                    disabled={Boolean(session)}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    value={email}
                  />
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">Password</span>
                  <input
                    autoComplete={session ? "current-password" : "new-password"}
                    className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                    disabled={Boolean(session)}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    value={password}
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  {!session ? (
                    <>
                      <button
                        className="border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={status === "loading" || !email || password.length < 6}
                        onClick={signUp}
                        type="button"
                      >
                        Create account
                      </button>
                      <button
                        className="border border-[#1f6f8b] bg-white px-4 py-2 text-sm font-semibold text-[#1f6f8b] disabled:opacity-50"
                        disabled={status === "loading" || !email || !password}
                        onClick={signIn}
                        type="button"
                      >
                        Sign in
                      </button>
                    </>
                  ) : (
                    <button
                      className="border border-[#d7e0e7] bg-white px-4 py-2 text-sm font-semibold text-[#33414f]"
                      disabled={status === "loading"}
                      onClick={signOut}
                      type="button"
                    >
                      Sign out
                    </button>
                  )}
                </div>
                {message ? <SetupStatusMessage message={message} status={status} /> : null}
              </div>
            </section>

            <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
              <h2 className="text-xl font-semibold">Household</h2>
              <p className="mt-2 text-sm leading-6 text-[#4c5965]">
                Create a household for this account, then add the people whose dashboards and
                assignments should exist in Supabase.
              </p>
              <label className="mt-4 grid gap-1 text-sm">
                <span className="font-semibold">Household name</span>
                <input
                  className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                  onChange={(event) => setHouseholdName(event.target.value)}
                  placeholder="Johnson Family"
                  value={householdName}
                />
              </label>
              <div className="mt-5 grid gap-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">Members</h3>
                    <p className="mt-1 text-sm leading-6 text-[#4c5965]">
                      Start blank for a new family, or load the current planner names for this
                      household.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#33414f]"
                      disabled={status === "loading"}
                      onClick={loadPlannerMembers}
                      type="button"
                    >
                      Use planner defaults
                    </button>
                    <button
                      className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#33414f]"
                      disabled={status === "loading"}
                      onClick={() => addMember("parent")}
                      type="button"
                    >
                      Add parent
                    </button>
                    <button
                      className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#33414f]"
                      disabled={status === "loading"}
                      onClick={() => addMember("child")}
                      type="button"
                    >
                      Add child
                    </button>
                  </div>
                </div>

                <ol className="grid gap-2">
                  {memberDrafts.map((member) => (
                    <li
                      className="grid gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 md:grid-cols-[1fr_1fr_120px_150px_auto]"
                      key={member.tempId}
                    >
                      <label className="grid gap-1 text-sm">
                        <span className="font-semibold">Preferred name</span>
                        <input
                          className="border border-[#d7e0e7] bg-white px-3 py-2"
                          onChange={(event) => updateMember(member.tempId, { preferredName: event.target.value })}
                          value={member.preferredName}
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-semibold">Display name</span>
                        <input
                          className="border border-[#d7e0e7] bg-white px-3 py-2"
                          onChange={(event) => updateMember(member.tempId, { displayName: event.target.value })}
                          value={member.displayName}
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-semibold">Role</span>
                        <select
                          className="border border-[#d7e0e7] bg-white px-3 py-2"
                          onChange={(event) =>
                            updateMember(member.tempId, { role: event.target.value as "parent" | "child" })
                          }
                          value={member.role}
                        >
                          <option value="parent">Parent</option>
                          <option value="child">Child</option>
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-semibold">Relationship</span>
                        <input
                          className="border border-[#d7e0e7] bg-white px-3 py-2"
                          onChange={(event) => updateMember(member.tempId, { relationship: event.target.value })}
                          value={member.relationship}
                        />
                      </label>
                      <button
                        className="self-end border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#8a2f2f]"
                        disabled={status === "loading"}
                        onClick={() => removeMember(member.tempId)}
                        type="button"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
              <button
                className="mt-4 border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={
                  status === "loading" ||
                  !session ||
                  !householdName.trim() ||
                  getValidMemberDrafts(memberDrafts).length === 0
                }
                onClick={createHousehold}
                type="button"
              >
                Create household
              </button>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function createBlankMemberDraft(role: "parent" | "child"): MemberDraft {
  const tempId = crypto.randomUUID();

  return {
    birthDate: "",
    displayName: "",
    externalKey: `${role}-${tempId}`,
    preferredName: "",
    relationship: "",
    role,
    tempId,
  };
}

function mapPlannerMemberToDraft(member: HouseholdMember): MemberDraft {
  return {
    birthDate: member.birthDate ?? "",
    displayName: member.displayName,
    externalKey: member.id,
    preferredName: member.preferredName,
    relationship: member.relationship,
    role: member.role,
    tempId: member.id,
  };
}

function getValidMemberDrafts(members: MemberDraft[]) {
  return members
    .map((member) => ({
      ...member,
      displayName: member.displayName.trim(),
      externalKey: member.externalKey.trim() || createMemberExternalKey(member.preferredName),
      preferredName: member.preferredName.trim(),
      relationship: member.relationship.trim(),
    }))
    .filter((member) => member.preferredName && member.externalKey);
}

function createMemberExternalKey(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80) || crypto.randomUUID()
  );
}

function SetupStatusMessage({ message, status }: { message: string; status: SetupStatus }) {
  return (
    <p
      className={`border px-3 py-3 text-sm ${
        status === "error"
          ? "border-[#d7a7a7] bg-[#fff7f7] text-[#8a2f2f]"
          : "border-[#cbd5df] bg-white text-[#2f6f73]"
      }`}
    >
      {message}
    </p>
  );
}

function getAuthRedirectTo() {
  return `${window.location.origin}/setup`;
}

function getAuthRedirectResult(): { message: string; status: "error" | "success" } | null {
  const params = getAuthRedirectParams();
  const errorDescription = params.get("error_description");
  const error = params.get("error");

  if (errorDescription || error) {
    return {
      message:
        errorDescription ??
        `Supabase could not finish the email confirmation${error ? `: ${error}` : "."}`,
      status: "error",
    };
  }

  if (params.has("access_token") || params.has("refresh_token") || params.has("type")) {
    return {
      message: "Email confirmed.",
      status: "success",
    };
  }

  return null;
}

function getAuthRedirectParams() {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  hashParams.forEach((value, key) => {
    params.set(key, value);
  });

  return params;
}

function clearAuthRedirectFromUrl() {
  if (typeof window.history?.replaceState !== "function") {
    return;
  }

  window.history.replaceState(
    null,
    "",
    `${window.location.origin}${window.location.pathname}`,
  );
}
