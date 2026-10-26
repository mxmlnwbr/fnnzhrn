"use client";

import { useEffect, useRef, useState } from "react";
import { ASSISTANT_MODELS, type AssistantModel } from "@/lib/assistant/pricing";
import type { AssistantStatus } from "@/lib/assistant/store";
import { Markdown } from "./Markdown";
import { buttonClass, Card, inputClass, primaryButtonClass } from "./ui";

const CONSOLE = "https://platform.claude.com";
const BILLING_URL = `${CONSOLE}/settings/billing`;
const KEYS_URL = `${CONSOLE}/settings/keys`;
const LIMITS_URL = `${CONSOLE}/settings/limits`;

/** The conversation is kept on this device only, so a reload doesn't lose it. */
const STORAGE_KEY = "fnnzhrn:assistant:v1";

type Message = { role: "user" | "assistant"; content: string; cost?: number; error?: string; billing?: boolean };

const TOOL_LABELS: Record<string, string> = {
  get_depot: "Depot",
  get_depot_records: "Transaktionen",
  get_finances: "Finanzen",
  get_quotes: "Kurse",
  search_symbol: "Ticker-Suche",
  get_news: "News",
  get_market_screen: "Marktlisten",
  get_earnings: "Quartalszahlen",
  get_sentiment: "Marktstimmung",
  get_investors: "13F-Meldungen",
};

const SUGGESTIONS = [
  "Wie hat sich mein Depot dieses Jahr entwickelt?",
  "Welche Position ist am stärksten übergewichtet gegenüber meinen Zielen?",
  "Wie hoch ist meine Sparquote und wo gebe ich am meisten aus?",
  "Gibt es News zu meinen grössten Positionen?",
  "Wann kommen die nächsten Quartalszahlen meiner Aktien?",
];

const usd = (v: number) => `$${v < 1 ? v.toFixed(v < 0.01 && v > 0 ? 4 : 2) : v.toFixed(2)}`;

