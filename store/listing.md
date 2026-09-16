# Chrome Web Store listing

Copy for the developer dashboard (chrome.google.com/webstore/devconsole). Upload `true-champion-extension-<version>.zip` from `npm run pack`.

## Name

True Champion for ESPN

## Summary (132 chars max)

One-click connect of your private ESPN fantasy league to True Champion. Reads two ESPN cookies, sends them to True Champion only.

## Description

True Champion shows what your fantasy football record would be without the schedule: all-play record, schedule-swap matrix, head-to-head vs everyone, and a Tuesday recap email for the whole league.

Private ESPN leagues only show their data to signed-in members, and ESPN keeps that sign-in in two browser cookies (espn_s2 and SWID) that no website can read. This extension reads those two cookies from your own browser when you click "Connect ESPN" on True Champion and sends them, once, to True Champion's connect endpoint together with a single-use pairing token.

What it does:
• Reads exactly two cookies from espn.com. Nothing else.
• Only acts when you click Connect ESPN on true-champion-app.vercel.app, and only answers that site.
• Sends the cookies to that site only, over HTTPS. It refuses any other destination.
• If you are signed out of ESPN, opens ESPN's login page and waits up to ten minutes for you to sign in, then finishes.
• Never stores or logs the cookies. No analytics. No remote code. Open source (MIT): github.com/shulman33/true-champion-extension

What True Champion does with them: verifies them against your league before saving anything, encrypts them at rest, logs every use where you can see it, and wipes them when you disconnect.

Not affiliated with ESPN or Disney.

## Category

Productivity (or Sports, if offered)

## Language

English

## Privacy practices (dashboard questionnaire)

- Single purpose: connect a private ESPN fantasy league to True Champion by transferring the user's ESPN session cookies to True Champion on the user's request.
- `cookies`: read the two ESPN session cookies the user chose to hand over, and notice when they appear after sign-in.
- `storage`: remember (in session storage only) that a connect is waiting for the ESPN login while the background worker is asleep. No cookie values are stored.
- `alarms`: the ten-minute wait-for-login timeout.
- Host `*://*.espn.com/*`: required by the cookies permission for espn.com.
- Host `https://true-champion-app.vercel.app/*`: the only place the cookies are sent.
- Remote code: none.
- Data usage: authentication information (ESPN session cookies), transferred to True Champion at the user's request, used only to provide the feature. Not sold, not used for unrelated purposes, not used for creditworthiness or lending.
- Privacy policy URL: the True Champion privacy policy (phase 8 of the app plan; use https://true-champion-app.vercel.app/privacy once published).

## Assets still to capture

- Screenshots 1280×800: the connect page with the extension detected ("Connect ESPN" button), the "waiting for you to sign in" state, and the "Connected" result.
- Optional promo tile 440×280.
- Icon 128×128: `icons/icon-128.png`.
