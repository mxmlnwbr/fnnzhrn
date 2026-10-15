"use client";

import { createAuthClient } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";

/** Talks to the app's own /api/auth endpoints. */
export const authClient = createAuthClient({ plugins: [magicLinkClient()] });
