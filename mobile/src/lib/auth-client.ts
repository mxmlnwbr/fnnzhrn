import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";

/** Sign-in against the web app's Better Auth; the session cookie is kept in the keychain. */
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: "fnnzhrn",
      storagePrefix: "fnnzhrn",
      storage: SecureStore,
    }),
  ],
});
