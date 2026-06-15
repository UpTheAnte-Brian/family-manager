"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { AdminBaselineTemplates } from "@/components/admin-baseline-templates";
import { AdminCalendarSources } from "@/components/admin-calendar-sources";
import { AdminRoutineTemplates } from "@/components/admin-routine-templates";
import type { DayTemplate, HouseholdMember } from "@/lib/planner/types";
import { createBrowserSupabaseClient, getBrowserSupabaseConfig } from "@/lib/supabase/client";
import { getSupabaseLikeErrorMessage } from "@/lib/supabase/error-message";
import { useCurrentHousehold } from "@/lib/supabase/household";
import { writeStoredHouseholdSelection } from "@/lib/supabase/household-selection";

type SetupStatus = "idle" | "loading" | "success" | "error";
type SetupStepId = "account" | "household" | "members" | "access";

type HouseholdSetupProps = {
  defaultDayTemplates: DayTemplate[];
  plannerMembers: HouseholdMember[];
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

type HouseholdAccessRole = "owner" | "parent" | "caregiver" | "viewer";

type InvitationRole = Exclude<HouseholdAccessRole, "owner">;

type HouseholdAccessEntryRow = {
  accepted_at: string | null;
  auth_user_id: string | null;
  created_at: string;
  email: string;
  entry_id: string;
  entry_type: "invitation" | "member";
  invited_by_email: string | null;
  role: HouseholdAccessRole;
  status: string;
};

type InvitationRow = {
  id: string;
  invited_email: string;
};

type CreatedHouseholdRow = {
  id?: string;
  name?: string;
  timezone?: string;
};

const emptyMemberDraft = createBlankMemberDraft("parent");

export function HouseholdSetup({ defaultDayTemplates, plannerMembers }: HouseholdSetupProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMemberRow[]>([]);
  const [householdAccessEntries, setHouseholdAccessEntries] = useState<HouseholdAccessEntryRow[]>([]);
  const [householdName, setHouseholdName] = useState("");
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationRole, setInvitationRole] = useState<InvitationRole>("parent");
  const [memberDrafts, setMemberDrafts] = useState<MemberDraft[]>([emptyMemberDraft]);
  const [status, setStatus] = useState<SetupStatus>("idle");
  const [message, setMessage] = useState("");
  const [activeStep, setActiveStep] = useState<SetupStepId | null>(null);
  const [isConfigured, setIsConfigured] = useState(true);
  const [openStepOverride, setOpenStepOverride] = useState<number | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const {
    household: selectedHousehold,
    households,
    refresh: refreshCurrentHousehold,
    selectHousehold,
  } = useCurrentHousehold();
  const selectedHouseholdId = selectedHousehold?.householdId ?? "";
  const isHouseholdAdmin = selectedHousehold
    ? selectedHousehold.role === "owner" || selectedHousehold.role === "parent"
    : false;
  const hasAccount = Boolean(session);
  const hasHousehold = Boolean(selectedHousehold);
  const hasMembers = householdMembers.length > 0;
  const setupProgress = [hasAccount, hasHousehold, hasMembers].filter(Boolean).length;
  const recommendedOpenStep = getRecommendedOpenStep(authReady, hasAccount, hasHousehold, hasMembers);
  const openStep = openStepOverride ?? recommendedOpenStep;
  const activeAccessEntries = householdAccessEntries.filter((entry) => entry.entry_type === "member");
  const pendingInvitationEntries = householdAccessEntries.filter((entry) => entry.entry_type === "invitation");
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
        setAuthReady(true);

        if (authRedirectResult) {
          setPassword("");
          setStatus(authRedirectResult.status);
          setActiveStep("account");
          setMessage(
            authRedirectResult.status === "error"
              ? authRedirectResult.message
              : data.session
                ? "Email confirmed. You are signed in. Matching household invitations will be claimed automatically."
                : "Email confirmed. Sign in to continue.",
          );
          clearAuthRedirectFromUrl();
        }

        const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
          setSession(nextSession);
          setEmail(nextSession?.user.email ?? "");

          if (event === "SIGNED_IN") {
            setPassword("");
            setOpenStepOverride(null);
            setRefreshVersion((current) => current + 1);
          }
        });

        return listener.subscription;
      } catch (error) {
        if (isActive) {
          setIsConfigured(false);
          setAuthReady(true);
          setStatus("error");
          setMessage(getSupabaseLikeErrorMessage(error, "Supabase is not configured."));
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

        setHouseholdMembers([]);
        setHouseholdAccessEntries([]);
        setMemberDrafts([emptyMemberDraft]);
        return;
      }

      if (!selectedHouseholdId) {
        if (!isActive) {
          return;
        }

        setHouseholdMembers([]);
        setHouseholdAccessEntries([]);
        setMemberDrafts([emptyMemberDraft]);
        return;
      }

      try {
        const nextState = await loadHouseholdWorkflowState(selectedHouseholdId, isHouseholdAdmin);

        if (!isActive) {
          return;
        }

        setHouseholdMembers(nextState.members);
        setHouseholdAccessEntries(nextState.accessEntries);
        setMemberDrafts(nextState.members.length > 0 ? nextState.members.map(mapRemoteMemberToDraft) : [emptyMemberDraft]);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setStatus("error");
        setMessage(getSupabaseLikeErrorMessage(error, "Could not load household setup."));
      }
    }

    void loadWorkflow();

    return () => {
      isActive = false;
    };
  }, [isHouseholdAdmin, refreshVersion, selectedHouseholdId, session]);

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
      setOpenStepOverride(null);

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
      setOpenStepOverride(null);
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
      setOpenStepOverride(null);
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

      if (session?.user.id) {
        writeStoredHouseholdSelection(session.user.id, householdId);
      }

      setHouseholdName("");
      setHouseholdMembers([]);
      setHouseholdAccessEntries([]);
      setMemberDrafts([emptyMemberDraft]);
      setOpenStepOverride(3);
      await refreshCurrentHousehold();
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

  async function inviteHouseholdAccess() {
    if (!selectedHouseholdId) {
      return;
    }

    await runSetupAction(async () => {
      const normalizedInvitationEmail = invitationEmail.trim().toLowerCase();

      const invitation = await inviteUserToHousehold(
        selectedHouseholdId,
        normalizedInvitationEmail,
        invitationRole,
      );
      setInvitationEmail("");
      setInvitationRole("parent");
      setRefreshVersion((current) => current + 1);
      return `Invitation saved for ${invitation.invited_email}.`;
    }, "access");
  }

  async function revokeHouseholdAccessInvitation(invitationId: string) {
    await runSetupAction(async () => {
      await revokeHouseholdInvitation(invitationId);
      setRefreshVersion((current) => current + 1);
      return "Invitation revoked.";
    }, "access");
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
      setMessage(getSupabaseLikeErrorMessage(error, "Setup failed."));
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
            {!authReady ? (
              <div className="border border-[#cbd5df] bg-white p-4 shadow-sm">
                <h2 className="text-xl font-semibold">Checking account session</h2>
                <p className="mt-2 text-sm leading-6 text-[#4c5965]">
                  Restoring your Supabase login before showing setup steps.
                </p>
              </div>
            ) : null}
            {authReady && message && !activeStep ? <SetupStatusMessage message={message} status={status} /> : null}

            {authReady ? (
              <>
                <WorkflowStep
                  complete={hasAccount}
                  index={1}
                  isOpen={openStep === 1}
                  onOpenChange={(isOpen) => setOpenStepOverride(isOpen ? 1 : 0)}
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
                  disabled={!hasAccount}
                  index={2}
                  isOpen={openStep === 2}
                  onOpenChange={(isOpen) => setOpenStepOverride(isOpen ? 2 : 0)}
                  summary={selectedHousehold ? selectedHousehold.householdName : "Create or select a household."}
                  title="Household"
                >
                  {households.length > 0 ? (
                    <div className="grid gap-2">
                      {households.map((household) => (
                        <button
                          className={`border px-3 py-3 text-left ${
                            household.householdId === selectedHouseholdId
                              ? "border-[#1f6f8b] bg-[#e8f4f3]"
                              : "border-[#d7e0e7] bg-[#f8fafc]"
                          }`}
                          key={household.householdId}
                          onClick={() => selectHousehold(household.householdId)}
                          type="button"
                        >
                          <span className="block font-semibold">{household.householdName}</span>
                          <span className="mt-1 block text-xs text-[#657381]">
                            {household.role} · {household.timezone}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 border border-[#d7e0e7] bg-[#f8fafc] p-3">
                    <h3 className="font-semibold">
                      {households.length > 0 ? "Create another household" : "Create household"}
                    </h3>
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
                  disabled={!hasHousehold || !isHouseholdAdmin}
                  index={3}
                  isOpen={openStep === 3}
                  onOpenChange={(isOpen) => setOpenStepOverride(isOpen ? 3 : 0)}
                  summary={
                    !hasHousehold
                      ? "Select a household before editing people."
                      : !isHouseholdAdmin
                        ? `This account has ${selectedHousehold?.role ?? "viewer"} access. Ask a household owner or parent to manage setup.`
                        : hasMembers
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
                  complete={pendingInvitationEntries.length === 0 && activeAccessEntries.length > 0}
                  disabled={!hasHousehold || !isHouseholdAdmin}
                  index={4}
                  isOpen={openStep === 4}
                  onOpenChange={(isOpen) => setOpenStepOverride(isOpen ? 4 : 0)}
                  summary={
                    !hasHousehold
                      ? "Select a household before managing access."
                      : !isHouseholdAdmin
                        ? `This account has ${selectedHousehold?.role ?? "viewer"} access. Ask a household owner or parent to manage access.`
                        : `${activeAccessEntries.length} account${activeAccessEntries.length === 1 ? "" : "s"} active · ${pendingInvitationEntries.length} pending invitation${pendingInvitationEntries.length === 1 ? "" : "s"}`
                  }
                  title="Household access"
                >
                  <HouseholdAccessEditor
                    activeEntries={activeAccessEntries}
                    invitationEmail={invitationEmail}
                    invitationRole={invitationRole}
                    pendingEntries={pendingInvitationEntries}
                    status={status}
                    onInvitationEmailChange={setInvitationEmail}
                    onInvitationRoleChange={setInvitationRole}
                    onInvite={inviteHouseholdAccess}
                    onRevokeInvitation={revokeHouseholdAccessInvitation}
                  />
                  {activeStep === "access" && message ? (
                    <SetupStatusMessage message={message} status={status} />
                  ) : null}
                </WorkflowStep>

                <WorkflowStep
                  complete={false}
                  disabled={!hasMembers || !isHouseholdAdmin}
                  index={5}
                  isOpen={openStep === 5}
                  onOpenChange={(isOpen) => setOpenStepOverride(isOpen ? 5 : 0)}
                  summary={
                    !isHouseholdAdmin
                      ? `This account has ${selectedHousehold?.role ?? "viewer"} access. Ask a household owner or parent to manage routines.`
                      : "Create reusable routines and apply them to household members."
                  }
                  title="Routine templates"
                >
                  <AdminRoutineTemplates members={adminMembers} />
                </WorkflowStep>

                <WorkflowStep
                  complete={false}
                  disabled={!hasMembers || !isHouseholdAdmin}
                  index={6}
                  isOpen={openStep === 6}
                  onOpenChange={(isOpen) => setOpenStepOverride(isOpen ? 6 : 0)}
                  summary={
                    !isHouseholdAdmin
                      ? `This account has ${selectedHousehold?.role ?? "viewer"} access. Ask a household owner or parent to manage baseline flows.`
                      : "Define the household's baseline day flows in Supabase."
                  }
                  title="Baseline flows"
                >
                  <AdminBaselineTemplates defaultTemplates={defaultDayTemplates} />
                </WorkflowStep>

                <WorkflowStep
                  complete={false}
                  disabled={!hasMembers || !isHouseholdAdmin}
                  index={7}
                  isOpen={openStep === 7}
                  onOpenChange={(isOpen) => setOpenStepOverride(isOpen ? 7 : 0)}
                  summary={
                    !isHouseholdAdmin
                      ? `This account has ${selectedHousehold?.role ?? "viewer"} access. Ask a household owner or parent to manage calendar imports.`
                      : "Connect SportsEngine, school, family, or manual calendar sources."
                  }
                  title="Calendar imports"
                >
                  <AdminCalendarSources members={adminMembers} />
                </WorkflowStep>
              </>
            ) : null}
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

    return responseBody as CreatedHouseholdRow | null;
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

function getRecommendedOpenStep(
  authReady: boolean,
  hasAccount: boolean,
  hasHousehold: boolean,
  hasMembers: boolean,
) {
  if (!authReady) {
    return 0;
  }

  if (!hasAccount) {
    return 1;
  }

  if (!hasHousehold) {
    return 2;
  }

  if (!hasMembers) {
    return 3;
  }

  return 0;
}

function WorkflowStep({
  children,
  complete,
  disabled = false,
  index,
  isOpen,
  onOpenChange,
  summary,
  title,
}: Readonly<{
  children: React.ReactNode;
  complete: boolean;
  disabled?: boolean;
  index: number;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  summary: string;
  title: string;
}>) {
  return (
    <section className={`border border-[#cbd5df] bg-white shadow-sm ${disabled ? "opacity-60" : ""}`}>
      <button
        className="flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-4 text-left"
        disabled={disabled}
        onClick={() => onOpenChange(!isOpen)}
        type="button"
      >
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
            <p className="mt-1 text-sm text-[#657381]">{summary}</p>
          </div>
        </div>
        <span className="text-sm font-semibold text-[#1f6f8b]">
          {isOpen && !disabled ? "Close" : complete ? "Done" : "Open"}
        </span>
      </button>
      {isOpen && !disabled ? <div className="border-t border-[#d7e0e7] px-4 py-4">{children}</div> : null}
    </section>
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
          These names and birthdays become the durable member records used by dashboards, routines, chores, and calendar assignments.
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
            className="grid gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 md:grid-cols-[1fr_1fr_150px_120px_150px_auto]"
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
              <span className="font-semibold">Birthday</span>
              <input
                className="border border-[#d7e0e7] bg-white px-3 py-2"
                onChange={(event) => onUpdateMember(member.tempId, { birthDate: event.target.value })}
                required
                type="date"
                value={member.birthDate}
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

function HouseholdAccessEditor({
  activeEntries,
  invitationEmail,
  invitationRole,
  pendingEntries,
  status,
  onInvitationEmailChange,
  onInvitationRoleChange,
  onInvite,
  onRevokeInvitation,
}: Readonly<{
  activeEntries: HouseholdAccessEntryRow[];
  invitationEmail: string;
  invitationRole: InvitationRole;
  pendingEntries: HouseholdAccessEntryRow[];
  status: SetupStatus;
  onInvitationEmailChange: (value: string) => void;
  onInvitationRoleChange: (value: InvitationRole) => void;
  onInvite: () => void;
  onRevokeInvitation: (invitationId: string) => void;
}>) {
  return (
    <div className="grid gap-4">
      <p className="text-sm leading-6 text-[#4c5965]">
        Household access controls which adult accounts can open this household. Family members stay
        separate from access so children and profile records do not need login emails.
      </p>
      <div className="grid gap-3 border border-[#d7e0e7] bg-[#f8fafc] p-3 md:grid-cols-[1fr_180px_auto]">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Invite email</span>
          <input
            autoComplete="email"
            className="border border-[#d7e0e7] bg-white px-3 py-2"
            onChange={(event) => onInvitationEmailChange(event.target.value)}
            placeholder="name@example.com"
            type="email"
            value={invitationEmail}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Access role</span>
          <select
            className="border border-[#d7e0e7] bg-white px-3 py-2"
            onChange={(event) => onInvitationRoleChange(event.target.value as InvitationRole)}
            value={invitationRole}
          >
            <option value="parent">Parent</option>
            <option value="caregiver">Caregiver</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <button
          className="self-end border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={status === "loading" || !invitationEmail.trim()}
          onClick={onInvite}
          type="button"
        >
          Invite account
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="grid gap-2">
          <h3 className="text-lg font-semibold">Active access</h3>
          {activeEntries.length > 0 ? (
            <ul className="grid gap-2">
              {activeEntries.map((entry) => (
                <li
                  className="flex items-center justify-between gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3"
                  key={entry.entry_id}
                >
                  <div>
                    <p className="font-semibold">{entry.email}</p>
                    <p className="mt-1 text-xs text-[#657381]">
                      {formatHouseholdAccessRole(entry.role)} · Active
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptySetupState text="No accounts have access yet beyond the current household owner." />
          )}
        </section>
        <section className="grid gap-2">
          <h3 className="text-lg font-semibold">Pending invitations</h3>
          {pendingEntries.length > 0 ? (
            <ul className="grid gap-2">
              {pendingEntries.map((entry) => (
                <li
                  className="flex items-center justify-between gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3"
                  key={entry.entry_id}
                >
                  <div>
                    <p className="font-semibold">{entry.email}</p>
                    <p className="mt-1 text-xs text-[#657381]">
                      {formatHouseholdAccessRole(entry.role)}
                      {entry.invited_by_email ? ` · invited by ${entry.invited_by_email}` : ""}
                    </p>
                  </div>
                  <button
                    className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#8a2f2f]"
                    disabled={status === "loading"}
                    onClick={() => onRevokeInvitation(entry.entry_id)}
                    type="button"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptySetupState text="No pending invitations." />
          )}
        </section>
      </div>
    </div>
  );
}

function EmptySetupState({ text }: { text: string }) {
  return <p className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm text-[#657381]">{text}</p>;
}

async function loadHouseholdWorkflowState(selectedHouseholdId: string, includeAccessEntries: boolean) {
  const supabase = createBrowserSupabaseClient();
  const { data: members, error: membersError } = await supabase
    .from("household_members")
    .select("id, external_key, preferred_name, display_name, role, relationship, birth_date")
    .eq("household_id", selectedHouseholdId)
    .order("role", { ascending: false })
    .order("preferred_name", { ascending: true })
    .returns<HouseholdMemberRow[]>();

  if (membersError) {
    throw membersError;
  }

  const accessEntries = includeAccessEntries
    ? await loadHouseholdAccessState(selectedHouseholdId)
    : [];

  return {
    accessEntries,
    members: members ?? [],
  };
}

async function loadHouseholdAccessState(selectedHouseholdId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .rpc("get_household_access_state", {
      target_household_id: selectedHouseholdId,
    })
    .returns<HouseholdAccessEntryRow[]>();

  if (error) {
    throw error;
  }

  const accessEntries = Array.isArray(data) ? data : [];

  return accessEntries.sort((first: HouseholdAccessEntryRow, second: HouseholdAccessEntryRow) => {
    if (first.entry_type !== second.entry_type) {
      return first.entry_type.localeCompare(second.entry_type);
    }

    return first.email.localeCompare(second.email);
  });
}

async function inviteUserToHousehold(
  selectedHouseholdId: string,
  invitationEmail: string,
  invitationRole: InvitationRole,
): Promise<InvitationRow> {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .rpc("invite_user_to_household", {
      invite_role: invitationRole,
      invited_email: invitationEmail,
      target_household_id: selectedHouseholdId,
    })
    .returns<InvitationRow | InvitationRow[]>();

  if (error) {
    throw error;
  }

  const invitation = Array.isArray(data) ? data[0] : data;

  if (
    !invitation ||
    typeof invitation !== "object" ||
    !("invited_email" in invitation) ||
    typeof invitation.invited_email !== "string"
  ) {
    throw new Error("Supabase did not return the saved invitation.");
  }

  return invitation;
}

async function revokeHouseholdInvitation(invitationId: string) {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.rpc("revoke_household_invitation", {
    target_invitation_id: invitationId,
  });

  if (error) {
    throw error;
  }
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

function formatHouseholdAccessRole(role: string) {
  switch (role) {
    case "owner":
      return "Owner";
    case "parent":
      return "Parent";
    case "caregiver":
      return "Caregiver";
    case "viewer":
      return "Viewer";
    default:
      return role;
  }
}

function getValidMemberDrafts(members: MemberDraft[]) {
  return members
    .map((member) => ({
      ...member,
      displayName: member.displayName.trim(),
      birthDate: member.birthDate.trim(),
      externalKey: member.externalKey.trim() || createMemberExternalKey(member.preferredName),
      preferredName: member.preferredName.trim(),
      relationship: member.relationship.trim(),
    }))
    .filter((member) => member.preferredName && member.externalKey && member.birthDate);
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
