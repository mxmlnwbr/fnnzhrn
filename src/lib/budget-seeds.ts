import { type Budget, DEFAULT_CATEGORIES } from "./budget";

/**
 * Overviews brought over from spreadsheets, keyed by the account's email. An account starts with its
 * entry the first time it opens Finanzen; after that only what's saved in the database counts.
 */
export const BUDGET_SEEDS: Record<string, Budget> = {
  // From the spreadsheet "Finanzübersicht".
  "maximilian.weber@bluewin.ch": {
    version: 1,
    currency: "CHF",
    categories: DEFAULT_CATEGORIES,
    income: [
      { id: "seed-income-1", name: "Netto Lohn", amount: 5223.15, interval: "month13" },
      { id: "seed-income-2", name: "Lunch Check", amount: -100, interval: "month" },
    ],
    fixed: [
      { id: "seed-fixed-1", name: "Miete (+ Parkplatz 65.- pro Monat)", amount: 1385, interval: "month", category: "cat-wohnen" },
      { id: "seed-fixed-2", name: "Halbtax Plus", amount: 2100, interval: "year", category: "cat-mobilitaet" },
      { id: "seed-fixed-3", name: "Strom", amount: 150, interval: "month", category: "cat-wohnen" },
      { id: "seed-fixed-4", name: "Krankenkasse (Grundversicherung)", amount: 139.4, interval: "month", category: "cat-versicherungen" },
      { id: "seed-fixed-5", name: "Fitnessabo (minus 150 CHF Anteil CSS)", amount: 640, interval: "year", category: "cat-freizeit" },
      { id: "seed-fixed-6", name: "Friseur", amount: 50, interval: "month", category: "cat-gesundheit" },
      { id: "seed-fixed-7", name: "Militär", amount: 400, interval: "year" },
      { id: "seed-fixed-8", name: "Handyabo + 2nd SIM (WLAN)", amount: 25.95, interval: "month", category: "cat-abos" },
      { id: "seed-fixed-9", name: "Tennis", amount: 370, interval: "year", category: "cat-freizeit" },
      { id: "seed-fixed-10", name: "Krankenkasse (Zusatzversicherung)", amount: 28.1, interval: "month", category: "cat-versicherungen" },
      { id: "seed-fixed-11", name: "Serafe", amount: 325.4, interval: "year", category: "cat-abos" },
      { id: "seed-fixed-12", name: "Auto (Versicherung)", amount: 352.25, interval: "year", category: "cat-versicherungen" },
      { id: "seed-fixed-13", name: "Privathaftpflicht / Hausrat", amount: 214.35, interval: "year", category: "cat-versicherungen" },
      { id: "seed-fixed-14", name: "Halbtax", amount: 170, interval: "year", category: "cat-mobilitaet" },
      { id: "seed-fixed-15", name: "Auto (Strassenverkehrssteuer)", amount: 169, interval: "year", category: "cat-mobilitaet" },
      { id: "seed-fixed-16", name: "Rega Gönnerschaft", amount: 40, interval: "year", category: "cat-versicherungen" },
      { id: "seed-fixed-17", name: "Google Drive", amount: 20, interval: "year", category: "cat-abos" },
      { id: "seed-fixed-18", name: "Bitwarden", amount: 12.37, interval: "year", category: "cat-abos" },
      { id: "seed-fixed-19", name: "iCloud", amount: 1, interval: "month", category: "cat-abos" },
    ],
    variable: [],
    invest: [
      { id: "seed-invest-1", name: "Säule 3a", amount: 7258, interval: "year" },
      { id: "seed-invest-2", name: "Aktien", amount: 683.35, interval: "month" },
    ],
    note: "Wichtig: Steuern & 13. Monatslohn sollten sich aufheben!",
  },
};
