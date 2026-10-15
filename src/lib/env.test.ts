import { describe, expect, it } from "vitest";
import { cleanEnv, syncConfigured } from "./env";

describe("cleanEnv", () => {
  it("strips quotes and whitespace that secret managers keep", () => {
    expect(cleanEnv('"postgresql://u@ep-x-pooler.neon.tech/db"')).toBe("postgresql://u@ep-x-pooler.neon.tech/db");
    expect(cleanEnv(" 're_x'\n")).toBe("re_x");
    expect(cleanEnv("postgresql://u@ep-x-pooler.neon.tech/db")).toBe("postgresql://u@ep-x-pooler.neon.tech/db");
  });

  it("treats empty values as missing", () => {
    expect(cleanEnv(undefined)).toBeUndefined();
    expect(cleanEnv(' "" ')).toBeUndefined();
  });
});

describe("syncConfigured", () => {
  it("needs the database, the auth secret and the email key", () => {
    const all = { DATABASE_URL: "postgres://x", BETTER_AUTH_SECRET: "s", RESEND_API_KEY: "re_x" };
    expect(syncConfigured(all)).toBe(true);
    expect(syncConfigured({ ...all, RESEND_API_KEY: ' "" ' })).toBe(false);
    expect(syncConfigured({})).toBe(false);
  });
});
