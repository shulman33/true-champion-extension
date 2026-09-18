import { describe as suite, expect, it } from "vitest";
import { ago, badgeFor, describe, toLastResult } from "./summary";

const NOW = 1_800_000_000_000;

suite("toLastResult", () => {
  it("remembers a connect with the league name", () => {
    expect(toLastResult({ type: "tc:status", state: "connected", identity: "Sam", league: { slug: "kush", name: "Kush Boyz" }, connected: true }, NOW)).toEqual({ state: "connected", at: NOW, detail: "Kush Boyz" });
  });

  it("remembers why a connect was rejected", () => {
    expect(toLastResult({ type: "tc:status", state: "rejected", reason: "Not a member of that league." }, NOW)).toEqual({ state: "rejected", at: NOW, detail: "Not a member of that league." });
  });

  it("ignores statuses that are not an ending", () => {
    expect(toLastResult({ type: "tc:status", state: "awaiting_login" }, NOW)).toBeNull();
    expect(toLastResult({ type: "tc:status", state: "verifying" }, NOW)).toBeNull();
    expect(toLastResult({ type: "tc:status", state: "cancelled" }, NOW)).toBeNull();
  });
});

suite("badgeFor", () => {
  it("marks progress, success and failure, and clears on cancel", () => {
    expect(badgeFor({ type: "tc:status", state: "awaiting_login" }).text).toBe("…");
    expect(badgeFor({ type: "tc:status", state: "connected", identity: "Sam", league: null, connected: true }).text).toBe("✓");
    expect(badgeFor({ type: "tc:status", state: "timeout" }).text).toBe("!");
    expect(badgeFor({ type: "tc:status", state: "cancelled" }).text).toBe("");
  });
});

suite("ago", () => {
  it("reads like a person would say it", () => {
    expect(ago(NOW - 20_000, NOW)).toBe("just now");
    expect(ago(NOW - 5 * 60_000, NOW)).toBe("5 min ago");
    expect(ago(NOW - 3 * 3_600_000, NOW)).toBe("3 hr ago");
    expect(ago(NOW - 26 * 3_600_000, NOW)).toBe("yesterday");
    expect(ago(NOW - 72 * 3_600_000, NOW)).toBe("3 days ago");
  });
});

suite("describe", () => {
  it("puts a pending ESPN login ahead of an older result", () => {
    const view = describe({ waitingForLogin: true, last: { state: "connected", at: NOW - 60_000, detail: "Kush Boyz" }, now: NOW });
    expect(view.tone).toBe("busy");
  });

  it("names the league after a connect", () => {
    const view = describe({ waitingForLogin: false, last: { state: "connected", at: NOW - 120_000, detail: "Kush Boyz" }, now: NOW });
    expect(view).toMatchObject({ tone: "ok", title: "Connected Kush Boyz" });
    expect(view.detail).toContain("2 min ago");
  });

  it("shows the reason after a rejection", () => {
    const view = describe({ waitingForLogin: false, last: { state: "rejected", at: NOW, detail: "Not a member of that league." }, now: NOW });
    expect(view.tone).toBe("bad");
    expect(view.detail).toContain("Not a member of that league.");
  });

  it("says nothing was sent when there is no history", () => {
    expect(describe({ waitingForLogin: false, last: null, now: NOW }).tone).toBe("idle");
  });
});
