import { cancel, ESPN_COOKIE_URL, onEspnCookieSet, onTimeout, startConnect, type Browser, type Pending } from "./connect";
import { PROTOCOL, type PageMessage, type Ping, type Pong, type Status } from "./protocol";

/**
 * MV3 service worker. Everything here is plumbing between Chrome and
 * src/connect.ts. No analytics, no remote code, no logging of anything the
 * page or ESPN hands us.
 */

const ALARM = "tc-login-timeout";
const PENDING_KEY = "pending";

/** Pages currently connected over chrome.runtime.connect. Best-effort delivery. */
const ports = new Set<chrome.runtime.Port>();

const browser: Browser = {
  version: chrome.runtime.getManifest().version,
  async getCookie(name) {
    const cookie = await chrome.cookies.get({ url: ESPN_COOKIE_URL, name });
    return cookie?.value || null;
  },
  async openTab(url) {
    const tab = await chrome.tabs.create({ url, active: true });
    return tab.id ?? null;
  },
  async closeTab(id) {
    await chrome.tabs.remove(id);
  },
  async getPending() {
    const stored = await chrome.storage.session.get(PENDING_KEY);
    return (stored[PENDING_KEY] as Pending | undefined) ?? null;
  },
  async setPending(p) {
    if (p) await chrome.storage.session.set({ [PENDING_KEY]: p });
    else await chrome.storage.session.remove(PENDING_KEY);
  },
  async setTimeout(minutes) {
    await chrome.alarms.clear(ALARM);
    if (minutes != null) await chrome.alarms.create(ALARM, { delayInMinutes: minutes });
  },
  fetch: (url, init) => fetch(url, init),
  notify(status: Status) {
    for (const port of ports) {
      try {
        port.postMessage(status);
      } catch {
        ports.delete(port);
      }
    }
  },
};

// Handshake: the page asks whether we are here and which version.
chrome.runtime.onMessageExternal.addListener((message: Ping | unknown, _sender, sendResponse) => {
  if (message && typeof message === "object" && (message as Ping).type === "tc:ping") {
    const pong: Pong = { type: "tc:pong", version: browser.version, protocol: PROTOCOL };
    sendResponse(pong);
  }
  return false;
});

// The connect session: one port per page, statuses flow back over it.
chrome.runtime.onConnectExternal.addListener((port) => {
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener((message: PageMessage | unknown) => {
    if (!message || typeof message !== "object") return;
    const msg = message as PageMessage;
    if (msg.type === "tc:connect") void startConnect(browser, msg, port.sender?.origin);
    else if (msg.type === "tc:cancel") void cancel(browser);
  });
});

// Login finished in the other tab: espn_s2 appeared on .espn.com.
chrome.cookies.onChanged.addListener((change) => {
  if (change.removed) return;
  const { name, domain } = change.cookie;
  if (name !== "espn_s2" && name !== "SWID") return;
  if (!/(^|\.)espn\.com$/.test(domain.replace(/^\./, ""))) return;
  void onEspnCookieSet(browser);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void onTimeout(browser);
});
