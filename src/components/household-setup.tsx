"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { normalizeCurrencyAmount } from "@/lib/allowance/storage";
import { AdminActivitySponsorships } from "@/components/admin-activity-sponsorships";
import { AdminBaselineTemplates } from "@/components/admin-baseline-templates";
import { AdminCalendarSources } from "@/components/admin-calendar-sources";
import { AdminRoutineTemplates } from "@/components/admin-routine-templates";
import { ConsolePageHeader } from "@/components/console-page-header";
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
  archived_at: string | null;
  birth_date: string | null;
  display_name: string | null;
  external_key: string;
  id: string;
  metadata: {
    morningRoutineAllowanceAmount?: number;
  };
  preferred_name: string;
  relationship: string | null;
  role: "parent" | "child";
  status: "active" | "archived";
};

type MemberDraft = {
  birthDate: string;
  displayName: string;
  externalKey: string;
  householdMemberId: string | null;
  morningRoutineAllowanceAmount: string;
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
  const activeHouseholdMembers = householdMembers.filter((member) => member.status === "active");
  const archivedHouseholdMembers = householdMembers.filter((member) => member.status === "archived");
  const hasMembers = activeHouseholdMembers.length > 0;
  const setupProgress = [hasAccount, hasHousehold, hasMembers].filter(Boolean).length;
  const recommendedOpenStep = getRecommendedOpenStep(authReady, hasAccount, hasHousehold, hasMembers);
  const openStep = openStepOverride ?? recommendedOpenStep;
  const activeAccessEntries = householdAccessEntries.filter((entry) => entry.entry_type === "member");
  const pendingInvitationEntries = householdAccessEntries.filter((entry) => entry.entry_type === "invitation");
  const adminMembers = useMemo(() => {
    if (activeHouseholdMembers.length === 0) {
      return plannerMembers;
    }

    return activeHouseholdMembers.map(mapRemoteMemberToPlannerMember);
  }, [activeHouseholdMembers, plannerMembers]);

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

        const nextActiveMembers = nextState.members.filter((member) => member.status === "active");

        setHouseholdMembers(nextState.members);
        setHouseholdAccessEntries(nextState.accessEntries);
        setMemberDrafts(
          nextActiveMembers.length > 0 ? nextActiveMembers.map(mapRemoteMemberToDraft) : [emptyMemberDraft],
        );
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
      setRefreshVersion((current) => current + 1);

      try {
        await sendHouseholdAccessInviteEmail(invitation.invited_email);
      } catch (error) {
        throw new Error(
          `Invitation saved for ${invitation.invited_email}, but the email could not be sent: ${getSupabaseLikeErrorMessage(error, "Could not send the invite email.")}`,
        );
      }

      setInvitationEmail("");
      setInvitationRole("parent");
      return `Invitation saved for ${invitation.invited_email}. Email sent.`;
    }, "access");
  }

  async function resendHouseholdAccessInvitation(invitationEmailToResend: string) {
    await runSetupAction(async () => {
      const normalizedInvitationEmail = invitationEmailToResend.trim().toLowerCase();

      await sendHouseholdAccessInviteEmail(normalizedInvitationEmail);
      return `Invite email resent to ${normalizedInvitationEmail}.`;
    }, "access");
  }

  async function revokeHouseholdAccessInvitation(invitationId: string) {
    await runSetupAction(async () => {
      await revokeHouseholdInvitation(invitationId);
      setRefreshVersion((current) => current + 1);
      return "Invitation revoked.";
    }, "access");
  }

  async function archiveMember(memberId: string) {
    const memberToArchive = householdMembers.find((member) => member.id === memberId);
    const memberLabel =
      memberToArchive?.preferred_name || memberToArchive?.display_name || "this family member";
    const shouldArchive = window.confirm(
      `Archive ${memberLabel}? Their history will stay in Supabase, but they will stop appearing in normal household views until restored.`,
    );

    if (!shouldArchive) {
      return;
    }

    await runSetupAction(async () => {
      const member = await archiveHouseholdMember(memberId);
      setRefreshVersion((current) => current + 1);
      return `${member.preferred_name} archived.`;
    }, "members");
  }

  async function restoreMember(memberId: string) {
    await runSetupAction(async () => {
      const member = await restoreHouseholdMember(memberId);
      setRefreshVersion((current) => current + 1);
      return `${member.preferred_name} restored.`;
    }, "members");
  }

  async function saveMemberDrafts(householdId: string) {
    const supabase = createBrowserSupabaseClient();
    const memberRows = getValidMemberDrafts(memberDrafts);

    if (memberRows.length === 0) {
      return;
    }

    const { error } = await supabase.from("household_members").upsert(
      memberRows.map((member) => {
        const morningRoutineAllowanceAmount =
          member.role === "child" ? normalizeCurrencyAmount(member.morningRoutineAllowanceAmount) : undefined;

        return {
          archived_at: null,
          household_id: householdId,
          external_key: member.externalKey,
          preferred_name: member.preferredName,
          display_name: member.displayName || member.preferredName,
          role: member.role,
          relationship: member.relationship || null,
          birth_date: member.birthDate || null,
          status: "active",
          metadata: morningRoutineAllowanceAmount
            ? {
                morningRoutineAllowanceAmount,
              }
            : {},
        };
      }),
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
    const memberToRemove = memberDrafts.find((member) => member.tempId === tempId);

    if (!memberToRemove) {
      return;
    }

    const memberLabel = memberToRemove.preferredName || memberToRemove.displayName || "this family member";
    const shouldRemove = window.confirm(
      `Remove ${memberLabel} from this draft list? This only changes the unsaved list on this page. It does not delete the Supabase record.`,
    );

    if (!shouldRemove) {
      return;
    }

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
              morningRoutineAllowanceAmount:
                patch.role === "parent" ? "" : patch.morningRoutineAllowanceAmount ?? member.morningRoutineAllowanceAmount,
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
      <ConsolePageHeader
        activePage="admin"
        aside={
          <div className="border border-[#cbd5df] bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#657381]">Progress</p>
            <p className="mt-1 text-2xl font-semibold">{setupProgress}/3</p>
          </div>
        }
        description="Finish the pieces that make this device-backed family dashboard durable across devices."
        eyebrow="Household setup"
        title="Setup workflow"
      />

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
                          ? `${activeHouseholdMembers.length} member${activeHouseholdMembers.length === 1 ? "" : "s"} saved`
                          : "Add the people who should appear on dashboards and assignments."
                  }
                  title="Family members"
                >
                  <MemberDraftEditor
                    archivedMembers={archivedHouseholdMembers}
                    drafts={memberDrafts}
                    onAddMember={addMember}
                    onArchiveMember={archiveMember}
                    onLoadPlannerMembers={loadPlannerMembers}
                    onRemoveMember={removeMember}
                    onRestoreMember={restoreMember}
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
                    onResendInvitation={resendHouseholdAccessInvitation}
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

                <WorkflowStep
                  complete={false}
                  disabled={!hasMembers || !selectedHouseholdId}
                  index={8}
                  isOpen={openStep === 8}
                  onOpenChange={(isOpen) => setOpenStepOverride(isOpen ? 8 : 0)}
                  summary={
                    !selectedHouseholdId
                      ? "Select a household before configuring activity challenges."
                      : !isHouseholdAdmin
                        ? `This account has ${selectedHousehold?.role ?? "viewer"} access. Ask a household owner or parent to manage activity sponsorships.`
                        : "Optional challenge amounts for tracked activities."
                  }
                  title="Activity sponsorships"
                >
                  <AdminActivitySponsorships
                    householdId={selectedHouseholdId}
                    isHouseholdAdmin={isHouseholdAdmin}
                  />
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
  archivedMembers,
  drafts,
  onAddMember,
  onArchiveMember,
  onLoadPlannerMembers,
  onRemoveMember,
  onRestoreMember,
  onSave,
  onUpdateMember,
  status,
}: Readonly<{
  archivedMembers: HouseholdMemberRow[];
  drafts: MemberDraft[];
  onAddMember: (role: "parent" | "child") => void;
  onArchiveMember: (memberId: string) => void;
  onLoadPlannerMembers: () => void;
  onRemoveMember: (tempId: string) => void;
  onRestoreMember: (memberId: string) => void;
  onSave: () => void;
  onUpdateMember: (tempId: string, patch: Partial<MemberDraft>) => void;
  status: SetupStatus;
}>) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm leading-6 text-[#4c5965]">
          These names and birthdays become the durable member records used by dashboards, routines,
          chores, and calendar assignments. Child members can also earn a daily morning routine
          credit when every item in that category is checked off.
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
        {drafts.map((member) => {
          const isSavedMember = Boolean(member.householdMemberId);

          return (
            <li
              className="grid gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 md:grid-cols-[1fr_1fr_150px_120px_150px_140px_auto]"
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
                  onChange={(event) =>
                    onUpdateMember(member.tempId, { role: event.target.value as "parent" | "child" })
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
                  onChange={(event) => onUpdateMember(member.tempId, { relationship: event.target.value })}
                  value={member.relationship}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-semibold">Morning credit</span>
                <input
                  className="border border-[#d7e0e7] bg-white px-3 py-2 disabled:bg-[#eef2f6] disabled:text-[#9aa5b1]"
                  disabled={member.role !== "child"}
                  inputMode="decimal"
                  min="0"
                  onChange={(event) =>
                    onUpdateMember(member.tempId, { morningRoutineAllowanceAmount: event.target.value })
                  }
                  placeholder={member.role === "child" ? "0.25" : "Child only"}
                  step="0.01"
                  type="number"
                  value={member.morningRoutineAllowanceAmount}
                />
              </label>
              <button
                className="self-end border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#8a2f2f]"
                disabled={status === "loading"}
                onClick={() =>
                  isSavedMember && member.householdMemberId
                    ? onArchiveMember(member.householdMemberId)
                    : onRemoveMember(member.tempId)
                }
                type="button"
              >
                {isSavedMember ? "Archive" : "Discard"}
              </button>
            </li>
          );
        })}
      </ol>
      <button
        className="justify-self-start border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        disabled={status === "loading" || getValidMemberDrafts(drafts).length === 0}
        onClick={onSave}
        type="button"
      >
        Save family members
      </button>
      {archivedMembers.length > 0 ? (
        <section className="grid gap-3 border border-[#d7e0e7] bg-white p-4 shadow-sm">
          <div>
            <h3 className="text-lg font-semibold">Archived members</h3>
            <p className="mt-1 text-sm leading-6 text-[#4c5965]">
              Archived members stay out of chores, routines, and dashboards until restored.
            </p>
          </div>
          <ul className="grid gap-2">
            {archivedMembers.map((member) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3"
                key={member.id}
              >
                <div>
                  <p className="font-semibold">{member.display_name ?? member.preferred_name}</p>
                  <p className="mt-1 text-xs text-[#657381]">
                    {formatHouseholdMemberRole(member.role)}
                    {member.relationship ? ` · ${member.relationship}` : ""}
                    {member.archived_at ? ` · Archived ${formatCompactDate(member.archived_at)}` : ""}
                  </p>
                </div>
                <button
                  className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#1f6f8b]"
                  disabled={status === "loading"}
                  onClick={() => onRestoreMember(member.id)}
                  type="button"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
  onResendInvitation,
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
  onResendInvitation: (invitationEmail: string) => void;
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#1f6f8b]"
                      disabled={status === "loading"}
                      onClick={() => onResendInvitation(entry.email)}
                      type="button"
                    >
                      Resend invite
                    </button>
                    <button
                      className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#8a2f2f]"
                      disabled={status === "loading"}
                      onClick={() => onRevokeInvitation(entry.entry_id)}
                      type="button"
                    >
                      Revoke
                    </button>
                  </div>
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
    .select("id, external_key, preferred_name, display_name, role, relationship, birth_date, metadata, status, archived_at")
    .eq("household_id", selectedHouseholdId)
    .order("status", { ascending: true })
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

async function sendHouseholdAccessInviteEmail(invitationEmail: string) {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: invitationEmail,
    options: {
      emailRedirectTo: getAuthRedirectTo(),
      shouldCreateUser: true,
    },
  });

  if (error) {
    throw error;
  }
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

async function archiveHouseholdMember(memberId: string): Promise<HouseholdMemberRow> {
  return mutateHouseholdMember(memberId, "archive_household_member");
}

async function restoreHouseholdMember(memberId: string): Promise<HouseholdMemberRow> {
  return mutateHouseholdMember(memberId, "restore_household_member");
}

async function mutateHouseholdMember(
  memberId: string,
  rpcName: "archive_household_member" | "restore_household_member",
): Promise<HouseholdMemberRow> {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .rpc(rpcName, {
      target_member_id: memberId,
    })
    .returns<HouseholdMemberRow | HouseholdMemberRow[]>();

  if (error) {
    throw error;
  }

  const member = Array.isArray(data) ? data[0] : data;

  if (
    !member ||
    typeof member !== "object" ||
    !("id" in member) ||
    typeof member.id !== "string" ||
    !("preferred_name" in member) ||
    typeof member.preferred_name !== "string"
  ) {
    throw new Error("Supabase did not return the saved family member.");
  }

  return member;
}

function mapRemoteMemberToPlannerMember(member: HouseholdMemberRow): HouseholdMember {
  return {
    id: member.external_key,
    preferredName: member.preferred_name,
    displayName: member.display_name ?? member.preferred_name,
    morningRoutineAllowanceAmount: normalizeCurrencyAmount(
      member.metadata?.morningRoutineAllowanceAmount,
    ),
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
    householdMemberId: member.id,
    morningRoutineAllowanceAmount: member.metadata?.morningRoutineAllowanceAmount
      ? String(member.metadata.morningRoutineAllowanceAmount)
      : "",
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
    householdMemberId: null,
    morningRoutineAllowanceAmount: "",
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
    householdMemberId: null,
    morningRoutineAllowanceAmount: member.morningRoutineAllowanceAmount
      ? String(member.morningRoutineAllowanceAmount)
      : "",
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

function formatHouseholdMemberRole(role: "parent" | "child") {
  return role === "parent" ? "Parent" : "Child";
}

function formatCompactDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getValidMemberDrafts(members: MemberDraft[]) {
  return members
    .map((member) => ({
      ...member,
      displayName: member.displayName.trim(),
      birthDate: member.birthDate.trim(),
      externalKey: member.externalKey.trim() || createMemberExternalKey(member.preferredName),
      morningRoutineAllowanceAmount: member.morningRoutineAllowanceAmount.trim(),
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
