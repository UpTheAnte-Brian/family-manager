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

export type CurrentHousehold = {
  householdId: string;
  householdName: string;
  timezone: string;
  role: string;
};

export function useCurrentHousehold() {
  const [household, setHousehold] = useState<CurrentHousehold | null>(null);
  const [status, setStatus] = useState<HouseholdStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      setStatus("loading");
      setErrorMessage("");

      const supabase = createBrowserSupabaseClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!sessionData.session) {
        setHousehold(null);
        setStatus("signed-out");
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
        setHousehold(null);
        setStatus("unconfigured");
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

      setHousehold({
        householdId: householdRow.id,
        householdName: householdRow.name,
        timezone: householdRow.timezone,
        role: membership.role,
      });
      setStatus("ready");
    } catch (error) {
      setHousehold(null);

      if (error instanceof Error && error.message.includes("NEXT_PUBLIC_SUPABASE")) {
        setStatus("unconfigured");
        setErrorMessage(error.message);
        return;
      }

      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Could not load household.");
    }
  }, []);

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
