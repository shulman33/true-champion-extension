import type { ConnectRequest, Status } from "./protocol";

/**
 * The connect flow, with the browser behind an interface so it can be unit
 * tested without Chrome. src/background.ts supplies the real one.
 *
 * Invariants (README "What it reads"): cookie values exist only in local
 * variables between the read and the POST; they are never stored, never
 * logged, never sent anywhere except the endpoint the page asked for, and
 * that endpoint must be on the page's own origin.
 */

export const ESPN_COOKIE_URL = "https://fantasy.espn.com/";
export const ESPN_LOGIN_URL = "https://www.espn.com/login/";
export const ENDPOINT_PATH = "/api/connections/espn";
export const LOGIN_TIMEOUT_MINUTES = 10;

export interface Pending {
  token: string;
  endpoint: string;
  loginTabId: number | null;
  startedAt: number;
}

export interface Browser {
  /** Value of a cookie visible at ESPN_COOKIE_URL, or null. */
  getCookie(name: "espn_s2" | "SWID"): Promise<string | null>;
  openTab(url: string): Promise<number | null>;
  closeTab(id: number): Promise<void>;
  getPending(): Promise<Pending | null>;
  setPending(p: Pending | null): Promise<void>;
  /** Arm or clear the single login timeout. */
  setTimeout(minutes: number | null): Promise<void>;
  fetch(url: string, init: { method: "POST"; headers: Record<string, string>; body: string }): Promise<{ status: number; json(): Promise<unknown> }>;
  version: string;
  /** Push a status to whoever is listening (the page's port). Best effort. */
  notify(status: Status): void;
}

/**
 * Every entry point runs under one lock. Chrome fires cookies.onChanged
 * once per cookie (a login sets several at once), and two overlapping
 * handlers would both read `pending` and post the same token twice.
 */
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export type EndpointCheck = { ok: true; url: string } | { ok: false; reason: string };

/** Only ever POST to /api/connections/espn on the origin that asked. */
export function checkEndpoint(endpoint: unknown, senderOrigin: string | undefined): EndpointCheck {
  if (typeof endpoint !== "string") return { ok: false, reason: "endpoint missing" };
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { ok: false, reason: "endpoint is not a URL" };
  }
  if (!senderOrigin || url.origin !== senderOrigin) return { ok: false, reason: "endpoint is not on the page's origin" };
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return { ok: false, reason: "endpoint must be https" };
  if (url.pathname !== ENDPOINT_PATH) return { ok: false, reason: "endpoint path is not the connect route" };
  return { ok: true, url: url.origin + url.pathname };
}

export function looksLikeToken(raw: unknown): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{40,50}$/.test(raw);
}

interface ConnectOk {
  ok: true;
  identity: string;
  league?: { slug: string; name: string } | null;
  connected?: boolean;
}

/** Read both cookies, POST them, and report. Cookie values never leave this function. */
async function postCookies(b: Browser, token: string, endpoint: string): Promise<Status> {
  const [espn_s2, swid] = await Promise.all([b.getCookie("espn_s2"), b.getCookie("SWID")]);
  if (!espn_s2 || !swid) return { type: "tc:status", state: "rejected", reason: "ESPN cookies are missing. Sign in to ESPN and try again." };
  let res: { status: number; json(): Promise<unknown> };
  try {
    res = await b.fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, espn_s2, swid, extension_version: b.version }),
    });
  } catch {
    return { type: "tc:status", state: "rejected", reason: "Could not reach True Champion. Check your connection and try again." };
  }
  const json = (await res.json().catch(() => null)) as ConnectOk | { ok: false; error?: string } | null;
  if (!json || typeof json !== "object" || !("ok" in json) || !json.ok) {
    const reason = json && typeof json === "object" && "error" in json && typeof json.error === "string" ? json.error : `True Champion answered ${res.status}.`;
    return { type: "tc:status", state: "rejected", reason };
  }
  return { type: "tc:status", state: "connected", identity: json.identity, league: json.league ?? null, connected: json.connected ?? true };
}

/** Handle tc:connect from the page. */
export function startConnect(b: Browser, msg: ConnectRequest, senderOrigin: string | undefined): Promise<Status> {
  return locked(() => startConnectNow(b, msg, senderOrigin));
}

async function startConnectNow(b: Browser, msg: ConnectRequest, senderOrigin: string | undefined): Promise<Status> {
  const endpoint = checkEndpoint(msg.endpoint, senderOrigin);
  if (!endpoint.ok) return emit(b, { type: "tc:status", state: "rejected", reason: `Refused: ${endpoint.reason}.` });
  if (!looksLikeToken(msg.token)) return emit(b, { type: "tc:status", state: "rejected", reason: "Refused: bad pairing token." });

  // A previous attempt still waiting for login is superseded.
  await clearPending(b);

  const [espn_s2, swid] = await Promise.all([b.getCookie("espn_s2"), b.getCookie("SWID")]);
  if (espn_s2 && swid) {
    emit(b, { type: "tc:status", state: "verifying" });
    return emit(b, await postCookies(b, msg.token, endpoint.url));
  }

  const loginTabId = await b.openTab(ESPN_LOGIN_URL);
  await b.setPending({ token: msg.token, endpoint: endpoint.url, loginTabId, startedAt: Date.now() });
  await b.setTimeout(LOGIN_TIMEOUT_MINUTES);
  return emit(b, { type: "tc:status", state: "awaiting_login" });
}

/**
 * An ESPN cookie changed while we were waiting. ESPN sets SWID for
 * anonymous visitors as soon as the login page loads, so nothing happens
 * until espn_s2 (only set by a real login) is there too.
 */
export function onEspnCookieSet(b: Browser): Promise<Status | null> {
  return locked(() => onEspnCookieSetNow(b));
}

async function onEspnCookieSetNow(b: Browser): Promise<Status | null> {
  const pending = await b.getPending();
  if (!pending) return null;
  const [espn_s2, swid] = await Promise.all([b.getCookie("espn_s2"), b.getCookie("SWID")]);
  if (!espn_s2 || !swid) return null;
  await clearPending(b);
  emit(b, { type: "tc:status", state: "verifying" });
  return emit(b, await postCookies(b, pending.token, pending.endpoint));
}

/** The login window ran out. */
export function onTimeout(b: Browser): Promise<Status | null> {
  return locked(async () => {
    const pending = await b.getPending();
    if (!pending) return null;
    await clearPending(b);
    return emit(b, { type: "tc:status", state: "timeout" });
  });
}

/** tc:cancel from the page. */
export function cancel(b: Browser): Promise<Status> {
  return locked(async () => {
    await clearPending(b);
    return emit(b, { type: "tc:status", state: "cancelled" });
  });
}

async function clearPending(b: Browser) {
  const pending = await b.getPending();
  await b.setTimeout(null);
  await b.setPending(null);
  if (pending?.loginTabId != null) await b.closeTab(pending.loginTabId).catch(() => undefined);
}

function emit(b: Browser, status: Status): Status {
  b.notify(status);
  return status;
}
