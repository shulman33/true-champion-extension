import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancel, checkEndpoint, ENDPOINT_PATH, ESPN_LOGIN_URL, onEspnCookieSet, onTimeout, startConnect, type Browser, type Pending } from "./connect";
import type { Status } from "./protocol";

const ORIGIN = "https://true-champion-app.vercel.app";
const ENDPOINT = `${ORIGIN}${ENDPOINT_PATH}`;
const TOKEN = "a".repeat(43);

function fakeBrowser(cookies: Partial<Record<"espn_s2" | "SWID", string>>, reply: { status: number; body: unknown } = { status: 200, body: { ok: true, identity: "Sam", league: { slug: "kush", name: "Kush Boyz" }, connected: true } }) {
  let pending: Pending | null = null;
  let timeoutMinutes: number | null = null;
  const statuses: Status[] = [];
  const fetch = vi.fn(async () => ({ status: reply.status, json: async () => reply.body }));
  const b: Browser & { statuses: Status[]; fetch: typeof fetch; closed: number[]; opened: string[]; timeout(): number | null; pendingRow(): Pending | null; cookies: typeof cookies } = {
    cookies,
    statuses,
    fetch,
    closed: [],
    opened: [],
    version: "1.0.0",
    async getCookie(name) {
      return b.cookies[name] ?? null;
    },
    async openTab(url) {
      b.opened.push(url);
      return 77;
    },
    async closeTab(id) {
      b.closed.push(id);
    },
    async getPending() {
      return pending;
    },
    async setPending(p) {
      pending = p;
    },
    async setTimeout(m) {
      timeoutMinutes = m;
    },
    notify(s) {
      statuses.push(s);
    },
    timeout: () => timeoutMinutes,
    pendingRow: () => pending,
  };
  return b;
}

describe("checkEndpoint", () => {
  it("accepts the connect route on the sender's https origin", () => {
    expect(checkEndpoint(ENDPOINT, ORIGIN)).toEqual({ ok: true, url: ENDPOINT });
    expect(checkEndpoint(`${ENDPOINT}?x=1#y`, ORIGIN)).toEqual({ ok: true, url: ENDPOINT });
  });
  it("accepts plain http only on localhost", () => {
    expect(checkEndpoint(`http://localhost:3001${ENDPOINT_PATH}`, "http://localhost:3001").ok).toBe(true);
    expect(checkEndpoint(`http://example.com${ENDPOINT_PATH}`, "http://example.com").ok).toBe(false);
  });
  it("refuses another origin, another path, junk, and a missing sender", () => {
    expect(checkEndpoint(`https://evil.example${ENDPOINT_PATH}`, ORIGIN).ok).toBe(false);
    expect(checkEndpoint(`${ORIGIN}/api/anything`, ORIGIN).ok).toBe(false);
    expect(checkEndpoint("not a url", ORIGIN).ok).toBe(false);
    expect(checkEndpoint(undefined, ORIGIN).ok).toBe(false);
    expect(checkEndpoint(ENDPOINT, undefined).ok).toBe(false);
  });
});

describe("startConnect", () => {
  it("posts both cookies with the token and reports connected", async () => {
    const b = fakeBrowser({ espn_s2: "s2value", SWID: "{SWID}" });
    const result = await startConnect(b, { type: "tc:connect", token: TOKEN, endpoint: ENDPOINT }, ORIGIN);
    expect(result).toMatchObject({ state: "connected", identity: "Sam", league: { slug: "kush" }, connected: true });
    expect(b.statuses.map((s) => s.state)).toEqual(["verifying", "connected"]);
    expect(b.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = b.fetch.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe(ENDPOINT);
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN, espn_s2: "s2value", swid: "{SWID}", extension_version: "1.0.0" });
    expect(b.opened).toEqual([]);
    expect(b.pendingRow()).toBeNull();
  });

  it("relays the server's reason on 422 and stores nothing", async () => {
    const b = fakeBrowser({ espn_s2: "old", SWID: "{SWID}" }, { status: 422, body: { ok: false, error: "ESPN rejected these cookies." } });
    const result = await startConnect(b, { type: "tc:connect", token: TOKEN, endpoint: ENDPOINT }, ORIGIN);
    expect(result).toEqual({ type: "tc:status", state: "rejected", reason: "ESPN rejected these cookies." });
    expect(b.pendingRow()).toBeNull();
  });

  it("reports a network failure without leaking anything", async () => {
    const b = fakeBrowser({ espn_s2: "s2", SWID: "{SWID}" });
    b.fetch.mockRejectedValueOnce(new Error("offline"));
    const result = await startConnect(b, { type: "tc:connect", token: TOKEN, endpoint: ENDPOINT }, ORIGIN);
    expect(result.state).toBe("rejected");
    expect(JSON.stringify(result)).not.toContain("s2");
  });

  it("refuses an endpoint off the sender's origin before touching cookies", async () => {
    const b = fakeBrowser({ espn_s2: "s2", SWID: "{SWID}" });
    const result = await startConnect(b, { type: "tc:connect", token: TOKEN, endpoint: `https://evil.example${ENDPOINT_PATH}` }, ORIGIN);
    expect(result).toMatchObject({ state: "rejected", reason: expect.stringContaining("Refused") });
    expect(b.fetch).not.toHaveBeenCalled();
  });

  it("refuses a malformed token", async () => {
    const b = fakeBrowser({ espn_s2: "s2", SWID: "{SWID}" });
    const result = await startConnect(b, { type: "tc:connect", token: "nope", endpoint: ENDPOINT }, ORIGIN);
    expect(result).toMatchObject({ state: "rejected" });
    expect(b.fetch).not.toHaveBeenCalled();
  });

  it("opens the ESPN login tab and waits when the cookies are missing", async () => {
    const b = fakeBrowser({});
    const result = await startConnect(b, { type: "tc:connect", token: TOKEN, endpoint: ENDPOINT }, ORIGIN);
    expect(result).toEqual({ type: "tc:status", state: "awaiting_login" });
    expect(b.opened).toEqual([ESPN_LOGIN_URL]);
    expect(b.pendingRow()).toMatchObject({ token: TOKEN, endpoint: ENDPOINT, loginTabId: 77 });
    expect(b.timeout()).toBe(10);
    expect(b.fetch).not.toHaveBeenCalled();
  });
});