function loadConversation(): Message[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversation(messages: Message[]) {
  try {
    if (messages.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode); the conversation lives until the tab closes.
  }
}

/** Chat with Claude about the signed-in user's depots, finances and the markets, on their own API key. */
export function Assistant({ initial }: { initial: AssistantStatus }) {
  const [status, setStatus] = useState(initial);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(!initial.connected);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => setMessages(loadConversation()), []);
  useEffect(() => {
    if (!busy) saveConversation(messages);
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    // Failed answers aren't sent back; the question before one is replaced by the new one.
    const history = messages.filter((m) => !m.error);
    if (history.at(-1)?.role === "user") history.pop();
    const sent: Message[] = [...history, { role: "user", content: q }];
    setMessages([...sent, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setActivity("denkt nach");
    const controller = new AbortController();
    abort.current = controller;
    const update = (fn: (m: Message) => Message) => setMessages((all) => [...all.slice(0, -1), fn(all.at(-1)!)]);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: sent.map(({ role, content }) => ({ role, content })) }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        if (body.needsKey) setShowKey(true);
        update((m) => ({ ...m, error: body.error ?? `Fehler ${res.status}` }));
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "text") {
            setActivity(null);
            update((m) => ({ ...m, content: m.content + ev.text }));
          } else if (ev.type === "tool") setActivity(`liest ${TOOL_LABELS[ev.name] ?? ev.name}`);
          else if (ev.type === "done") {
            update((m) => ({ ...m, content: m.content.trim(), cost: ev.cost }));
            setStatus(ev.status);
          } else if (ev.type === "error") {
            if (ev.status) setStatus(ev.status);
            if (ev.needsKey) setShowKey(true);
            update((m) => ({ ...m, content: m.content.trim(), cost: ev.cost, error: ev.error, billing: ev.billing }));
          }
        }
      }
    } catch (e) {
      update((m) => ({ ...m, error: (e as Error).name === "AbortError" ? "Abgebrochen." : "Keine Verbindung zum Server." }));
    } finally {
      setBusy(false);
      setActivity(null);
      abort.current = null;
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assistent</h1>
          <p className="text-sm text-zinc-500">Fragen zu deinem Depot, deinen Finanzen und den Märkten. Keine Anlageberatung.</p>
        </div>
        {messages.length > 0 && (
          <button className={buttonClass} disabled={busy} onClick={() => setMessages([])}>
            Neues Gespräch
          </button>
        )}
      </div>

      <SpendCard status={status} onManageKey={() => setShowKey((s) => !s)} />
      {showKey && <KeyCard status={status} onChange={(s) => { setStatus(s); if (s.connected) setShowKey(false); }} />}

      {status.connected && (
        <>
          <ModelPicker status={status} disabled={busy} onChange={setStatus} />
          <div className="flex-1 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-zinc-500">Zum Beispiel:</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className={`${buttonClass} text-left`} onClick={() => void ask(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-3 py-2 text-sm whitespace-pre-wrap text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="max-w-full rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                  {m.content && <Markdown text={m.content} />}
                  {busy && i === messages.length - 1 && activity && (
                    <p className="flex items-center gap-2 text-zinc-500">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" aria-hidden />
                      {activity}…
                    </p>
                  )}
                  {m.error && (
                    <p className="mt-1 text-red-600 dark:text-red-400">
                      {m.error}
                      {m.billing && (
                        <>
                          {" "}
                          <a href={BILLING_URL} target="_blank" rel="noreferrer" className="underline">
                            Guthaben aufladen
                          </a>
                        </>
                      )}
                    </p>
                  )}
                  {m.cost != null && <p className="mt-1 text-xs text-zinc-400">Kosten dieser Antwort: ca. {usd(m.cost)}</p>}
                </div>
              ),
            )}
            <div ref={end} />
          </div>

          <form
            className="sticky bottom-0 flex gap-2 border-t border-zinc-200 bg-zinc-50 py-3 dark:border-zinc-800 dark:bg-zinc-950"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
          >
            <textarea
              className={`${inputClass} min-h-10 resize-none`}
              rows={1}
              maxLength={8000}
              placeholder="Frag etwas zu deinem Depot oder deinen Finanzen…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
            />
            {busy ? (
              <button type="button" className={buttonClass} onClick={() => abort.current?.abort()}>
                Stopp
              </button>
            ) : (
              <button type="submit" className={primaryButtonClass} disabled={!input.trim()}>
                Senden
              </button>
            )}
          </form>
        </>
      )}
    </main>
  );
}

