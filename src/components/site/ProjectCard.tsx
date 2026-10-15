"use client";

import type { ReactNode } from "react";

/** A tool on the landing page; signed-out visitors go through the sign-in page first. Tools marked `soon` are shown but can't be opened yet. */
export function ProjectCard({ href, icon, title, text, locked, soon }: { href: string; icon: ReactNode; title: string; text: string; locked: boolean; soon?: boolean }) {
  if (soon)
    return (
      <div className="project soon" aria-disabled="true">
        <span className="icon" aria-hidden>
          {icon}
        </span>
        <span className="text">
          <strong>{title}</strong>
          <span>{text}</span>
        </span>
        <span className="soon-tag">Coming soon</span>
      </div>
    );
  return (
    <a
      className="project"
      href={locked ? `/login?next=${encodeURIComponent(href)}` : href}
      onPointerMove={(e) => {
        // Cursor spotlight
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--x", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--y", `${e.clientY - r.top}px`);
      }}
    >
      <span className="icon" aria-hidden>
        {icon}
      </span>
      <span className="text">
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
      {locked && (
        <span className="lock" title="Anmeldung nötig">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <span className="sr-only">Anmeldung nötig</span>
        </span>
      )}
      <span className="arrow" aria-hidden>
        →
      </span>
    </a>
  );
}
