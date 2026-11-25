import { useColorScheme } from "react-native";

/** fnnzhrn's palette, the same values as src/app/globals.css in the web app. */
const palettes = {
  light: {
    bg: "#ffffff",
    fg: "#111412",
    muted: "#5f6661",
    line: "#e3e6e4",
    card: "#f7f8f7",
    accent: "#0d8048",
    accentFg: "#ffffff",
    accentSoft: "rgba(13, 128, 72, 0.1)",
    up: "#0d8048",
    down: "#c93434",
    warn: "#b7791f",
    // Chart series, as --series-* in globals.css: income, fixed costs, flexible spending, investing, the rest.
    income: "#1baf7a",
    fixed: "#eb6834",
    variable: "#eda100",
    invest: "#2a78d6",
    other: "#a1a1aa",
  },
  dark: {
    bg: "#0b0d0c",
    fg: "#ecefed",
    muted: "#949b96",
    line: "#232826",
    card: "#121614",
    accent: "#3ddc84",
    accentFg: "#0b0d0c",
    accentSoft: "rgba(61, 220, 132, 0.12)",
    up: "#3ddc84",
    down: "#ff6b6b",
    warn: "#f0b429",
    income: "#199e70",
    fixed: "#d95926",
    variable: "#c98500",
    invest: "#3987e5",
    other: "#6d7570",
  },
};

export type Palette = { [K in keyof (typeof palettes)["light"]]: string };

export function useColors(): Palette {
  return palettes[useColorScheme() === "dark" ? "dark" : "light"];
}

/** Green for gains, red for losses, muted for zero. */
export function signColor(colors: Palette, value: number): string {
  return value > 0 ? colors.up : value < 0 ? colors.down : colors.muted;
}
