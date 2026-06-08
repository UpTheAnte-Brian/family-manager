"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { AdminCalendarSources } from "@/components/admin-calendar-sources";
import { AdminRoutineTemplates } from "@/components/admin-routine-templates";
import type { HouseholdMember } from "@/lib/planner/types";
import { createBrowserSupabaseClient, getBrowserSupabaseConfig } from "@/lib/supabase/client";

type SetupStatus = "idle" | "loading" | "success" | "error";
type SetupStepId = "account" | "household" | "members";

type HouseholdSetupProps = {
  plannerMembers: HouseholdMember[];
};

type HouseholdSummary = {
  id: string;
  name: string;
  role: string;
  timezone: string;
};

type HouseholdMemberRow = {
  birth_date: string | null;
  display_name: string | null;
  external_key: string;
  id: string;
  preferred_name: string;
  relationship: string | null;
  role: "parent" | "child";
};

type MemberDraft = {
  birthDate: string;
  displayName: string;
  externalKey: string;
  preferredName: string;
  relationship: string;
  role: "parent" | "child";
  tempId: string;
};

type MembershipRow = {
  household_id: string;
  role: string;
};

type HouseholdRow = {
  id: string;
  name: string;
  timezone: string;
};

const emptyMemberDraft = createBlankMemberDraft("parent");

