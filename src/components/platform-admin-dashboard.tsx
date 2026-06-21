"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import type { Session } from "@supabase/supabase-js";
import { ConsolePageHeader } from "@/components/console-page-header";
import { buildHouseholdLocationLabel } from "@/lib/households/location";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { getSupabaseLikeErrorMessage } from "@/lib/supabase/error-message";

type PlatformHouseholdRow = {
  administrative_area: string | null;
  country_code: string | null;
  created_at: string;
  formatted_address: string | null;
  household_id: string;
  household_name: string;
  latitude: number | null;
  locality: string | null;
  longitude: number | null;
  postal_code: string | null;
  timezone: string;
};

type PlatformState = "idle" | "loading" | "ready" | "error";
type LocatedPlatformHousehold = PlatformHouseholdRow & {
  latitude: number;
  longitude: number;
};

type GoogleMarker = {
  addListener: (eventName: string, handler: () => void) => void;
  getPosition: () => unknown;
  setMap: (map: GoogleMap | null) => void;
};

type GoogleMap = {
  fitBounds: (bounds: GoogleLatLngBounds, padding?: number) => void;
};

type GoogleLatLngBounds = {
  extend: (value: unknown) => void;
};

type GoogleInfoWindow = {
  open: (options: { anchor: GoogleMarker; map: GoogleMap }) => void;
  setContent: (content: string) => void;
};

type GoogleMapsApi = {
  InfoWindow: new () => GoogleInfoWindow;
  LatLngBounds: new () => GoogleLatLngBounds;
  Map: new (
    element: HTMLDivElement,
    options: {
      center: {
        lat: number;
        lng: number;
      };
      disableDefaultUI: boolean;
      gestureHandling: string;
      zoom: number;
    },
  ) => GoogleMap;
  Marker: new (options: {
    map: GoogleMap;
    position: {
      lat: number;
      lng: number;
    };
    title: string;
  }) => GoogleMarker;
};