describe("while waiting for login", () => {
  let b: ReturnType<typeof fakeBrowser>;
  beforeEach(async () => {
    b = fakeBrowser({});
    await startConnect(b, { type: "tc:connect", token: TOKEN, endpoint: ENDPOINT }, ORIGIN);
    b.statuses.length = 0;
  });

  it("finishes when the cookies land: posts, closes the login tab, clears the wait", async () => {
    b.cookies.espn_s2 = "fresh";
    b.cookies.SWID = "{SWID}";
    const result = await onEspnCookieSet(b);
    expect(result).toMatchObject({ state: "connected" });
    expect(b.statuses.map((s) => s.state)).toEqual(["verifying", "connected"]);
    expect(b.closed).toEqual([77]);
    expect(b.pendingRow()).toBeNull();
    expect(b.timeout()).toBeNull();
  });

  it("keeps waiting when espn_s2 arrives before SWID", async () => {
    b.cookies.espn_s2 = "fresh";
    expect(await onEspnCookieSet(b)).toBeNull();
    expect(b.pendingRow()).not.toBeNull();
    expect(b.fetch).not.toHaveBeenCalled();
  });

  it("keeps waiting when only SWID is set (ESPN gives anonymous visitors one on the login page)", async () => {
    b.cookies.SWID = "{ANON}";
    expect(await onEspnCookieSet(b)).toBeNull();
    expect(b.pendingRow()).not.toBeNull();
    expect(b.closed).toEqual([]);
    expect(b.statuses).toEqual([]);
    b.cookies.espn_s2 = "fresh";
    expect(await onEspnCookieSet(b)).toMatchObject({ state: "connected" });
  });

  it("posts exactly once when the login sets several cookies at the same time", async () => {
    b.cookies.espn_s2 = "fresh";
    b.cookies.SWID = "{SWID}";
    // Chrome fires onChanged per cookie; the handlers overlap.
    const results = await Promise.all([onEspnCookieSet(b), onEspnCookieSet(b), onEspnCookieSet(b)]);
    expect(b.fetch).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r?.state === "connected")).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(2);
    expect(b.statuses.map((s) => s.state)).toEqual(["verifying", "connected"]);
  });

  it("times out after the window and closes the tab", async () => {
    const result = await onTimeout(b);
    expect(result).toEqual({ type: "tc:status", state: "timeout" });
    expect(b.closed).toEqual([77]);
    expect(b.pendingRow()).toBeNull();
    // A late cookie after the timeout does nothing.
    b.cookies.espn_s2 = "late";
    b.cookies.SWID = "{SWID}";
    expect(await onEspnCookieSet(b)).toBeNull();
    expect(b.fetch).not.toHaveBeenCalled();
  });

  it("cancel stops the wait and closes the tab", async () => {
    const result = await cancel(b);
    expect(result).toEqual({ type: "tc:status", state: "cancelled" });
    expect(b.closed).toEqual([77]);
    expect(b.pendingRow()).toBeNull();
  });

  it("a cookie change with nothing pending is ignored", async () => {
    await cancel(b);
    expect(await onEspnCookieSet(b)).toBeNull();
    expect(await onTimeout(b)).toBeNull();
  });

  it("a new connect request supersedes the old wait", async () => {
    const result = await startConnect(b, { type: "tc:connect", token: "b".repeat(43), endpoint: ENDPOINT }, ORIGIN);
    expect(result.state).toBe("awaiting_login");
    expect(b.closed).toEqual([77]);
    expect(b.pendingRow()?.token).toBe("b".repeat(43));
  });
});