export function HouseholdSetup({ plannerMembers }: HouseholdSetupProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState("");
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMemberRow[]>([]);
  const [householdName, setHouseholdName] = useState("");
  const [memberDrafts, setMemberDrafts] = useState<MemberDraft[]>([emptyMemberDraft]);
  const [status, setStatus] = useState<SetupStatus>("idle");
  const [message, setMessage] = useState("");
  const [activeStep, setActiveStep] = useState<SetupStepId | null>(null);
  const [isConfigured, setIsConfigured] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const selectedHousehold = households.find((household) => household.id === selectedHouseholdId);
  const hasAccount = Boolean(session);
  const hasHousehold = Boolean(selectedHousehold);
  const hasMembers = householdMembers.length > 0;
  const setupProgress = [hasAccount, hasHousehold, hasMembers].filter(Boolean).length;
  const adminMembers = useMemo(() => {
    if (householdMembers.length === 0) {
      return plannerMembers;
    }

    return householdMembers.map(mapRemoteMemberToPlannerMember);
  }, [householdMembers, plannerMembers]);

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
          setActiveStep("account");
          setMessage(
            authRedirectResult.status === "error"
              ? authRedirectResult.message
              : data.session
                ? "Email confirmed. You are signed in."
                : "Email confirmed. Sign in to continue.",
          );
          clearAuthRedirectFromUrl();
        }

        const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
          setSession(nextSession);
          setEmail(nextSession?.user.email ?? "");

          if (event === "SIGNED_IN") {
            setPassword("");
            setRefreshVersion((current) => current + 1);
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

  useEffect(() => {
    let isActive = true;

    async function loadWorkflow() {
      await Promise.resolve();

      if (!session) {
        if (!isActive) {
          return;
        }

        setHouseholds([]);
        setSelectedHouseholdId("");
        setHouseholdMembers([]);
        setMemberDrafts([emptyMemberDraft]);
        return;
      }

      try {
        const nextState = await loadHouseholdWorkflowState(selectedHouseholdId);

        if (!isActive) {
          return;
        }

        setHouseholds(nextState.households);
        setSelectedHouseholdId(nextState.selectedHouseholdId);
        setHouseholdMembers(nextState.members);
        setMemberDrafts(nextState.members.length > 0 ? nextState.members.map(mapRemoteMemberToDraft) : [emptyMemberDraft]);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Could not load household setup.");
      }
    }

    void loadWorkflow();

    return () => {
      isActive = false;
    };
  }, [refreshVersion, selectedHouseholdId, session]);

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
        return `If this is a new account, check ${email} for the confirmation email. If this email is already confirmed, use Sign in.`;
      }

      setRefreshVersion((current) => current + 1);
      return "Account created.";
    }, "account");
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
      setRefreshVersion((current) => current + 1);
      return "Signed in.";
    }, "account");
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
    }, "account");
  }

  async function createHousehold() {
    await runSetupAction(async () => {
      if (!session?.access_token) {
        throw new Error("Sign in again before creating a household.");
      }

      const household = await createHouseholdForCurrentUser(session.access_token, householdName);
      const householdId = household?.id;

      if (!householdId) {
        throw new Error("Supabase did not return the created household.");
      }

      setHouseholdName("");
      setSelectedHouseholdId(householdId);
      await saveMemberDrafts(householdId);
      setRefreshVersion((current) => current + 1);
      return `Created ${household?.name ?? "household"}.`;
    }, "household");
  }

  async function saveMembers() {
    if (!selectedHouseholdId) {
      return;
    }

    await runSetupAction(async () => {
      await saveMemberDrafts(selectedHouseholdId);
      setRefreshVersion((current) => current + 1);
      return "Family members saved.";
    }, "members");
  }

  async function saveMemberDrafts(householdId: string) {
    const supabase = createBrowserSupabaseClient();
    const memberRows = getValidMemberDrafts(memberDrafts);

    if (memberRows.length === 0) {
      return;
    }

    const { error } = await supabase.from("household_members").upsert(
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

    if (error) {
      throw error;
    }
  }

  async function runSetupAction(action: () => Promise<string>, step: SetupStepId) {
    setActiveStep(step);
    setStatus("loading");
    setMessage("");

    try {
      const nextMessage = await withTimeout(action(), 20000);
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
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 sm:px-8 lg:px-10">
          <div className="flex flex-wrap gap-4">
            <Link className="text-sm font-semibold text-[#1f6f8b]" href="/">
              Dashboard
            </Link>
            <Link className="text-sm font-semibold text-[#1f6f8b]" href="/calendar">
              Calendar
            </Link>
            <Link className="text-sm font-semibold text-[#1f6f8b]" href="/chores">
              Chores
            </Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                Household setup
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">
                Setup workflow
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[#4c5965]">
                Finish the pieces that make this device-backed family dashboard durable across
                devices.
              </p>
            </div>
            <div className="border border-[#cbd5df] bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#657381]">Progress</p>
              <p className="mt-1 text-2xl font-semibold">{setupProgress}/3</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5 sm:px-8 lg:px-10">
        {!isConfigured ? (
          <div className="border border-[#cbd5df] bg-white p-4 shadow-sm">
            <h2 className="text-xl font-semibold">Supabase is not configured</h2>
            <p className="mt-2 text-sm leading-6 text-[#4c5965]">{message}</p>
          </div>
        ) : (
          <>
            {message && !activeStep ? <SetupStatusMessage message={message} status={status} /> : null}

            <WorkflowStep
              complete={hasAccount}
              defaultOpen={!hasAccount}
              index={1}
              summary={session?.user.email ?? "Create or sign in to the household owner account."}
              title="Profile"
            >
              {session ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{session.user.email}</p>
                    <p className="mt-1 text-sm text-[#657381]">Signed in and ready for household setup.</p>
                  </div>
                  <button
                    className="border border-[#d7e0e7] bg-white px-4 py-2 text-sm font-semibold text-[#33414f]"
                    disabled={status === "loading"}
                    onClick={signOut}
                    type="button"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="grid gap-4">
                  <label className="grid gap-1 text-sm">
                    <span className="font-semibold">Email</span>
                    <input
                      autoComplete="email"
                      className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                      onChange={(event) => setEmail(event.target.value)}
                      type="email"
                      value={email}
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="font-semibold">Password</span>
                    <input
                      autoComplete="new-password"
                      className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                      onChange={(event) => setPassword(event.target.value)}
                      type="password"
                      value={password}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
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
                  </div>
                </div>
              )}
              {activeStep === "account" && message ? (
                <SetupStatusMessage message={message} status={status} />
              ) : null}
            </WorkflowStep>

            <WorkflowStep
              complete={hasHousehold}
              defaultOpen={hasAccount && !hasHousehold}
              disabled={!hasAccount}
              index={2}
              summary={selectedHousehold ? selectedHousehold.name : "Create or select a household."}
              title="Household"
            >
              {households.length > 0 ? (
                <div className="grid gap-2">
                  {households.map((household) => (
                    <button
                      className={`border px-3 py-3 text-left ${
                        household.id === selectedHouseholdId
                          ? "border-[#1f6f8b] bg-[#e8f4f3]"
                          : "border-[#d7e0e7] bg-[#f8fafc]"
                      }`}
                      key={household.id}
                      onClick={() => setSelectedHouseholdId(household.id)}
                      type="button"
                    >
                      <span className="block font-semibold">{household.name}</span>
                      <span className="mt-1 block text-xs text-[#657381]">
                        {household.role} · {household.timezone}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 border border-[#d7e0e7] bg-[#f8fafc] p-3">
                <h3 className="font-semibold">{households.length > 0 ? "Create another household" : "Create household"}</h3>
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">Household name</span>
                  <input
                    className="border border-[#d7e0e7] bg-white px-3 py-2"
                    onChange={(event) => setHouseholdName(event.target.value)}
                    placeholder="Johnson Family"
                    value={householdName}
                  />
                </label>
                <button
                  className="justify-self-start border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={status === "loading" || !session || !householdName.trim()}
                  onClick={createHousehold}
                  type="button"
                >
                  {status === "loading" && activeStep === "household" ? "Creating..." : "Create household"}
                </button>
                {activeStep === "household" && message ? (
                  <SetupStatusMessage message={message} status={status} />
                ) : null}
              </div>
            </WorkflowStep>

            <WorkflowStep
              complete={hasMembers}
              defaultOpen={hasHousehold && !hasMembers}
              disabled={!hasHousehold}
              index={3}
              summary={
                hasMembers
                  ? `${householdMembers.length} member${householdMembers.length === 1 ? "" : "s"} saved`
                  : "Add the people who should appear on dashboards and assignments."
              }
              title="Family members"
            >
              <MemberDraftEditor
                drafts={memberDrafts}
                onAddMember={addMember}
                onLoadPlannerMembers={loadPlannerMembers}
                onRemoveMember={removeMember}
                onSave={saveMembers}
                onUpdateMember={updateMember}
                status={status}
              />
              {activeStep === "members" && message ? (
                <SetupStatusMessage message={message} status={status} />
              ) : null}
            </WorkflowStep>

            <WorkflowStep
              complete={false}
              defaultOpen={hasMembers}
              disabled={!hasMembers}
              index={4}
              summary="Create reusable routines and apply them to household members."
              title="Routine templates"
            >
              <AdminRoutineTemplates members={adminMembers} />
            </WorkflowStep>

            <WorkflowStep
              complete={false}
              defaultOpen={hasMembers}
              disabled={!hasMembers}
              index={5}
              summary="Connect SportsEngine, school, family, or manual calendar sources."
              title="Calendar imports"
            >
              <AdminCalendarSources members={adminMembers} />
            </WorkflowStep>
          </>
        )}
      </section>
    </main>
  );
}

async function createHouseholdForCurrentUser(accessToken: string, householdName: string) {
  const { supabaseAnonKey, supabaseUrl } = getBrowserSupabaseConfig();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/create_household_for_current_user`, {
      body: JSON.stringify({
        household_name: householdName,
        household_timezone: "America/Chicago",
      }),
      headers: {
        accept: "application/json",
        apikey: supabaseAnonKey,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });

    const responseText = await response.text();
    const responseBody = responseText ? parseJsonResponse(responseText) : null;

    if (!response.ok) {
      throw new Error(getSupabaseErrorMessage(responseBody, response.status));
    }

    return responseBody as { id?: string; name?: string } | null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Creating the household timed out before Supabase responded. Try again.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function parseJsonResponse(responseText: string): unknown {
  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

function getSupabaseErrorMessage(responseBody: unknown, status: number) {
  if (responseBody && typeof responseBody === "object" && "message" in responseBody) {
    const message = (responseBody as { message?: unknown }).message;

    if (typeof message === "string" && message) {
      return message;
    }
  }

  if (typeof responseBody === "string" && responseBody) {
    return responseBody;
  }

  return `Supabase returned HTTP ${status} while creating the household.`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: number | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error("Setup request timed out before it finished. Try again."));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }
}

function WorkflowStep({
  children,
  complete,
  defaultOpen,
  disabled = false,
  index,
  summary,
  title,
}: Readonly<{
  children: React.ReactNode;
  complete: boolean;
  defaultOpen: boolean;
  disabled?: boolean;
  index: number;
  summary: string;
  title: string;
}>) {
  return (
    <details
      className={`border border-[#cbd5df] bg-white shadow-sm ${disabled ? "opacity-60" : ""}`}
      open={defaultOpen && !disabled}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center border text-sm font-semibold ${
              complete
                ? "border-[#b7d7ce] bg-[#e8f4f3] text-[#2f6f73]"
                : "border-[#d7e0e7] bg-[#f8fafc] text-[#657381]"
            }`}
          >
            {complete ? "✓" : index}
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-[#657381]">{disabled ? "Complete the previous step first." : summary}</p>
          </div>
        </div>
        <span className="text-sm font-semibold text-[#1f6f8b]">{complete ? "Done" : "Open"}</span>
      </summary>
      {!disabled ? <div className="border-t border-[#d7e0e7] px-4 py-4">{children}</div> : null}
    </details>
  );
}

function MemberDraftEditor({
  drafts,
  onAddMember,
  onLoadPlannerMembers,
  onRemoveMember,
  onSave,
  onUpdateMember,
  status,
}: Readonly<{
  drafts: MemberDraft[];
  onAddMember: (role: "parent" | "child") => void;
  onLoadPlannerMembers: () => void;
  onRemoveMember: (tempId: string) => void;
  onSave: () => void;
  onUpdateMember: (tempId: string, patch: Partial<MemberDraft>) => void;
  status: SetupStatus;
}>) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm leading-6 text-[#4c5965]">
          These names become the durable member records used by dashboards, routines, chores, and calendar assignments.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#33414f]"
            disabled={status === "loading"}
            onClick={onLoadPlannerMembers}
            type="button"
          >
            Use planner defaults
          </button>
          <button
            className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#33414f]"
            disabled={status === "loading"}
            onClick={() => onAddMember("parent")}
            type="button"
          >
            Add parent
          </button>
          <button
            className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#33414f]"
            disabled={status === "loading"}
            onClick={() => onAddMember("child")}
            type="button"
          >
            Add child
          </button>
        </div>
      </div>
      <ol className="grid gap-2">
        {drafts.map((member) => (
          <li
            className="grid gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 md:grid-cols-[1fr_1fr_120px_150px_auto]"
            key={member.tempId}
          >
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Preferred name</span>
              <input
                className="border border-[#d7e0e7] bg-white px-3 py-2"
                onChange={(event) => onUpdateMember(member.tempId, { preferredName: event.target.value })}
                value={member.preferredName}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Display name</span>
              <input
                className="border border-[#d7e0e7] bg-white px-3 py-2"
                onChange={(event) => onUpdateMember(member.tempId, { displayName: event.target.value })}
                value={member.displayName}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Role</span>
              <select
                className="border border-[#d7e0e7] bg-white px-3 py-2"
                onChange={(event) => onUpdateMember(member.tempId, { role: event.target.value as "parent" | "child" })}
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
                onChange={(event) => onUpdateMember(member.tempId, { relationship: event.target.value })}
                value={member.relationship}
              />
            </label>
            <button
              className="self-end border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#8a2f2f]"
              disabled={status === "loading"}
              onClick={() => onRemoveMember(member.tempId)}
              type="button"
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      <button
        className="justify-self-start border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        disabled={status === "loading" || getValidMemberDrafts(drafts).length === 0}
        onClick={onSave}
        type="button"
      >
        Save family members
      </button>
    </div>
  );
}

async function loadHouseholdWorkflowState(selectedHouseholdId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data: memberships, error: membershipError } = await supabase
    .from("household_users")
    .select("household_id, role")
    .order("created_at", { ascending: true })
    .returns<MembershipRow[]>();

  if (membershipError) {
    throw membershipError;
  }

  const householdIds = [...new Set((memberships ?? []).map((membership) => membership.household_id))];

  if (householdIds.length === 0) {
    return {
      households: [],
      members: [],
      selectedHouseholdId: "",
    };
  }

  const { data: householdRows, error: householdError } = await supabase
    .from("households")
    .select("id, name, timezone")
    .in("id", householdIds)
    .returns<HouseholdRow[]>();

  if (householdError) {
    throw householdError;
  }

  const roleByHouseholdId = new Map((memberships ?? []).map((membership) => [membership.household_id, membership.role]));
  const households = (householdRows ?? [])
    .map((household) => ({
      id: household.id,
      name: household.name,
      role: roleByHouseholdId.get(household.id) ?? "member",
      timezone: household.timezone,
    }))
    .sort((first, second) => first.name.localeCompare(second.name));
  const nextSelectedHouseholdId =
    households.find((household) => household.id === selectedHouseholdId)?.id ?? households[0]?.id ?? "";

  const { data: members, error: membersError } = nextSelectedHouseholdId
    ? await supabase
        .from("household_members")
        .select("id, external_key, preferred_name, display_name, role, relationship, birth_date")
        .eq("household_id", nextSelectedHouseholdId)
        .order("role", { ascending: false })
        .order("preferred_name", { ascending: true })
        .returns<HouseholdMemberRow[]>()
    : { data: [], error: null };

  if (membersError) {
    throw membersError;
  }

  return {
    households,
    members: members ?? [],
    selectedHouseholdId: nextSelectedHouseholdId,
  };
}

function mapRemoteMemberToPlannerMember(member: HouseholdMemberRow): HouseholdMember {
  return {
    id: member.external_key,
    preferredName: member.preferred_name,
    displayName: member.display_name ?? member.preferred_name,
    role: member.role,
    relationship: normalizePlannerRelationship(member.relationship, member.role),
    birthDate: member.birth_date ?? undefined,
  };
}

function normalizePlannerRelationship(
  relationship: string | null,
  role: "parent" | "child",
): HouseholdMember["relationship"] {
  if (
    relationship === "dad" ||
    relationship === "mom" ||
    relationship === "son" ||
    relationship === "daughter"
  ) {
    return relationship;
  }

  return role === "parent" ? "mom" : "daughter";
}

function mapRemoteMemberToDraft(member: HouseholdMemberRow): MemberDraft {
  return {
    birthDate: member.birth_date ?? "",
    displayName: member.display_name ?? member.preferred_name,
    externalKey: member.external_key,
    preferredName: member.preferred_name,
    relationship: member.relationship ?? "",
    role: member.role,
    tempId: member.id,
  };
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
