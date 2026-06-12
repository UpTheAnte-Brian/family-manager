"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "./client";
import { getSupabaseLikeErrorMessage } from "./error-message";
import {
  clearStoredHouseholdSelection,
  readStoredHouseholdSelection,
  resolveActiveHouseholdId,
  subscribeToHouseholdSelection,
  writeStoredHouseholdSelection,
} from "./household-selection";

type HouseholdStatus = "loading" | "ready" | "signed-out" | "unconfigured" | "error";

type HouseholdMembershipRow = {
  created_at: string;
  household_id: string;
  role: string;
};

type HouseholdRow = {
  id: string;
  name: string;
  timezone: string;
};

type HouseholdSnapshot = {
  authUserId: string;
  errorMessage: string;
  household: CurrentHousehold | null;
  households: CurrentHousehold[];
  status: HouseholdStatus;
};

export type CurrentHousehold = {
  householdId: string;
  householdName: string;
  timezone: string;
  role: string;
};

let currentHouseholdSnapshot: HouseholdSnapshot = {
  authUserId: "",
  errorMessage: "",
  household: null,
  households: [],
  status: "loading",
};

export function useCurrentHousehold() {
  const [household, setHousehold] = useState<CurrentHousehold | null>(
    currentHouseholdSnapshot.household,
  );
  const [households, setHouseholds] = useState<CurrentHousehold[]>(currentHouseholdSnapshot.households);
  const [status, setStatus] = useState<HouseholdStatus>(currentHouseholdSnapshot.status);
  const [errorMessage, setErrorMessage] = useState(currentHouseholdSnapshot.errorMessage);

  const updateSnapshot = useCallback((snapshot: HouseholdSnapshot) => {
    currentHouseholdSnapshot = snapshot;
    setHousehold(snapshot.household);
    setHouseholds(snapshot.households);
    setStatus(snapshot.status);
    setErrorMessage(snapshot.errorMessage);
  }, []);

  const refresh = useCallback(async () => {
    try {
      updateSnapshot({
        ...currentHouseholdSnapshot,
        errorMessage: "",
        status: currentHouseholdSnapshot.household ? "ready" : "loading",
      });

      const supabase = createBrowserSupabaseClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!sessionData.session) {
        updateSnapshot({
          authUserId: "",
          errorMessage: "",
          household: null,
          households: [],
          status: "signed-out",
        });
        return;
      }

      const authUserId = sessionData.session.user.id;
      const { data: claimedInvitations, error: claimError } = await supabase
        .rpc("claim_household_invitations_for_current_user")
        .returns<ClaimedInvitationRow[]>();

      if (claimError) {
        throw claimError;
      }

      const claimedInvitationRows = Array.isArray(claimedInvitations) ? claimedInvitations : [];

      const { data: memberships, error: membershipError } = await supabase
        .from("household_users")
        .select("created_at, household_id, role")
        .order("created_at", { ascending: true })
        .returns<HouseholdMembershipRow[]>();

      if (membershipError) {
        throw membershipError;
      }

      const membershipRows = memberships ?? [];

      if (membershipRows.length === 0) {
        clearStoredHouseholdSelection(authUserId);
        updateSnapshot({
          authUserId,
          errorMessage: "",
          household: null,
          households: [],
          status: "unconfigured",
        });
        return;
      }

      const householdIds = [...new Set(membershipRows.map((membership) => membership.household_id))];
      const { data: householdRow, error: householdError } = await supabase
        .from("households")
        .select("id, name, timezone")
        .in("id", householdIds)
        .returns<HouseholdRow[]>();

      if (householdError) {
        throw householdError;
      }

      const membershipByHouseholdId = new Map(
        membershipRows.map((membership) => [membership.household_id, membership]),
      );
      const accessibleHouseholds = (householdRow ?? [])
        .map((row) => {
          const membership = membershipByHouseholdId.get(row.id);

          return membership
            ? {
                householdId: row.id,
                householdName: row.name,
                role: membership.role,
                timezone: row.timezone,
              }
            : null;
        })
        .filter((household): household is CurrentHousehold => household !== null)
        .sort((first, second) => first.householdName.localeCompare(second.householdName));
      const claimedHouseholdId = claimedInvitationRows[0]?.household_id ?? "";
      const nextHouseholdId = resolveActiveHouseholdId({
        households: accessibleHouseholds,
        preferredHouseholdId: readStoredHouseholdSelection(authUserId) || claimedHouseholdId,
        previousHouseholdId:
          currentHouseholdSnapshot.authUserId === authUserId
            ? currentHouseholdSnapshot.household?.householdId
            : undefined,
      });
      const activeHousehold =
        accessibleHouseholds.find((candidate) => candidate.householdId === nextHouseholdId) ??
        accessibleHouseholds[0] ??
        null;

      if (activeHousehold) {
        writeStoredHouseholdSelection(authUserId, activeHousehold.householdId);
      }

      updateSnapshot({
        authUserId,
        errorMessage: "",
        household: activeHousehold,
        households: accessibleHouseholds,
        status: "ready",
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("NEXT_PUBLIC_SUPABASE")) {
        updateSnapshot({
          authUserId: "",
          errorMessage: error.message,
          household: null,
          households: [],
          status: "unconfigured",
        });
        return;
      }

      updateSnapshot({
        authUserId: currentHouseholdSnapshot.authUserId,
        errorMessage: getSupabaseLikeErrorMessage(error, "Could not load household."),
        household: null,
        households: [],
        status: "error",
      });
    }
  }, [updateSnapshot]);

  const selectHousehold = useCallback(
    (householdId: string) => {
      const authUserId = currentHouseholdSnapshot.authUserId;

      if (!authUserId) {
        return;
      }

      const nextHousehold =
        currentHouseholdSnapshot.households.find((candidate) => candidate.householdId === householdId) ?? null;

      if (!nextHousehold) {
        return;
      }

      writeStoredHouseholdSelection(authUserId, nextHousehold.householdId);
      updateSnapshot({
        ...currentHouseholdSnapshot,
        household: nextHousehold,
      });
    },
    [updateSnapshot],
  );

  useEffect(() => {
    let isActive = true;
    let subscription: { unsubscribe: () => void } | undefined;
    let unsubscribeSelection: (() => void) | undefined;

    async function load() {
      if (isActive) {
        await refresh();
      }

      try {
        const supabase = createBrowserSupabaseClient();
        const { data } = supabase.auth.onAuthStateChange(() => {
          void refresh();
        });
        subscription = data.subscription;
        unsubscribeSelection = subscribeToHouseholdSelection(() => {
          const authUserId = currentHouseholdSnapshot.authUserId;

          if (!authUserId || currentHouseholdSnapshot.households.length === 0) {
            return;
          }

          const nextHouseholdId = resolveActiveHouseholdId({
            households: currentHouseholdSnapshot.households,
            preferredHouseholdId: readStoredHouseholdSelection(authUserId),
            previousHouseholdId: currentHouseholdSnapshot.household?.householdId,
          });
          const nextHousehold =
            currentHouseholdSnapshot.households.find((candidate) => candidate.householdId === nextHouseholdId) ??
            currentHouseholdSnapshot.household;

          if (!nextHousehold || nextHousehold.householdId === currentHouseholdSnapshot.household?.householdId) {
            return;
          }

          updateSnapshot({
            ...currentHouseholdSnapshot,
            household: nextHousehold,
          });
        });
      } catch {
        // The first refresh already exposes configuration errors to callers.
      }
    }

    void load();

    return () => {
      isActive = false;
      subscription?.unsubscribe();
      unsubscribeSelection?.();
    };
  }, [refresh, updateSnapshot]);

  return {
    errorMessage,
    household,
    households,
    refresh,
    selectHousehold,
    status,
  };
}

type ClaimedInvitationRow = {
  household_id: string;
};
