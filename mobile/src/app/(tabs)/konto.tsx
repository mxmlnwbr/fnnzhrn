import * as WebBrowser from "expo-web-browser";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Button, Card } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { API_URL } from "@/lib/config";
import { useColors } from "@/lib/theme";

export default function Konto() {
  const colors = useColors();
  const { data: session } = authClient.useSession();
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.body}>
      <Text style={[styles.title, { color: colors.fg }]}>Konto</Text>
      <Card>
        <Text style={[styles.label, { color: colors.muted }]}>Angemeldet als</Text>
        <Text style={[styles.value, { color: colors.fg }]}>{session?.user.email}</Text>
      </Card>
      <Text style={[styles.note, { color: colors.muted }]}>
        Transaktionen erfassen, Bankexporte importieren, den Finanzplan ändern und das Cockpit gibt es vorerst auf der Website.
      </Text>
      <View style={styles.actions}>
        <Button title="fnnzhrn.ch öffnen" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/depot`)} />
        <Button title="Abmelden" variant="secondary" onPress={() => authClient.signOut()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16 },
  title: { fontSize: 34, fontWeight: "700", letterSpacing: -0.5 },
  label: { fontSize: 13 },
  value: { fontSize: 17, fontWeight: "500", marginTop: 2 },
  note: { fontSize: 15, lineHeight: 21 },
  actions: { gap: 10 },
});
