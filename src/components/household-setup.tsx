"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type SetupStatus = "idle" | "loading" | "success" | "error";

export function HouseholdSetup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SetupStatus>("idle");
  const [message, setMessage] = useState("");
  const [isConfigured, setIsConfigured] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function loadSession() {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data } = await supabase.auth.getSession();

        if (!isActive) {
          return;
        }

        setSession(data.session);
        setEmail(data.session?.user.email ?? "");

        const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
          setSession(nextSession);
          setEmail(nextSession?.user.email ?? "");
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
      });

      if (error) {
        throw error;
      }

      setSession(data.session);

      if (!data.session) {
        return "Check your email to confirm the account, then return here and sign in.";
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

      return `Created ${data?.name ?? "household"}. Next, add household members and move app data into normalized Supabase tables.`;
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
              </div>
            </section>

            <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
              <h2 className="text-xl font-semibold">Household</h2>
              <p className="mt-2 text-sm leading-6 text-[#4c5965]">
                Create a household for this account. This does not copy Johnson family browser
                state or calendar data; those will be moved into normalized household tables next.
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
              <button
                className="mt-4 border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={status === "loading" || !session || !householdName.trim()}
                onClick={createHousehold}
                type="button"
              >
                Create household
              </button>
            </section>

            {message ? (
              <p
                className={`border px-3 py-3 text-sm ${
                  status === "error"
                    ? "border-[#d7a7a7] bg-[#fff7f7] text-[#8a2f2f]"
                    : "border-[#cbd5df] bg-white text-[#2f6f73]"
                }`}
              >
                {message}
              </p>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
