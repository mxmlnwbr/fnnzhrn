"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createDepot, deleteDepot, renameDepot, selectDepot, useActiveDepot, useDepots } from "@/lib/storage";
import { ALL_DEPOTS_ID } from "@/lib/sync";
import { useChoice } from "./ChoiceDialog";
import { buttonClass, inputClass, primaryButtonClass } from "./ui";

/** The page title, which doubles as the switcher between depots. */
export function DepotMenu() {
  const depots = useDepots();
  const current = useActiveDepot();
  const [open, setOpen] = useState(false);
  /** Which name form is showing: a new depot, or renaming the current one. */
  const [editing, setEditing] = useState<"new" | "rename" | null>(null);
  const [name, setName] = useState("");
  const [choiceDialog, ask] = useChoice();
  const root = useRef<HTMLDivElement>(null);
  const combined = current.id === ALL_DEPOTS_ID;
  const options = [
    ...(depots.length > 1
      ? [{ id: ALL_DEPOTS_ID, name: "All depots", hint: `${depots.length} added up` }]
      : []),
    ...depots.map((d) => ({ id: d.id, name: d.name, hint: d.data.settings.baseCurrency })),
  ];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !root.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setEditing(null);
  }

  function edit(mode: "new" | "rename") {
    setEditing(mode);
    setName(mode === "rename" ? current.name : nextName(depots.map((d) => d.name)));
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editing === "new") createDepot(trimmed);
    else renameDepot(current.id, trimmed);
    close();
  }

  async function remove() {
    close();
    const { transactions, cash } = current.data;
    const ok = await ask(`Delete “${current.name}”`, "This can't be undone, so consider exporting it first.", [
      {
        value: true,
        label: "Delete depot",
        description: `Removes the depot with its ${transactions.length} transaction${transactions.length === 1 ? "" : "s"} and ${cash.length} cash account${cash.length === 1 ? "" : "s"}.`,
        tone: "danger" as const,
      },
    ]);
    if (ok) deleteDepot(current.id);
  }

  return (
    <div ref={root} className="relative">
      {choiceDialog}
      <h1 className="text-2xl font-semibold">
        <button
          className="-mx-1 flex max-w-full items-center gap-1 rounded-md px-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
          onClick={() => (open ? close() : setOpen(true))}
          aria-expanded={open}
          aria-haspopup="listbox"
          title="Switch depot"
        >
          <span className="truncate">{current.name}</span>
          <ChevronIcon />
        </button>
      </h1>
      {open && (
        <div className="animate-fade-in absolute left-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-200 bg-white p-2 text-sm shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <ul role="listbox" aria-label="Depots" className="max-h-72 overflow-y-auto">
            {options.map((d) => (
              <li key={d.id}>
                <button
                  role="option"
                  aria-selected={d.id === current.id}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => {
                    selectDepot(d.id);
                    close();
                  }}
                >
                  <span className="w-4 shrink-0">{d.id === current.id && <CheckIcon />}</span>
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{d.hint}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
            {editing ? (
              <form
                className="space-y-2 p-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <label className="block text-xs text-zinc-500" htmlFor="depot-name">
                  {editing === "new" ? "Name of the new depot" : `Rename “${current.name}”`}
                </label>
                <input
                  id="depot-name"
                  className={inputClass}
                  autoFocus
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={(e) => e.target.select()}
                />
                <div className="flex justify-end gap-2">
                  <button type="button" className={buttonClass} onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                  <button className={primaryButtonClass} disabled={!name.trim()}>
                    {editing === "new" ? "Create" : "Rename"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col">
                <MenuItem onClick={() => edit("new")}>New depot</MenuItem>
                {!combined && <MenuItem onClick={() => edit("rename")}>Rename “{current.name}”</MenuItem>}
                {!combined && depots.length > 1 && (
                  <MenuItem danger onClick={() => void remove()}>
                    Delete “{current.name}”
                  </MenuItem>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** "Depot 2" for a first new depot, or the next free number after that. */
function nextName(names: string[]) {
  let n = names.length + 1;
  while (names.includes(`Depot ${n}`)) n++;
  return `Depot ${n}`;
}

function MenuItem({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={`truncate rounded-md px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 ${danger ? "text-red-600 dark:text-red-400" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-zinc-500" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}
