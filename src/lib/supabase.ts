"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Referenced literally so Next.js inlines them into the client bundle.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null | undefined;

/** Browser-only Supabase client, or null when sync isn't configured. */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  client = url && key && typeof window !== "undefined" ? createClient(url, key) : null;
  return client;
}