export function PlatformAdminDashboard() {
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [households, setHouseholds] = useState<PlatformHouseholdRow[]>([]);
  const [isConfigured, setIsConfigured] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<PlatformState>("idle");
  const [mapsReady, setMapsReady] = useState(false);

  const locatedHouseholds = useMemo(
    () =>
      households.filter(
        (household) =>
          typeof household.latitude === "number" && Number.isFinite(household.latitude) &&
          typeof household.longitude === "number" && Number.isFinite(household.longitude),
      ) as LocatedPlatformHousehold[],
    [households],
  );
  const regionCount = useMemo(
    () =>
      new Set(
        locatedHouseholds.map((household) =>
          [household.country_code ?? "", household.administrative_area ?? ""].join(":"),
        ),
      ).size,
    [locatedHouseholds],
  );

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
        setAuthReady(true);

        const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
          setSession(nextSession);
          setEmail(nextSession?.user.email ?? "");
        });

        return listener.subscription;
      } catch (error) {
        if (!isActive) {
          return;
        }

        setIsConfigured(false);
        setAuthReady(true);
        setState("error");
        setMessage(getSupabaseLikeErrorMessage(error, "Supabase is not configured."));
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
    if (!authReady) {
      return;
    }

    if (!session) {
      return;
    }

    let isActive = true;
    const accessToken = session.access_token;

    async function loadPlatformData() {
      setState("loading");
      setMessage("");

      try {
        const supabase = createBrowserSupabaseClient();
        let platformAdmin = await readPlatformAdminStatus(supabase);

        if (!platformAdmin) {
          await bootstrapPlatformAdmin(accessToken);
          platformAdmin = await readPlatformAdminStatus(supabase);
        }

        if (!platformAdmin) {
          throw new Error("This account does not have platform admin access.");
        }

        const { data, error } = await supabase
          .rpc("get_platform_household_map")
          .returns<PlatformHouseholdRow[]>();

        if (error) {
          throw error;
        }

        if (!isActive) {
          return;
        }

        setIsPlatformAdmin(true);
        setHouseholds(Array.isArray(data) ? data : []);
        setState("ready");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setIsPlatformAdmin(false);
        setHouseholds([]);
        setState("error");
        setMessage(getSupabaseLikeErrorMessage(error, "Could not load platform households."));
      }
    }

    void loadPlatformData();

    return () => {
      isActive = false;
    };
  }, [authReady, session]);

  async function signIn() {
    setState("loading");
    setMessage("");

    try {
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
      setState("idle");
    } catch (error) {
      setState("error");
      setMessage(getSupabaseLikeErrorMessage(error, "Could not sign in."));
    }
  }

  async function signOut() {
    setState("loading");
    setMessage("");

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      setSession(null);
      setHouseholds([]);
      setIsPlatformAdmin(false);
      setMessage("");
      setPassword("");
      setState("idle");
    } catch (error) {
      setState("error");
      setMessage(getSupabaseLikeErrorMessage(error, "Could not sign out."));
    }
  }

  return (
    <main className="min-h-screen bg-[#eef2f6] text-[#17202a]">
      <ConsolePageHeader
        activePage="platform"
        aside={
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard label="Households" value={String(households.length)} />
            <MetricCard label="Mapped" value={String(locatedHouseholds.length)} />
            <MetricCard label="Regions" value={String(regionCount)} />
          </div>
        }
        description="A platform-only view of household footprint and signup coverage."
        eyebrow="Platform admin"
        title="Household map"
      />

      {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? (
        <Script
          onLoad={() => setMapsReady(true)}
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&loading=async`}
          strategy="afterInteractive"
        />
      ) : null}

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5 sm:px-8 lg:px-10">
        {!isConfigured ? (
          <StateCard title="Supabase is not configured">{message}</StateCard>
        ) : !authReady ? (
          <StateCard title="Checking platform session">
            Restoring your Supabase session before loading platform access.
          </StateCard>
        ) : !session ? (
          <section className="grid gap-4 border border-[#cbd5df] bg-white p-4 shadow-sm">
            <div>
              <h2 className="text-xl font-semibold">Platform admin sign in</h2>
              <p className="mt-2 text-sm leading-6 text-[#4c5965]">
                Sign in with the account that should have platform visibility.
              </p>
            </div>
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
                autoComplete="current-password"
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                className="border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={state === "loading" || !email || !password}
                onClick={signIn}
                type="button"
              >
                Sign in
              </button>
            </div>
            {message ? <StatusMessage message={message} state={state} /> : null}
          </section>
        ) : (
          <>
            <section className="flex flex-wrap items-center justify-between gap-3 border border-[#cbd5df] bg-white p-4 shadow-sm">
              <div>
                <p className="text-sm font-semibold">{session.user.email}</p>
                <p className="mt-1 text-sm text-[#657381]">
                  {isPlatformAdmin
                    ? "Platform admin access verified."
                    : "Signed in. Verifying platform admin access."}
                </p>
              </div>
              <button
                className="border border-[#d7e0e7] bg-white px-4 py-2 text-sm font-semibold text-[#33414f]"
                disabled={state === "loading"}
                onClick={signOut}
                type="button"
              >
                Sign out
              </button>
            </section>

            {message ? <StatusMessage message={message} state={state} /> : null}

            {state === "ready" && isPlatformAdmin ? (
              <>
                <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
                  <div className="border border-[#cbd5df] bg-white p-4 shadow-sm">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-xl font-semibold">Household locations</h2>
                        <p className="mt-1 text-sm text-[#657381]">
                          Only households with saved map coordinates render as markers.
                        </p>
                      </div>
                    </div>
                    <HouseholdGoogleMap households={locatedHouseholds} mapsReady={mapsReady} />
                  </div>

                  <div className="grid gap-4">
                    <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
                      <h2 className="text-xl font-semibold">Coverage</h2>
                      <p className="mt-2 text-sm leading-6 text-[#4c5965]">
                        {locatedHouseholds.length === households.length
                          ? "Every household has a saved location."
                          : `${households.length - locatedHouseholds.length} household${households.length - locatedHouseholds.length === 1 ? "" : "s"} still need a saved address in setup.`}
                      </p>
                    </section>
                    <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
                      <h2 className="text-xl font-semibold">Newest households</h2>
                      <ul className="mt-3 grid gap-3">
                        {households.slice(0, 8).map((household) => (
                          <li className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3" key={household.household_id}>
                            <p className="font-semibold">{household.household_name}</p>
                            <p className="mt-1 text-sm text-[#4c5965]">
                              {buildHouseholdLocationLabel({
                                administrativeArea: household.administrative_area ?? "",
                                formattedAddress: household.formatted_address ?? "",
                                locality: household.locality ?? "",
                              }) || "No saved address"}
                            </p>
                            <p className="mt-1 text-xs text-[#657381]">
                              Created {formatCompactDateTime(household.created_at)} · {household.timezone}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>
                </section>

                <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
                  <h2 className="text-xl font-semibold">All households</h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#d7e0e7] text-[#657381]">
                          <th className="px-3 py-2 font-semibold">Household</th>
                          <th className="px-3 py-2 font-semibold">Location</th>
                          <th className="px-3 py-2 font-semibold">Coordinates</th>
                          <th className="px-3 py-2 font-semibold">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {households.map((household) => (
                          <tr className="border-b border-[#eef2f6]" key={household.household_id}>
                            <td className="px-3 py-3 font-semibold">{household.household_name}</td>
                            <td className="px-3 py-3 text-[#4c5965]">
                              {household.formatted_address || "No saved address"}
                            </td>
                            <td className="px-3 py-3 text-[#4c5965]">
                              {typeof household.latitude === "number" && typeof household.longitude === "number"
                                ? `${household.latitude.toFixed(4)}, ${household.longitude.toFixed(4)}`
                                : "Missing"}
                            </td>
                            <td className="px-3 py-3 text-[#4c5965]">{formatCompactDateTime(household.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}

function MetricCard({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border border-[#cbd5df] bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#657381]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function StateCard({ children, title }: Readonly<{ children: React.ReactNode; title: string }>) {
  return (
    <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#4c5965]">{children}</p>
    </section>
  );
}

function StatusMessage({ message, state }: Readonly<{ message: string; state: PlatformState }>) {
  const statusClassName =
    state === "error"
      ? "border-[#d6a8a8] bg-[#fff2f2] text-[#8a2f2f]"
      : "border-[#b7d7ce] bg-[#e8f4f3] text-[#2f6f73]";

  return <p className={`border px-3 py-3 text-sm ${statusClassName}`}>{message}</p>;
}

function HouseholdGoogleMap({
  households,
  mapsReady,
}: Readonly<{
  households: LocatedPlatformHousehold[];
  mapsReady: boolean;
}>) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);

  useEffect(() => {
    if (!mapsReady || !mapElementRef.current) {
      return;
    }

    const mapsWindow = window as typeof window & {
      google?: {
        maps?: GoogleMapsApi;
      };
    };
    const googleMaps = mapsWindow.google?.maps;

    if (!googleMaps) {
      return;
    }

    if (!mapRef.current) {
      mapRef.current = new googleMaps.Map(mapElementRef.current, {
        center: { lat: 39.8283, lng: -98.5795 },
        disableDefaultUI: true,
        gestureHandling: "cooperative",
        zoom: 3,
      });
    }

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    if (households.length === 0) {
      return;
    }

    const bounds = new googleMaps.LatLngBounds();
    const infoWindow = new googleMaps.InfoWindow();

    markersRef.current = households.map((household) => {
      const marker = new googleMaps.Marker({
        map: mapRef.current!,
        position: {
          lat: household.latitude,
          lng: household.longitude,
        },
        title: household.household_name,
      });

      marker.addListener("click", () => {
        infoWindow.setContent(
          [
            `<strong>${escapeHtml(household.household_name)}</strong>`,
            household.formatted_address ? `<div>${escapeHtml(household.formatted_address)}</div>` : "",
          ].join(""),
        );
        infoWindow.open({
          anchor: marker,
          map: mapRef.current!,
        });
      });

      bounds.extend(marker.getPosition());
      return marker;
    });

    mapRef.current.fitBounds(bounds, 48);
  }, [households, mapsReady]);

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <p className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm text-[#657381]">
        Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to render the platform household map.
      </p>
    );
  }

  return <div className="h-[420px] w-full border border-[#d7e0e7] bg-[#f8fafc]" ref={mapElementRef} />;
}

async function readPlatformAdminStatus(supabase: ReturnType<typeof createBrowserSupabaseClient>) {
  const { data, error } = await supabase.rpc("is_platform_admin");

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? Boolean(data[0]) : Boolean(data);
}

async function bootstrapPlatformAdmin(accessToken: string) {
  const response = await fetch("/api/platform-admin/bootstrap", {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
  });
  const body = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(body.error || "Could not bootstrap platform admin access.");
  }
}

function formatCompactDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
