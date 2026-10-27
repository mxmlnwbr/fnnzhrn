"use client";

import { useEffect, useRef, useState } from "react";
import { ASSISTANT_MODELS, type AssistantModel } from "@/lib/assistant/pricing";
import type { AssistantStatus, ConversationSummary, LimitPeriod } from "@/lib/assistant/store";
import { Markdown } from "./Markdown";
import { buttonClass, Card, inputClass, primaryButtonClass } from "./ui";

const CONSOLE = "https://platform.claude.com";
const BILLING_URL = `${CONSOLE}/settings/billing`;
const KEYS_URL = `${CONSOLE}/settings/keys`;
const LIMITS_URL = `${CONSOLE}/settings/limits`;

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

/** Shown in turn while an answer is on its way. */
const WAITING_WORDS = [
  "Zinseszins berechnen",
  "Dividenden zählen",
  "Bilanzen wälzen",
  "Kurse abfragen",
  "Rendite ausrechnen",
  "Portfolio rebalancen",
  "Cashflow schätzen",
  "KGV vergleichen",
  "Volatilität messen",
  "Bullen und Bären zählen",
  "Säule 3a prüfen",
  "Diversifikation checken",
  "Charts lesen",
  "Inflation einrechnen",
  "Quartalszahlen studieren",
  "Fixkosten sortieren",
  "Sparquote polieren",
  "Fear & Greed befragen",
  "Ticker entziffern",
  "Rappen spalten",
  "Gebühren aufspüren",
  "Buffett zitieren",
  "Marktkapitalisierung wiegen",
  "Börsenglocke läuten",
];

const randomWord = (not?: string) => {
  const pool = WAITING_WORDS.filter((w) => w !== not);
  return pool[Math.floor(Math.random() * pool.length)];
};

/** A spinner with a changing finance word while the answer is on its way; `detail` names the data being read. */
function Waiting({ detail }: { detail: string }) {
  const [word, setWord] = useState(randomWord);
  useEffect(() => {
    const timer = setInterval(() => setWord((w) => randomWord(w)), 1800);
    return () => clearInterval(timer);
  }, []);
  return (
    <div role="status" className="flex items-center gap-2 py-1 text-zinc-500">
      <span
        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500 motion-reduce:animate-none"
        aria-hidden
      />
      <span key={word} className="animate-fade-in" aria-hidden>
        {word}…
      </span>
      {detail && <span className="text-xs text-zinc-400" aria-hidden>· {detail}</span>}
      <span className="sr-only">Antwort wird geladen</span>
    </div>
  );
}

const usd = (v: number) => `$${v < 1 ? v.toFixed(v < 0.01 && v > 0 ? 4 : 2) : v.toFixed(2)}`;

/** The conversation of the old full-page assistant, kept on the device; moved into the history once. */
const LEGACY_KEY = "fnnzhrn:assistant:v1";
/** The conversation that's open, so it carries over to the next page and the next visit. */
const CURRENT_KEY = "fnnzhrn:assistant:current";
/** Whether the chat is open, per tab, so it stays open when moving between the tools. */
const MODE_KEY = "fnnzhrn:assistant:mode";

type Mode = "closed" | "open" | "full";
type View = "chat" | "history" | "settings";

const storage = {
  get(store: () => Storage, key: string) {
    try {
      return store().getItem(key);
    } catch {
      return null;
    }
  },
  set(store: () => Storage, key: string, value: string | null) {
    try {
      if (value === null) store().removeItem(key);
      else store().setItem(key, value);
    } catch {
      // Storage unavailable (private mode); the chat just starts afresh next time.
    }
  },
};
const local = () => localStorage;
const session = () => sessionStorage;

/** The history's title for a conversation, as the server derives it. */
function titleOf(messages: Message[]) {
  const first = messages.find((m) => m.role === "user")?.content.replace(/\s+/g, " ").trim() || "Gespräch";
  return first.length > 80 ? `${first.slice(0, 79)}…` : first;
}

