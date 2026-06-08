import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let browserClient: SupabaseClient | null = null;

export function getBrowserSupabaseConfig() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return {
    supabaseAnonKey,
    supabaseUrl,
  };
}

export function createBrowserSupabaseClient() {
  const config = getBrowserSupabaseConfig();

  if (typeof window === "undefined") {
    return createClient(config.supabaseUrl, config.supabaseAnonKey);
  }

  browserClient ??= createClient(config.supabaseUrl, config.supabaseAnonKey);
  return browserClient;
}
