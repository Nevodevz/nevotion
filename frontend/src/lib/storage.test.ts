import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearToken, getToken, setToken } from "./api";
import { readStoredValue } from "./storage";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("existing browser sessions after renaming", () => {
  it("moves an existing employee token and removes the old copy", () => {
    localStorage.setItem("nevodevs_token", "existing-session");
    expect(getToken()).toBe("existing-session");
    expect(localStorage.getItem("espada_token")).toBe("existing-session");
    expect(localStorage.getItem("nevodevs_token")).toBeNull();
  });

  it("prefers the current token over a stale legacy token", () => {
    localStorage.setItem("espada_token", "current-session");
    localStorage.setItem("nevodevs_token", "stale-session");
    expect(getToken()).toBe("current-session");
    expect(localStorage.getItem("nevodevs_token")).toBeNull();
  });

  it("does not restore a legacy session after logout", () => {
    localStorage.setItem("nevodevs_token", "existing-session");
    clearToken();
    expect(getToken()).toBeNull();
    setToken("new-session");
    expect(getToken()).toBe("new-session");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("keeps the employee's chosen theme", () => {
    localStorage.setItem("nevodevs_theme", "dark");
    expect(readStoredValue("espada_theme", "nevodevs_theme")).toBe("dark");
    expect(localStorage.getItem("espada_theme")).toBe("dark");
    expect(localStorage.getItem("nevodevs_theme")).toBeNull();
  });

  it("can read safely during server rendering", () => {
    vi.stubGlobal("window", undefined);
    expect(getToken()).toBeNull();
    expect(readStoredValue("espada_theme", "nevodevs_theme")).toBeNull();
  });
});