async function saveConversation(id: string, messages: Message[]) {
  if (!messages.some((m) => m.role === "user")) return;
  await fetch(`/api/assistant/conversations/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  }).catch(() => {});
}

/** The window the chat sits in: the page itself, or the page around it when it's embedded in an iframe. */
const hostWindow = (embedded: boolean): Window => (embedded && window.frameElement ? window.parent : window);

/** Whether the screen is phone-sized, where the open chat takes the whole screen. */
function useSmallScreen(embedded: boolean) {
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const query = hostWindow(embedded).matchMedia("(max-width: 639px)");
    const update = () => setSmall(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [embedded]);
  return small;
}

/**
 * The assistant as a small chat in the corner of every tool, which can be made full screen (on phones it
 * always is). Chats with Claude about the signed-in user's depots, finances and the markets, on their own
 * API key; past conversations are kept on the server. `embedded` is for pages that aren't React (the
 * Cockpit), which show it in an iframe: the chat then sizes that iframe itself.
 */
export function AssistantDock({ embedded = false }: { embedded?: boolean }) {
  const [mode, setModeState] = useState<Mode>("closed");
  const [view, setView] = useState<View>("chat");
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const small = useSmallScreen(embedded);
  /** Covers the whole screen: full screen, or any open chat on a phone. */
  const covering = mode === "full" || (mode === "open" && small);

  const setMode = (next: Mode) => {
    setModeState(next);
    storage.set(session, MODE_KEY, next === "closed" ? null : next);
  };

  // Picks up where the last page left off; the old on-device conversation moves into the history.
  useEffect(() => {
    const saved = storage.get(session, MODE_KEY);
    if (saved === "open" || saved === "full") setModeState(saved);
    const current = storage.get(local, CURRENT_KEY);
    if (current) {
      setConversationId(current);
      fetch(`/api/assistant/conversations/${current}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((body) => setMessages((m) => (m.length ? m : body.messages)))
        .catch(() => {
          setConversationId((id) => (id === current ? null : id));
          storage.set(local, CURRENT_KEY, null);
        });
      return;
    }
    try {
      const legacy: Message[] = JSON.parse(storage.get(local, LEGACY_KEY) ?? "[]");
      if (legacy.length) {
        const id = crypto.randomUUID();
        setConversationId(id);
        setMessages(legacy);
        storage.set(local, CURRENT_KEY, id);
        void saveConversation(id, legacy).then(() => storage.set(local, LEGACY_KEY, null));
      }
    } catch {
      storage.set(local, LEGACY_KEY, null);
    }
  }, []);

  // The key status and spend load the first time the chat opens.
  const open = mode !== "closed";
  useEffect(() => {
    if (!open || status) return;
    let cancelled = false;
    fetch("/api/assistant/key")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) return setStatusError(body.error ?? `Fehler ${res.status}`);
        setStatus(body);
        if (!body.connected) setView("settings");
      })
      .catch(() => !cancelled && setStatusError("Keine Verbindung zum Server."));
    return () => {
      cancelled = true;
    };
  }, [open, status]);

  // The history loads when it's first shown: as its own view, or beside the chat in full screen.
  const historyShown = open && (view === "history" || mode === "full");
  useEffect(() => {
    if (!historyShown || conversations) return;
    fetch("/api/assistant/conversations")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setConversations)
      .catch(() => setConversations([]));
  }, [historyShown, conversations]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, view, mode]);

  useEffect(() => {
    if (open && view === "chat") textarea.current?.focus({ preventScroll: true });
  }, [open, view, conversationId]);

  // Embedded, the chat sizes its iframe on the page around it.
  useEffect(() => {
    const frame = embedded ? (window.frameElement as HTMLElement | null) : null;
    if (!frame) return;
    const corner = { top: "auto", left: "auto", right: "16px", bottom: "16px" };
    Object.assign(
      frame.style,
      mode === "closed"
        ? { ...corner, width: "56px", height: "56px", borderRadius: "50%" }
        : covering
          ? { top: "0", left: "0", right: "0", bottom: "0", width: "100%", height: "100%", borderRadius: "0" }
          : { ...corner, width: "400px", height: "min(640px, calc(100dvh - 32px))", borderRadius: "16px" },
    );
  }, [embedded, mode, covering]);

  // The page behind a chat that covers it doesn't scroll along.
  useEffect(() => {
    if (!covering) return;
    const root = hostWindow(embedded).document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [covering, embedded]);

  function startNew() {
    if (busy) return;
    setConversationId(null);
    setMessages([]);
    setInput("");
    setView("chat");
    storage.set(local, CURRENT_KEY, null);
  }

  async function pick(id: string) {
    if (busy) return;
    setView("chat");
    if (id === conversationId) return;
    const res = await fetch(`/api/assistant/conversations/${id}`).catch(() => null);
    if (!res?.ok) return setConversations((list) => list?.filter((c) => c.id !== id) ?? null);
    const body = await res.json();
    setConversationId(id);
    setMessages(body.messages);
    storage.set(local, CURRENT_KEY, id);
  }

  async function remove(id: string) {
    setConversations((list) => list?.filter((c) => c.id !== id) ?? null);
    if (id === conversationId) startNew();
    await fetch(`/api/assistant/conversations/${id}`, { method: "DELETE" }).catch(() => {});
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const id = conversationId ?? crypto.randomUUID();
    if (!conversationId) {
      setConversationId(id);
      storage.set(local, CURRENT_KEY, id);
    }
    // Failed answers aren't sent back; the question before one is replaced by the new one.
    const history = messages.filter((m) => !m.error);
    if (history.at(-1)?.role === "user") history.pop();
    const sent: Message[] = [...history, { role: "user", content: q }];
    let answer: Message = { role: "assistant", content: "" };
    const update = (fn: (m: Message) => Message) => {
      answer = fn(answer);
      setMessages([...sent, answer]);
    };
    setMessages([...sent, answer]);
    setInput("");
    setBusy(true);
    setActivity("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: sent.map(({ role, content }) => ({ role, content })) }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        if (body.needsKey) setView("settings");
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
            // The blank line between rounds of tool calls doesn't count as the answer arriving.
            if (ev.text.trim()) setActivity(null);
            update((m) => ({ ...m, content: m.content + ev.text }));
          } else if (ev.type === "tool") setActivity(`liest ${TOOL_LABELS[ev.name] ?? ev.name}`);
          else if (ev.type === "done") {
            update((m) => ({ ...m, content: m.content.trim(), cost: ev.cost }));
            setStatus(ev.status);
          } else if (ev.type === "error") {
            if (ev.status) setStatus(ev.status);
            if (ev.needsKey) setView("settings");
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
      const saved = [...sent, answer];
      void saveConversation(id, saved);
      setConversations((list) => list && [{ id, title: titleOf(saved), updatedAt: new Date().toISOString() }, ...list.filter((c) => c.id !== id)]);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        lang="de-CH"
        onClick={() => setMode("open")}
        aria-label="Assistent öffnen"
        title="Assistent"
        className={`${embedded ? "fixed inset-0" : "fixed right-4 bottom-4 h-14 w-14 shadow-lg"} z-50 flex items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 print:hidden`}
      >
        <ChatIcon />
        {busy && <span className="absolute top-1 right-1 h-3 w-3 animate-pulse rounded-full border-2 border-white bg-amber-400" aria-label="Antwort wird geladen" />}
      </button>
    );
  }

  const iconButton = (label: string, onClick: () => void, icon: React.ReactNode, extra = "", pressed?: boolean) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 aria-pressed:bg-zinc-100 aria-pressed:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:aria-pressed:bg-zinc-800 dark:aria-pressed:text-zinc-100 ${extra}`}
    >
      {icon}
    </button>
  );
  const historyList = (
    <HistoryList conversations={conversations} currentId={conversationId} disabled={busy} onPick={(id) => void pick(id)} onDelete={(id) => void remove(id)} />
  );
  const narrow = mode === "full" ? "mx-auto w-full max-w-3xl" : "";

  return (
    <section
      lang="de-CH"
      role="dialog"
      aria-label="Assistent"
      aria-modal={covering || undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape") setMode(mode === "full" && !small ? "open" : "closed");
      }}
      className={`fixed z-50 flex flex-col overflow-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 print:hidden ${
        embedded || covering
          ? "inset-0"
          : "right-4 bottom-4 h-[min(640px,calc(100dvh-2rem))] w-[400px] rounded-2xl border border-zinc-200 shadow-2xl dark:border-zinc-800"
      } ${embedded && !covering ? "rounded-2xl border border-zinc-200 dark:border-zinc-800" : ""}`}
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mr-auto min-w-0">
          <h2 className="text-sm font-semibold">Assistent</h2>
          <p className="truncate text-xs text-zinc-500">
            {view === "settings" ? "Kosten, API-Key und Modell" : view === "history" ? "Verlauf" : status ? ASSISTANT_MODELS.find((m) => m.id === status.model)?.label : "Keine Anlageberatung"}
          </p>
        </div>
        {iconButton("Verlauf", () => setView(view === "history" ? "chat" : "history"), <HistoryIcon />, mode === "full" ? "md:hidden" : "", view === "history")}
        {iconButton("Neues Gespräch", startNew, <PlusIcon />)}
        {iconButton("Kosten und Einstellungen", () => setView(view === "settings" ? "chat" : "settings"), <SettingsIcon />, "", view === "settings")}
        {!small && iconButton(mode === "full" ? "Verkleinern" : "Vollbild", () => setMode(mode === "full" ? "open" : "full"), <ExpandIcon full={mode === "full"} />)}
        {iconButton("Schliessen", () => setMode("closed"), <CloseIcon />)}
      </header>
      {status?.connected && view !== "settings" && <LimitBar status={status} onSetLimit={() => setView("settings")} />}

      <div className="flex min-h-0 flex-1">
        {mode === "full" && (
          <aside className="hidden w-72 shrink-0 flex-col border-r border-zinc-200 md:flex dark:border-zinc-800">
            <p className="px-4 pt-3 pb-1 text-xs font-medium text-zinc-500">Verlauf</p>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">{historyList}</div>
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {view === "history" ? (
            <div className={`min-h-0 flex-1 overflow-y-auto p-2 ${mode === "full" ? "md:hidden" : ""}`}>{historyList}</div>
          ) : null}
          {view === "settings" ? (
            <div className="@container min-h-0 flex-1 overflow-y-auto p-3">
              <div className={`space-y-3 ${narrow}`}>
                {status ? (
                  <>
                    <SpendCard status={status} onChange={setStatus} />
                    {status.connected && <ModelPicker status={status} disabled={busy} onChange={setStatus} />}
                    <KeyCard
                      status={status}
                      onChange={(s) => {
                        setStatus(s);
                        if (s.connected && !status.connected) setView("chat");
                      }}
                    />
                  </>
                ) : (
                  <StatusPending error={statusError} />
                )}
              </div>
            </div>
          ) : null}
          {view === "chat" || (view === "history" && mode === "full") ? (
            <div className={`flex min-h-0 flex-1 flex-col ${view === "history" ? "hidden md:flex" : ""}`}>
              <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className={`space-y-3 ${narrow}`}>
                  {!status ? (
                    <StatusPending error={statusError} />
                  ) : !status.connected ? (
                    <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <p>Verbinde deinen eigenen Claude API-Key, um Fragen zu deinem Depot, deinen Finanzen und den Märkten zu stellen.</p>
                      <button className={primaryButtonClass} onClick={() => setView("settings")}>
                        API-Key verbinden
                      </button>
                    </div>
                  ) : (
                    messages.length === 0 && (
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
                    )
                  )}
                  {messages.map((m, i) =>
                    m.role === "user" ? (
                      <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-3 py-2 text-sm whitespace-pre-wrap text-white dark:bg-zinc-100 dark:text-zinc-900">
                        {m.content}
                      </div>
                    ) : (
                      <div key={i} className="max-w-full rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                        {m.content && <Markdown text={m.content} />}
                        {busy && i === messages.length - 1 && activity !== null && <Waiting detail={activity} />}
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
                </div>
              </div>

              {status?.connected && (
                <form
                  className="shrink-0 border-t border-zinc-200 bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-zinc-800 dark:bg-zinc-900"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask(input);
                  }}
                >
                  <div className={`flex gap-2 ${narrow}`}>
                    <textarea
                      ref={textarea}
                      className={`${inputClass} min-h-10 resize-none`}
                      rows={1}
                      maxLength={8000}
                      aria-label="Frage"
                      placeholder="Deine Frage…"
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
                  </div>
                </form>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function StatusPending({ error }: { error: string | null }) {
  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  return (
    <div role="status" className="flex items-center gap-2 py-1 text-sm text-zinc-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500 motion-reduce:animate-none" aria-hidden />
      Lädt…
    </div>
  );
}

const dateFormat = new Intl.DateTimeFormat("de-CH", { day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit" });

/** When a conversation was last continued: the time today, the date before. */
function when(iso: string) {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? timeFormat.format(d) : dateFormat.format(d);
}

/** Past conversations to pick up again or delete. */
function HistoryList({
  conversations,
  currentId,
  disabled,
  onPick,
  onDelete,
}: {
  conversations: ConversationSummary[] | null;
  currentId: string | null;
  disabled: boolean;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!conversations) return <div className="p-2"><StatusPending error={null} /></div>;
  if (!conversations.length) return <p className="p-2 text-sm text-zinc-500">Noch keine Gespräche.</p>;
  return (
    <ul className="space-y-0.5">
      {conversations.map((c) => (
        <li key={c.id} className="group flex items-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(c.id)}
            aria-current={c.id === currentId || undefined}
            className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left disabled:opacity-60 aria-[current]:bg-zinc-200/70 dark:aria-[current]:bg-zinc-800"
          >
            <span className="block truncate text-sm">{c.title}</span>
            <span className="block text-xs text-zinc-500">{when(c.updatedAt)}</span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(c.id)}
            disabled={disabled && c.id === currentId}
            aria-label={`«${c.title}» löschen`}
            title="Löschen"
            className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:text-red-600 disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 dark:hover:text-red-400"
          >
            <TrashIcon />
          </button>
        </li>
      ))}
    </ul>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  className: "h-5 w-5",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function ChatIcon() {
  return (
    <svg {...iconProps} className="h-6 w-6">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

function ExpandIcon({ full }: { full: boolean }) {
  return (
    <svg {...iconProps}>
      {full ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...iconProps}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...iconProps} className="h-4 w-4">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  );
}

/** What all the user's keys have spent this month (or in total), to compare with their limit. */
function spentTowards(status: AssistantStatus) {
  return status.limit?.period === "total" ? status.spent.total : status.spent.month;
}

/** The spend over all keys against the user's Console limit, right under the chat's header. */
function LimitBar({ status, onSetLimit }: { status: AssistantStatus; onSetLimit: () => void }) {
  const { limit } = status;
  const spent = spentTowards(status);
  const share = limit ? spent / limit.usd : 0;
  const tone = share >= 1 ? "bg-red-500" : share >= 0.8 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="shrink-0 border-b border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate">
          Alle Keys:{" "}
          {limit ? (
            <>
              <span className={`font-medium tabular-nums ${share >= 1 ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100"}`}>{usd(spent)}</span> von{" "}
              <span className="tabular-nums">{usd(limit.usd)}</span> {limit.period === "month" ? "diesen Monat" : "insgesamt"}
              {share >= 1 && " · Limit erreicht"}
            </>
          ) : (
            <>
              <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{usd(status.spent.month)}</span> diesen Monat
            </>
          )}
        </span>
        <button type="button" className="shrink-0 underline hover:text-zinc-900 dark:hover:text-zinc-100" onClick={onSetLimit}>
          {limit ? "Ändern" : "Limit setzen"}
        </button>
      </div>
      {limit && (
        <div
          className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          role="meter"
          aria-label="Verbrauch des Limits"
          aria-valuemin={0}
          aria-valuemax={limit.usd}
          aria-valuenow={Math.min(spent, limit.usd)}
        >
          <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

/** What the assistant has cost over all the user's keys, per key, their limit, and where to top up. */
function SpendCard({ status, onChange }: { status: AssistantStatus; onChange: (s: AssistantStatus) => void }) {
  const tile = (label: string, value: string, sub?: string) => (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-zinc-400">{sub}</p>}
    </div>
  );
  return (
    <Card title="Deine Kosten, alle Keys">
      <div className="grid grid-cols-3 gap-3">
        {tile("Heute", usd(status.spent.today))}
        {tile("Dieser Monat", usd(status.spent.month), `${status.requests.month} Anfragen`)}
        {tile("Total", usd(status.spent.total), `${status.requests.total} Anfragen`)}
      </div>
      <LimitForm status={status} onChange={onChange} />
      {status.keys.length > 1 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-zinc-500">Nach Key</p>
          <table className="mt-1 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1 font-normal">Key</th>
                <th className="py-1 text-right font-normal">Dieser Monat</th>
                <th className="py-1 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {status.keys.map((k) => (
                <tr key={k.hint ?? "unknown"} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1">
                    {k.hint ?? "früher (nicht zugeordnet)"}
                    {k.current && <span className="text-xs text-zinc-500"> · verbunden</span>}
                  </td>
                  <td className="py-1 text-right">{usd(k.month)}</td>
                  <td className="py-1 text-right">{usd(k.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-zinc-500">
        Geschätzt aus den Tokens jeder Antwort, zu Anthropics Listenpreisen in US-Dollar. Bezahlt wird über dein eigenes Anthropic-Konto: Guthaben und genaue Abrechnung siehst du in der{" "}
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
          Limit in der Console
        </a>
      </div>
    </Card>
  );
}

/** The limit the user set in the Claude Console, entered here so the chat can show how much of it is used. */
function LimitForm({ status, onChange }: { status: AssistantStatus; onChange: (s: AssistantStatus) => void }) {
  const [amount, setAmount] = useState(status.limit ? String(status.limit.usd) : "");
  const [period, setPeriod] = useState<LimitPeriod>(status.limit?.period ?? "month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number(amount.replace(",", "."));
  const valid = amount.trim() !== "" && Number.isFinite(value) && value > 0;
  const unchanged = status.limit ? valid && value === status.limit.usd && period === status.limit.period : !valid;

  async function save(limit: { usd: number; period: LimitPeriod } | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant/key", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? `Fehler ${res.status}`);
      if (!limit) setAmount("");
      onChange(body);
    } catch {
      setError("Keine Verbindung zum Server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-3 space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void save({ usd: value, period });
      }}
    >
      <label className="block text-xs font-medium text-zinc-500" htmlFor="assistant-limit">
        Dein Limit aus der{" "}
        <a href={LIMITS_URL} target="_blank" rel="noreferrer" className="underline">
          Claude Console
        </a>
      </label>
      <div className="flex flex-wrap gap-2">
        <div className="relative w-28">
          <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-sm text-zinc-400">$</span>
          <input
            id="assistant-limit"
            className={`${inputClass} pl-5 tabular-nums`}
            inputMode="decimal"
            placeholder="5.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <select className={`${buttonClass} w-auto`} value={period} onChange={(e) => setPeriod(e.target.value as LimitPeriod)} aria-label="Zeitraum">
          <option value="month">pro Monat (Ausgabenlimit)</option>
          <option value="total">insgesamt (Guthaben)</option>
        </select>
        <button type="submit" className={primaryButtonClass} disabled={busy || !valid || unchanged}>
          Speichern
        </button>
        {status.limit && (
          <button type="button" className={buttonClass} disabled={busy} onClick={() => void save(null)}>
            Entfernen
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-500">
        {error ??
          "Anthropic lässt das Limit nicht mit einem normalen API-Key auslesen, darum trägst du es hier ein: das monatliche Ausgabenlimit unter «Limits» oder das gekaufte Guthaben. Oben im Chat siehst du dann, wie viel davon alle deine Keys zusammen schon gebraucht haben. Stoppen tut die Console, nicht diese Anzeige."}
      </p>
    </form>
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
            {m.label} <span className="hidden text-xs text-zinc-500 @md:inline">· {m.hint}</span>
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
          className="flex flex-col gap-2 @md:flex-row"
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
