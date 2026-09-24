"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Trims whitespace and stray quotes that secret managers sometimes keep around values. */
export function cleanEnv(value: string | undefined): string | undefined {
  return value?.trim().replace(/^(["'])(.*)\1$/, "$2").trim() || undefined;
}

// Referenced literally so Next.js inlines them into the client bundle.
const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const key = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

let client: SupabaseClient | null | undefined;

/** Browser-only Supabase client, or null when sync isn't configured. */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  client = null;
  if (url && key && typeof window !== "undefined") {
    try {
      client = createClient(url, key);
    } catch (e) {
      // A bad setting shouldn't take the app down; it keeps working locally.
      console.error("Sync disabled, Supabase settings are invalid:", e);
    }
  }
  return client;
}
