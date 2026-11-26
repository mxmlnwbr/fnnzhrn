import { authErrorMessage } from "@core/auth-errors";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { API_URL } from "@/lib/config";
import { useColors } from "@/lib/theme";

/**
 * Sign-in with the same account as fnnzhrn.ch. Creating an account and resetting the password happen
 * on the website, so the app needs no sign-up (and with it, no in-app account deletion).
 */
export default function Login() {
  const colors = useColors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    const trimmed = email.trim();
    if (!trimmed || !password) return setError("Gib deine E-Mail und dein Passwort ein.");
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email: trimmed, password });
    setBusy(false);
    if (error?.code === "EMAIL_NOT_VERIFIED")
      return setError("Bestätige zuerst deine E-Mail-Adresse. Wir haben dir einen Link geschickt.");
    if (error) setError(authErrorMessage(error));
    // On success the session changes and the root layout shows the tools.
  }

  // The fields are uncontrolled (no `value`): iOS Password AutoFill writes into them natively, and a
  // controlled field could be reset by a render before React has seen that text.
  const input = [styles.input, { color: colors.fg, backgroundColor: colors.card, borderColor: colors.line }];
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.body}>
        <View style={styles.header}>
          <Text style={[styles.brand, { color: colors.fg }]}>fnnzhrn</Text>
          <Text style={[styles.lead, { color: colors.muted }]}>Melde dich mit deinem fnnzhrn-Konto an.</Text>
        </View>

        <TextInput
          style={input}
          placeholder="E-Mail"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoComplete="username"
          keyboardType="email-address"
          textContentType="username"
          onChangeText={setEmail}
          returnKeyType="next"
        />
        <TextInput
          style={input}
          placeholder="Passwort"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onChangeText={setPassword}
          returnKeyType="go"
          onSubmitEditing={signIn}
        />
        {error && <Text style={[styles.error, { color: colors.down }]}>{error}</Text>}
        <Button title="Anmelden" onPress={signIn} busy={busy} />

        <Pressable onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/login`)} style={styles.link}>
          <Text style={[styles.linkText, { color: colors.accent }]}>Passwort vergessen oder neues Konto? Auf fnnzhrn.ch</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, justifyContent: "center", paddingHorizontal: 24, gap: 12 },
  header: { marginBottom: 24, gap: 6 },
  brand: { fontSize: 40, fontWeight: "700", letterSpacing: -1 },
  lead: { fontSize: 16 },
  input: { height: 50, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 17 },
  error: { fontSize: 15 },
  link: { paddingVertical: 12, alignItems: "center" },
  linkText: { fontSize: 15, textAlign: "center" },
});
