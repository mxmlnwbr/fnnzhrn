import { ProjectCard } from "@/components/site/ProjectCard";
import { reveal } from "@/components/site/reveal";
import { SiteHeader } from "@/components/site/SiteHeader";
import { TickerBackground } from "@/components/site/TickerBackground";
import { currentUser } from "@/lib/session";
import "./site.css";

const CHART = "M0 60 L40 54 L80 58 L120 46 L160 50 L200 38 L240 44 L280 30 L320 36 L360 26 L400 32 L440 18 L480 24 L520 12 L560 16 L600 4";
const LETTERS = ["f", "n", "n", "z", "h", "r", "n"];

const iconProps = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const TOOLS = [
  {
    href: "/depot",
    title: "Depot",
    text: "Unser Portfolio-Tracker",
    icon: (
      <svg {...iconProps}>
        <path d="M21 12a9 9 0 1 1-9-9v9z" />
        <path d="M15 3.5A9 9 0 0 1 20.5 9H15z" />
      </svg>
    ),
  },
  {
    href: "/cockpit",
    title: "Cockpit",
    text: "Depot, Märkte, News und Chancen auf einen Blick",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
];

export default async function Home() {
  const user = await currentUser();
  return (
    <div className="site">
      <TickerBackground />
      <SiteHeader email={user?.email ?? null} />
      <main>
        <span className="badge site-reveal" style={reveal(0.05)}>
          We talk about money
        </span>
        <h1 aria-label="fnnzhrn.">
          <span aria-hidden>
            {LETTERS.map((c, i) => (
              <span key={i} className="ch" style={{ "--i": i } as React.CSSProperties}>
                {c}
              </span>
            ))}
            <span className="ch dot" style={{ "--i": LETTERS.length } as React.CSSProperties}>
              .
            </span>
          </span>
        </h1>

        <div className="chart-wrap">
          <svg className="chart" viewBox="0 0 600 72" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="area" fill="url(#fill)" d={`${CHART} L600 72 L0 72 Z`} />
            <path className="line site-draw" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" d={CHART} />
            <path className="site-shimmer" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" d={CHART} />
          </svg>
          <span className="chart-dot" aria-hidden />
        </div>

        <h2 className="site-reveal" style={reveal(1.1)}>
          Tools
        </h2>
        <ul>
          {TOOLS.map((t, i) => (
            <li key={t.href} className="site-reveal" style={reveal(1.25 + i * 0.1)}>
              <ProjectCard {...t} locked={!user} />
            </li>
          ))}
        </ul>
        {!user && (
          <p className="hint site-reveal" style={reveal(1.5)}>
            Die Tools sind für Mitglieder. <a href="/login">Anmelden</a>, um sie zu öffnen.
          </p>
        )}
      </main>
      <footer className="site-reveal" style={reveal(1.6)}>
        © fnnzhrn · Keine Anlageberatung
      </footer>
    </div>
  );
}
