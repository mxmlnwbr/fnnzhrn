import type { CSSProperties } from "react";

/** Inline style for the staggered load-in animation (.site-reveal) with the given delay in seconds. */
export const reveal = (d: number) => ({ "--d": `${d}s` }) as CSSProperties;
