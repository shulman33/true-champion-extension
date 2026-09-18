import { ESPN_COOKIE_URL } from "./connect";
import { describe, LAST_KEY, type LastResult } from "./summary";

/**
 * The toolbar popup. Read-only: it reports what the background worker did
 * and sends you to True Champion, where a connect actually starts (it needs
 * a pairing token only the signed-in page can mint). It checks that the two
 * ESPN cookies exist but never reads their values into the page.
 */

declare const __APP_ORIGIN__: string;

const PENDING_KEY = "pending";
const $ = (id: string) => document.getElementById(id)!;

async function render() {
  const [session, local, espn_s2, swid] = await Promise.all([
    chrome.storage.session.get(PENDING_KEY),
    chrome.storage.local.get(LAST_KEY),
    chrome.cookies.get({ url: ESPN_COOKIE_URL, name: "espn_s2" }),
    chrome.cookies.get({ url: ESPN_COOKIE_URL, name: "SWID" }),
  ]);
  const view = describe({
    waitingForLogin: Boolean(session[PENDING_KEY]),
    last: (local[LAST_KEY] as LastResult | undefined) ?? null,
    now: Date.now(),
  });
  $("card").dataset.tone = view.tone;
  $("title").textContent = view.title;
  $("detail").textContent = view.detail;
  $("espn").textContent = espn_s2?.value && swid?.value ? "Signed in" : "Signed out";
  // Seen it: a finished badge has done its job. A waiting one stays.
  if (view.tone !== "busy") void chrome.action.setBadgeText({ text: "" });
}

$("version").textContent = `v${chrome.runtime.getManifest().version}`;
($("privacy") as HTMLAnchorElement).href = `${__APP_ORIGIN__}/privacy`;
$("open").addEventListener("click", () => {
  void chrome.tabs.create({ url: `${__APP_ORIGIN__}/connect/espn` });
  window.close();
});

chrome.storage.onChanged.addListener(() => void render());
void render();
