import {
  type Budget,
  type BudgetItem,
  budgetMonth,
  type Category,
  type MonthExpense,
  parseAmount,
  planMonth,
  type Section,
  amounts,
  summarizeBudget,
  summarizeMonth,
  withSnapshots,
} from "@core/budget";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, type TextInputInstance, View } from "react-native";

import { Button, Card, DiscreetToggle, Segmented } from "@/components/ui";
import { ApiError, getJson, putJson } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useDiscreet } from "@/lib/discreet";
import { formatMoney } from "@/lib/format";
import { useColors, type Palette } from "@/lib/theme";
import { useAndroidTop } from "@/lib/insets";

type View_ = "overview" | "month";
type Period = "month" | "year";
type SaveState = "saved" | "saving" | "error";

const SECTION_TITLES: Record<Section, string> = {
  income: "Einnahmen",
  fixed: "Fixkosten",
  variable: "Flexible Ausgaben",
  invest: "Investieren",
};
const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const monthLabel = (key: string) => `${MONTH_NAMES[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`;
const percent = (v: number) => `${(v * 100).toFixed(1)}%`;
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Finanzen: the plan (income, fixed costs, flexible spending, investing) per month or year, and the
 * months, where what was spent is entered. The same budget as on fnnzhrn.ch/budget, with the same
 * calculations (src/lib/budget.ts). The plan itself is edited on the website.
 */
export default function Finanzen() {
  const colors = useColors();
  const top = useAndroidTop();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<View_>("month");
  const [period, setPeriod] = useState<Period>("month");
  const [save, setSave] = useState<SaveState>("saved");
  const latest = useRef<Budget | null>(null);

  const fail = useCallback((e: unknown) => {
    setError((e as Error).message);
    if (e instanceof ApiError && e.status === 401) authClient.signOut();
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await getJson<{ data: Budget }>("/api/budget");
      setBudget(data);
      setError(null);
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(next: Budget) {
    latest.current = next;
    setSave("saving");
    try {
      await putJson("/api/budget", { data: next });
      // A newer change may have started meanwhile; it reports its own result.
      if (latest.current === next) setSave("saved");
    } catch (e) {
      if (latest.current === next) setSave("error");
      if (e instanceof ApiError && e.status === 401) authClient.signOut();
    }
  }

  /** Applies a change, keeps this year's snapshot and this month in step (like the website), and saves. */
  function change(update: (b: Budget) => Budget) {
    if (!budget) return;
    const next = withSnapshots(update(budget), new Date());
    setBudget(next);
    upload(next);
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.body, top]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.muted} />}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.fg }]}>Finanzen</Text>
        <View style={styles.actions}>
          <SaveStatus state={save} colors={colors} onRetry={() => latest.current && upload(latest.current)} />
          <DiscreetToggle />
        </View>
      </View>
      <Segmented
        options={[
          { value: "month", label: "Monat" },
          { value: "overview", label: "Plan" },
        ]}
        value={view}
        onChange={setView}
      />

      {error && (
        <Card style={{ borderColor: colors.down }}>
          <Text style={{ color: colors.down, fontSize: 15 }}>{error}</Text>
        </Card>
      )}

      {!budget ? (
        !error && <ActivityIndicator style={styles.loading} color={colors.muted} />
      ) : view === "month" ? (
        <MonthView
          budget={budget}
          colors={colors}
          onChange={(month, expenses) =>
            change((b) => {
              const current = b.months.find((m) => m.month === month) ?? planMonth(b, month);
              return { ...b, months: [...b.months.filter((m) => m.month !== month), { ...current, expenses }] };
            })
          }
        />
      ) : (
        <PlanView budget={budget} period={period} onPeriod={setPeriod} colors={colors} />
      )}
    </ScrollView>
  );
}

function SaveStatus({ state, colors, onRetry }: { state: SaveState; colors: Palette; onRetry: () => void }) {
  if (state === "saving") return <Text style={[styles.status, { color: colors.muted }]}>Speichert…</Text>;
  if (state === "error")
    return (
      <Pressable onPress={onRetry} accessibilityRole="button">
        <Text style={[styles.status, { color: colors.down }]}>Nicht gespeichert · Nochmals</Text>
      </Pressable>
    );
  return null;
}

/* ---------- Month ---------- */

