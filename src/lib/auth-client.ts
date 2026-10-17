"use client";

import { createAuthClient } from "better-auth/client";

/** Talks to the app's own /api/auth endpoints. */
export const authClient = createAuthClient();
