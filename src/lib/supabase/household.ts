"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "./client";

type HouseholdStatus = "loading" | "ready" | "signed-out" | "unconfigured" | "error";

type HouseholdMembershipRow = {
  household_id: string;
  role: string;
};

type HouseholdRow = {
  id: string;
  name: string;
  timezone: string;
};

type HouseholdSnapshot = {
  errorMessage: string;
  household: CurrentHousehold | null;
  status: HouseholdStatus;
};

export type CurrentHousehold = {
  householdId: string;
  householdName: string;
  timezone: string;
  role: string;
};

let currentHouseholdSnapshot: HouseholdSnapshot = {
  errorMessage: "",
  household: null,
  status: "loading",
};

export function useCurrentHousehold() {
  const [household, setHousehold] = useState<CurrentHousehold | null>(
    currentHouseholdSnapshot.household,
  );
  const [status, setStatus] = useState<HouseholdStatus>(currentHouseholdSnapshot.status);
  const [errorMessage, setErrorMessage] = useState(currentHouseholdSnapshot.errorMessage);

  const updateSnapshot = useCallback((snapshot: HouseholdSnapshot) => {
    currentHouseholdSnapshot = snapshot;
    setHousehold(snapshot.household);
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
          errorMessage: "",
          household: null,
          status: "signed-out",
        });
        return;
      }

      const { data: memberships, error: membershipError } = await supabase
        .from("household_users")
        .select("household_id, role")
        .order("created_at", { ascending: true })
        .limit(1)
        .returns<HouseholdMembershipRow[]>();

      if (membershipError) {
        throw membershipError;
      }

      const membership = memberships?.[0];

      if (!membership) {
        updateSnapshot({
          errorMessage: "",
          household: null,
          status: "unconfigured",
        });
        return;
      }

      const { data: householdRow, error: householdError } = await supabase
        .from("households")
        .select("id, name, timezone")
        .eq("id", membership.household_id)
        .single<HouseholdRow>();

      if (householdError) {
        throw householdError;
      }

      updateSnapshot({
        errorMessage: "",
        household: {
          householdId: householdRow.id,
          householdName: householdRow.name,
          timezone: householdRow.timezone,
          role: membership.role,
        },
        status: "ready",
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("NEXT_PUBLIC_SUPABASE")) {
        updateSnapshot({
          errorMessage: error.message,
          household: null,
          status: "unconfigured",
        });
        return;
      }

      updateSnapshot({
        errorMessage: error instanceof Error ? error.message : "Could not load household.",
        household: null,
        status: "error",
      });
    }
  }, [updateSnapshot]);

  useEffect(() => {
    let isActive = true;
    let subscription: { unsubscribe: () => void } | undefined;

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
      } catch {
        // The first refresh already exposes configuration errors to callers.
      }
    }

    void load();

    return () => {
      isActive = false;
      subscription?.unsubscribe();
    };
  }, [refresh]);

  return {
    errorMessage,
    household,
    refresh,
    status,
  };
}
