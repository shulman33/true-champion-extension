# True Champion for ESPN

A tiny Chrome extension (also Edge, Brave, Arc, Opera) that connects a **private ESPN fantasy football league** to [True Champion](https://true-champion-app.vercel.app) with one click. True Champion shows what your record would be without the schedule and emails the league every Tuesday.

Private ESPN leagues only show their data to signed-in members. ESPN keeps that sign-in in two cookies that no website can read, so the only honest shortcut is an extension running in your own browser. This is that extension, and this README is exactly what it does.

## What it reads, and where it goes

- **Two cookies from espn.com: `espn_s2` and `SWID`.** Nothing else. No browsing history, no page content, no other sites.
- **Only when you click "Connect ESPN" on True Champion.** The toolbar popup only reports: whether this browser is signed in to ESPN, how the last connect ended, and a button that opens True Champion. There is no background activity and no interest in what you do otherwise. It only answers pages on `https://true-champion-app.vercel.app`.
- **Sent once, over HTTPS, to True Champion's connect endpoint** (`/api/connections/espn`) together with a single-use pairing token the page handed it. It refuses any other destination, even if the page asked. The extension never stores the cookies, never logs them, and never shows them.
- **If you are signed out of ESPN** it opens ESPN's login page in a new tab and waits (up to ten minutes) for you to sign in, then finishes and closes that tab.
- **No analytics, no remote code, no third parties.**

What True Champion does with the cookies is described on its connect page: verified against your league before anything is saved, encrypted at rest, every use logged in your settings, wiped when you disconnect.

## Permissions

| Permission | Why |
| --- | --- |
| `cookies` + host `*://*.espn.com/*` | Read `espn_s2` and `SWID`, and notice when they appear after you sign in. |
| host `https://true-champion-app.vercel.app/*` | POST the cookies to the connect endpoint. |
| `storage` | Session: remember that a connect is waiting for your ESPN login while the background worker sleeps (cleared when the browser closes). Local: how the last connect ended (connected, rejected or timed out, the league name or reason, and when) so the popup can tell you. Never a cookie value or the pairing token. |
| `alarms` | The ten-minute wait-for-login timeout. |

## How the handshake works

1. The connect page pings the extension (`tc:ping` → `tc:pong { version, protocol }`) to know it is installed and current.
2. You click **Connect ESPN**. The page mints a single-use pairing token on its server and opens a port to the extension with `tc:connect { token, endpoint }`.
3. The extension checks the endpoint is `/api/connections/espn` on the page's own origin, reads the two cookies, and POSTs `{ token, espn_s2, swid, extension_version }`. Missing cookies: it opens ESPN's login page and waits for them.
4. Status flows back over the port (`awaiting_login`, `verifying`, `connected`, `rejected`, `timeout`); the page also polls its own server, so a sleeping worker never leaves it hanging.

All of it is in [`src/connect.ts`](src/connect.ts) (the flow, unit tested without Chrome), [`src/background.ts`](src/background.ts) (the Chrome plumbing) and [`src/popup.ts`](src/popup.ts) with [`src/summary.ts`](src/summary.ts) (the read-only popup and the toolbar badge).

## Build it yourself

```bash
npm install
npm test            # Vitest, no browser needed
npm run build       # dist/ — what the Chrome Web Store gets
npm run build:dev   # dist-dev/ — also talks to http://localhost:3001 for local development
npm run pack        # zip of dist/ for the store
```

Load `dist/` (or `dist-dev/`) unpacked from `chrome://extensions` with Developer mode on. The dev build carries the public key from `dev-key.json`, so `dist-dev/` always has the id `eijljeemgciohaebdaahbpkmjfhgmnhc` (`npm run id` prints it); the Chrome Web Store does not accept a `key` field, so the listing has its own id, which the app reads from `NEXT_PUBLIC_EXTENSION_ID`. The matching private `key.pem` is not in the repo and is only needed for packing a `.crx` by hand.

Privacy policy: https://true-champion-app.vercel.app/privacy

The app's browser tests load `dist-dev/` into a persistent Chromium context; see `e2e/espn-extension.spec.ts` in [true-champion-app](https://github.com/shulman33/true-champion-app).

## License

MIT.
