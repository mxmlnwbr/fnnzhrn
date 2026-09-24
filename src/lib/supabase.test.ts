import { describe, expect, it } from "vitest";
import { cleanEnv } from "./supabase";

describe("cleanEnv", () => {
  it("strips quotes and whitespace that secret managers keep", () => {
    expect(cleanEnv('"https://abc.supabase.co"')).toBe("https://abc.supabase.co");
    expect(cleanEnv(" 'sb_publishable_x'\n")).toBe("sb_publishable_x");
    expect(cleanEnv("https://abc.supabase.co")).toBe("https://abc.supabase.co");
  });

  it("treats empty values as missing", () => {
    expect(cleanEnv(undefined)).toBeUndefined();
    expect(cleanEnv(' "" ')).toBeUndefined();
  });
});