function MonthView({
  budget,
  colors,
  onChange,
}: {
  budget: Budget;
  colors: Palette;
  onChange: (month: string, expenses: MonthExpense[]) => void;
}) {
  const current = budgetMonth(new Date());
  const [selected, setSelected] = useState(current);
  const month = budget.months.find((m) => m.month === selected) ?? planMonth(budget, selected);
  const keys = budget.months.some((m) => m.month === selected)
    ? budget.months.map((m) => m.month)
    : [...budget.months.map((m) => m.month), selected].sort();
  const index = keys.indexOf(selected);
  const s = summarizeMonth(month);
  const discreet = useDiscreet();
  // Discreet: amounts as a share of the month's income instead.
  const money = (v: number) => (discreet ? (s.income > 0 ? percent(v / s.income) : "–") : formatMoney(v, budget.currency));
  const categoryName = (id?: string) => budget.categories.find((c) => c.id === id)?.name || "Ohne Kategorie";

  const remove = (e: MonthExpense) =>
    Alert.alert(`${e.name || "Ausgabe"} löschen?`, money(e.amount), [
      { text: "Abbrechen", style: "cancel" },
      { text: "Löschen", style: "destructive", onPress: () => onChange(month.month, month.expenses.filter((x) => x.id !== e.id)) },
    ]);

  return (
    <>
      <View style={styles.monthNav}>
        <NavButton label="‹" hint="Monat davor" disabled={index <= 0} onPress={() => setSelected(keys[index - 1])} colors={colors} />
        <View style={styles.monthTitle}>
          <Text style={[styles.monthName, { color: colors.fg }]}>{monthLabel(month.month)}</Text>
          {month.month === current && <Text style={[styles.small, { color: colors.muted }]}>laufend</Text>}
        </View>
        <NavButton label="›" hint="Monat danach" disabled={index >= keys.length - 1} onPress={() => setSelected(keys[index + 1])} colors={colors} />
      </View>

      <Card>
        <Text style={[styles.label, { color: colors.muted }]}>Frei verfügbar</Text>
        <Text style={[styles.big, { color: s.free < 0 ? colors.down : colors.fg }]}>{money(s.free)}</Text>
        <View style={styles.statRow}>
          <Stat label="Einkommen" value={money(s.income)} colors={colors} />
          <Stat label="Fixkosten" value={money(s.fixed)} colors={colors} />
        </View>
        <View style={styles.statRow}>
          <Stat label="Investieren" value={money(s.invest)} colors={colors} />
          <Stat
            label="Ausgaben"
            value={money(s.spent)}
            sub={month.planned > 0 ? `${s.left < 0 ? "über Budget" : "noch"} ${money(Math.abs(s.left))}` : undefined}
            subColor={s.left < 0 ? colors.down : colors.muted}
            colors={colors}
          />
        </View>
        {month.planned > 0 && <Meter value={s.spent} max={month.planned} colors={colors} />}
      </Card>

      <AddExpense categories={budget.categories} colors={colors} onAdd={(e) => onChange(month.month, [...month.expenses, e])} />

      <Text style={[styles.section, { color: colors.fg }]}>Ausgaben</Text>
      {month.expenses.length === 0 ? (
        <Text style={[styles.note, { color: colors.muted }]}>Noch nichts erfasst in diesem Monat.</Text>
      ) : (
        <Card style={styles.list}>
          {[...month.expenses].reverse().map((e, i) => (
            <Pressable
              key={e.id}
              onLongPress={() => remove(e)}
              accessibilityHint="Lange drücken zum Löschen"
              style={[styles.row, i > 0 && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <View style={styles.rowText}>
                <Text style={[styles.rowName, { color: colors.fg }]} numberOfLines={1}>
                  {e.name || "Ausgabe"}
                </Text>
                <Text style={[styles.small, { color: colors.muted }]}>{categoryName(e.category)}</Text>
              </View>
              <Text style={[styles.amount, { color: colors.fg }]}>{money(e.amount)}</Text>
            </Pressable>
          ))}
        </Card>
      )}
      {month.expenses.length > 0 && <Text style={[styles.footnote, { color: colors.muted }]}>Lange drücken, um eine Ausgabe zu löschen.</Text>}

      <Text style={[styles.section, { color: colors.fg }]}>Fixkosten aus dem Plan</Text>
      {month.fixed.length === 0 ? (
        <Text style={[styles.note, { color: colors.muted }]}>Keine Fixkosten im Plan.</Text>
      ) : (
        <Card style={styles.list}>
          {month.fixed.map((l, i) => (
            <View key={i} style={[styles.row, i > 0 && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <Text style={[styles.rowName, styles.rowText, { color: colors.fg }]} numberOfLines={1}>
                {l.name || "Eintrag"}
              </Text>
              <Text style={[styles.amount, { color: colors.fg }]}>{money(l.amount)}</Text>
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

function AddExpense({ categories, colors, onAdd }: { categories: Category[]; colors: Palette; onAdd: (e: MonthExpense) => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const value = parseAmount(amount);
  const amountRef = useRef<TextInputInstance>(null);

  function add() {
    if (!value) return;
    onAdd({ id: newId(), name: name.trim(), amount: value, ...(category ? { category } : {}) });
    setName("");
    setAmount("");
  }

  const input = [styles.input, { color: colors.fg, backgroundColor: colors.bg, borderColor: colors.line }];
  return (
    <Card style={styles.form}>
      <Text style={[styles.cardTitle, { color: colors.fg }]}>Ausgabe erfassen</Text>
      <View style={styles.formRow}>
        <TextInput
          style={[input, styles.flex]}
          placeholder="z. B. Coop"
          placeholderTextColor={colors.muted}
          value={name}
          onChangeText={setName}
          maxLength={200}
          returnKeyType="next"
          onSubmitEditing={() => amountRef.current?.focus()}
        />
        <TextInput
          ref={amountRef}
          style={[input, styles.amountInput]}
          placeholder="Betrag"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
        {[{ id: "", name: "Ohne Kategorie" }, ...categories].map((c) => {
          const selected = c.id === category;
          return (
            <Pressable
              key={c.id || "none"}
              onPress={() => setCategory(c.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.chip, selected ? { backgroundColor: colors.accentSoft, borderColor: colors.accent } : { borderColor: colors.line }]}>
              <Text style={[styles.chipText, { color: selected ? colors.accent : colors.fg }]}>{c.name || "Unbenannt"}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Button title="Hinzufügen" onPress={add} />
    </Card>
  );
}

/* ---------- Plan ---------- */

function PlanView({ budget, period, onPeriod, colors }: { budget: Budget; period: Period; onPeriod: (p: Period) => void; colors: Palette }) {
  const summary = summarizeBudget(budget);
  const income = summary.income[period];
  const share = (v: number) => (income > 0 ? percent(v / income) : "–");
  // Discreet: amounts as a share of the income instead.
  const discreet = useDiscreet();
  const money = (v: number) => (discreet ? share(v) : formatMoney(v, budget.currency));
  const parts = [
    { label: "Fixkosten", value: summary.fixed[period], color: colors.fixed },
    { label: "Flexibel", value: summary.variable[period], color: colors.variable },
    { label: "Investieren", value: summary.invest[period], color: colors.invest },
    { label: "Frei", value: Math.max(0, summary.free[period]), color: colors.other },
  ];
  const total = Math.max(income, summary.expenses[period] + summary.invest[period]);

  return (
    <>
      <Segmented
        options={[
          { value: "month", label: "Pro Monat" },
          { value: "year", label: "Pro Jahr" },
        ]}
        value={period}
        onChange={onPeriod}
      />
      <Card>
        <Text style={[styles.label, { color: colors.muted }]}>Frei verfügbar</Text>
        <Text style={[styles.big, { color: summary.free[period] < 0 ? colors.down : colors.fg }]}>{money(summary.free[period])}</Text>
        <View style={styles.statRow}>
          <Stat label="Einkommen" value={money(income)} sub="inkl. 13. Monatslohn" colors={colors} />
          <Stat
            label="Ausgaben"
            value={money(summary.expenses[period])}
            sub={`fix ${money(summary.fixed[period])}`}
            colors={colors}
          />
        </View>
        <View style={styles.statRow}>
          <Stat label="Investieren" value={money(summary.invest[period])} sub={`Sparquote ${share(summary.invest[period])}`} colors={colors} />
          <Stat label="Nach Fixkosten" value={money(summary.available[period])} sub={`Fixkosten ${share(summary.fixed[period])}`} colors={colors} />
        </View>
      </Card>

      {total > 0 && (
        <Card>
          <Text style={[styles.cardTitle, { color: colors.fg }]}>Wohin das Einkommen geht</Text>
          <View style={[styles.split, { backgroundColor: colors.line }]}>
            {parts.map((p) => (p.value > 0 ? <View key={p.label} style={{ flex: p.value / total, backgroundColor: p.color }} /> : null))}
            {total > parts.reduce((s, p) => s + p.value, 0) && <View style={{ flex: (total - parts.reduce((s, p) => s + p.value, 0)) / total }} />}
          </View>
          {parts.map((p) => (
            <View key={p.label} style={styles.legend}>
              <View style={[styles.swatch, { backgroundColor: p.color }]} />
              <Text style={[styles.legendLabel, { color: colors.muted }]}>{p.label}</Text>
              <Text style={[styles.amount, { color: colors.fg }]}>{money(p.value)}</Text>
              <Text style={[styles.legendShare, { color: colors.muted }]}>{share(p.value)}</Text>
            </View>
          ))}
          {summary.free[period] < 0 && (
            <Text style={[styles.note, { color: colors.down, marginTop: 8 }]}>
              Ausgaben und Investitionen sind {money(-summary.free[period])} höher als das Einkommen.
            </Text>
          )}
        </Card>
      )}

      {(["income", "fixed", "variable", "invest"] as const).map((section) => (
        <SectionList key={section} title={SECTION_TITLES[section]} items={budget[section]} period={period} money={money} colors={colors} />
      ))}
      <Text style={[styles.footnote, { color: colors.muted }]}>Den Plan änderst du auf fnnzhrn.ch unter Finanzen.</Text>
    </>
  );
}

function SectionList({
  title,
  items,
  period,
  money,
  colors,
}: {
  title: string;
  items: BudgetItem[];
  period: Period;
  money: (v: number) => string;
  colors: Palette;
}) {
  const discreet = useDiscreet();
  if (items.length === 0) return null;
  const total = items.reduce((s, i) => s + amounts(i)[period], 0);
  return (
    <>
      <View style={styles.sectionHead}>
        <Text style={[styles.section, { color: colors.fg }]}>{title}</Text>
        <Text style={[styles.amount, { color: colors.muted }]}>{money(total)}</Text>
      </View>
      <Card style={styles.list}>
        {[...items]
          .sort((a, b) => amounts(b).year - amounts(a).year)
          .map((item, i) => (
            <View key={item.id} style={[styles.row, i > 0 && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <View style={styles.rowText}>
                <Text style={[styles.rowName, { color: colors.fg }]} numberOfLines={1}>
                  {item.name || "Eintrag"}
                </Text>
                {item.interval !== "month" && (
                  <Text style={[styles.small, { color: colors.muted }]}>
                    {discreet
                      ? item.interval === "year"
                        ? "jährlich"
                        : "13× pro Jahr"
                      : item.interval === "year"
                        ? `jährlich ${money(item.amount)}`
                        : `13× ${money(item.amount)}`}
                  </Text>
                )}
              </View>
              <Text style={[styles.amount, { color: colors.fg }]}>{money(amounts(item)[period])}</Text>
            </View>
          ))}
      </Card>
    </>
  );
}

/* ---------- Shared bits ---------- */

function Stat({
  label,
  value,
  sub,
  subColor,
  colors,
}: {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
  colors: Palette;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.fg }]}>{value}</Text>
      {sub && <Text style={[styles.small, { color: subColor ?? colors.muted }]}>{sub}</Text>}
    </View>
  );
}

/** Spent against what the plan sets aside for flexible spending. */
function Meter({ value, max, colors }: { value: number; max: number; colors: Palette }) {
  const over = value > max;
  return (
    <View style={[styles.meter, { backgroundColor: colors.line }]}>
      <View style={{ width: `${Math.min(value / max, 1) * 100}%`, backgroundColor: over ? colors.down : colors.accent, height: 6, borderRadius: 3 }} />
    </View>
  );
}

function NavButton({ label, hint, disabled, onPress, colors }: { label: string; hint: string; disabled: boolean; onPress: () => void; colors: Palette }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={[styles.navButton, { borderColor: colors.line, opacity: disabled ? 0.35 : 1 }]}>
      <Text style={[styles.navText, { color: colors.fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14, paddingBottom: 40 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 34, fontWeight: "700", letterSpacing: -0.5 },
  status: { fontSize: 13 },
  loading: { marginTop: 40 },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  monthTitle: { alignItems: "center" },
  monthName: { fontSize: 20, fontWeight: "700" },
  navButton: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  navText: { fontSize: 24, lineHeight: 28 },
  label: { fontSize: 13 },
  big: { fontSize: 34, fontWeight: "700", letterSpacing: -0.5, fontVariant: ["tabular-nums"], marginTop: 2 },
  statRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  stat: { flex: 1 },
  statValue: { fontSize: 16, fontWeight: "600", marginTop: 2, fontVariant: ["tabular-nums"] },
  small: { fontSize: 13 },
  meter: { height: 6, borderRadius: 3, marginTop: 14, overflow: "hidden" },
  form: { gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: "600", marginBottom: 2 },
  formRow: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
  input: { height: 46, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, fontSize: 17 },
  amountInput: { width: 110, textAlign: "right", fontVariant: ["tabular-nums"] },
  chips: { gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 14, fontWeight: "500" },
  section: { fontSize: 20, fontWeight: "700", marginTop: 6 },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  note: { fontSize: 15, lineHeight: 21 },
  list: { paddingVertical: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  rowText: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: "500" },
  amount: { fontSize: 16, fontVariant: ["tabular-nums"] },
  footnote: { fontSize: 12, textAlign: "center" },
  split: { flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden", gap: 2, marginVertical: 10 },
  legend: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { flex: 1, fontSize: 15 },
  legendShare: { width: 56, textAlign: "right", fontSize: 13, fontVariant: ["tabular-nums"] },
});
