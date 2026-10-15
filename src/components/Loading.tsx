/** Full-page loader for the first load: the app icon's chart line drawing itself. */
export function SplashLoader() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24" role="status">
      <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
        <defs>
          <linearGradient id="splashFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0ea5e9" stopOpacity={0.45} />
            <stop offset="1" stopColor="#0ea5e9" stopOpacity={0} />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="#18181b" />
        <path className="animate-fade-area" d="M10 46 L22 34 L31 40 L44 24 L54 16 L54 54 L10 54 Z" fill="url(#splashFill)" />
        <path
          className="animate-draw-line"
          d="M10 46 L22 34 L31 40 L44 24 L54 16"
          pathLength={100}
          fill="none"
          stroke="#38bdf8"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="text-sm text-zinc-500">Loading your portfolio…</p>
    </div>
  );
}

/** Thin indeterminate bar pinned to the top of the viewport while data refreshes. */
export function TopProgress({ active }: { active: boolean }) {
  return (
    <div
      className={`fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}
      role="progressbar"
      aria-hidden={!active}
      aria-label="Updating prices"
    >
      {active && <div className="animate-slide-bar h-full w-1/4 bg-sky-500" />}
    </div>
  );
}

export function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 ${spinning ? "motion-safe:animate-spin" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
