import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";

import { authClient } from "@/lib/auth-client";

SplashScreen.preventAutoHideAsync();

/** Signed in: the tools. Signed out: the sign-in screen. Better Auth's session decides which. */
export default function RootLayout() {
  const scheme = useColorScheme();
  const { data: session, isPending } = authClient.useSession();
  // The last settled answer. Better Auth checks the session again whenever the app comes back to the
  // foreground (e.g. after Face ID for Password AutoFill); hiding the screens during that check would
  // rebuild the sign-in screen and throw away what AutoFill just filled in.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (isPending) return;
    setSignedIn(!!session);
    SplashScreen.hideAsync();
  }, [isPending, session]);

  if (signedIn === null) return null;
  return (
    <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="transaktion" options={{ presentation: "modal" }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