/** What the assistant has cost so far, and where to top up. */
function SpendCard({ status, onManageKey }: { status: AssistantStatus; onManageKey: () => void }) {
  const tile = (label: string, value: string, sub?: string) => (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-zinc-400">{sub}</p>}
    </div>
  );
  return (
    <Card
      title="Deine Kosten"
      action={
        <button className="text-sm text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100" onClick={onManageKey}>
          {status.connected ? `API-Key ${status.hint}` : "API-Key verbinden"}
        </button>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        {tile("Heute", usd(status.spent.today))}
        {tile("Dieser Monat", usd(status.spent.month), `${status.requests.month} Anfragen`)}
        {tile("Total", usd(status.spent.total), `${status.requests.total} Anfragen`)}
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Geschätzt aus den Tokens jeder Antwort, zu Anthropics Listenpreisen. Bezahlt wird über dein eigenes Anthropic-Konto: Guthaben und genaue Abrechnung siehst du in der{" "}
        <a href={BILLING_URL} target="_blank" rel="noreferrer" className="underline">
          Claude Console
        </a>
        .
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={BILLING_URL} target="_blank" rel="noreferrer" className={primaryButtonClass}>
          Guthaben aufladen
        </a>
        <a href={LIMITS_URL} target="_blank" rel="noreferrer" className={buttonClass}>
          Ausgabenlimit setzen
        </a>
      </div>
    </Card>
  );
}

/** Which model answers: cheaper or more thorough, saved with the user's key. */
function ModelPicker({ status, disabled, onChange }: { status: AssistantStatus; disabled: boolean; onChange: (s: AssistantStatus) => void }) {
  const [saving, setSaving] = useState<AssistantModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = saving ?? status.model;

  async function pick(model: AssistantModel) {
    if (model === status.model) return;
    setSaving(model);
    setError(null);
    try {
      const res = await fetch("/api/assistant/key", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error ?? `Fehler ${res.status}`);
      else onChange(body);
    } catch {
      setError("Keine Verbindung zum Server.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-1">
      <div role="radiogroup" aria-label="Modell" className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-200/60 p-1 dark:bg-zinc-800/60">
        {ASSISTANT_MODELS.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={current === m.id}
            disabled={disabled || saving !== null}
            title={m.description}
            onClick={() => void pick(m.id)}
            className={`rounded-md px-2 py-1.5 text-sm disabled:cursor-default ${current === m.id ? "bg-white font-medium shadow-sm dark:bg-zinc-900" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"}`}
          >
            {m.label} <span className="hidden text-xs text-zinc-500 sm:inline">· {m.hint}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-500">{error ?? ASSISTANT_MODELS.find((m) => m.id === current)?.description}</p>
    </div>
  );
}

/** Connecting, replacing or removing the user's own Claude API key, with how to get one. */
function KeyCard({ status, onChange }: { status: AssistantStatus; onChange: (s: AssistantStatus) => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "PUT" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant/key", { method, headers: { "Content-Type": "application/json" }, body: method === "PUT" ? JSON.stringify({ key }) : undefined });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? `Fehler ${res.status}`);
      setKey("");
      onChange(body);
    } catch {
      setError("Keine Verbindung zum Server.");
    } finally {
      setBusy(false);
    }
  }

  const link = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-emerald-700 underline dark:text-emerald-400">
      {label}
    </a>
  );

  return (
    <Card title={status.connected ? "Dein Claude API-Key" : "Claude API-Key verbinden"}>
      <div className="space-y-3 text-sm">
        <p className="text-zinc-600 dark:text-zinc-400">
          Jedes Mitglied nutzt den Assistenten mit seinem eigenen API-Key. So bezahlst du nur deine eigenen Fragen, direkt bei Anthropic. Was jede Antwort gekostet hat, steht darunter.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-zinc-600 dark:text-zinc-400">
          <li>Konto in der {link(CONSOLE, "Claude Console")} erstellen oder anmelden.</li>
          <li>Unter {link(BILLING_URL, "Billing")} Guthaben kaufen (ab $5). Mit «Auto reload» lädt es automatisch nach, wenn es knapp wird.</li>
          <li>Unter {link(LIMITS_URL, "Limits")} ein monatliches Ausgabenlimit setzen, wenn du sicher sein willst.</li>
          <li>Unter {link(KEYS_URL, "API Keys")} «Create Key» wählen, z. B. «fnnzhrn», und den Key (sk-ant-…) hier einfügen.</li>
        </ol>
        <p className="text-xs text-zinc-500">
          Der Key wird verschlüsselt gespeichert und nur für deine Fragen an Claude verwendet. Du kannst ihn jederzeit hier entfernen oder in der Console löschen.
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void call("PUT");
          }}
        >
          <input
            className={inputClass}
            type="password"
            autoComplete="off"
            placeholder={status.connected ? `Neuer Key (verbunden: ${status.hint})` : "sk-ant-…"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button type="submit" className={primaryButtonClass} disabled={busy || !key.trim()}>
            {busy ? "Prüfe…" : status.connected ? "Ersetzen" : "Verbinden"}
          </button>
          {status.connected && (
            <button type="button" className={buttonClass} disabled={busy} onClick={() => void call("DELETE")}>
              Entfernen
            </button>
          )}
        </form>
        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Card>
  );
}
