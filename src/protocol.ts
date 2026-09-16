/**
 * Messages between the True Champion web page and this extension.
 * Mirrored in the app at src/lib/extension-core.ts. Bump PROTOCOL when a
 * message changes shape; the page refuses older extensions.
 */

export const PROTOCOL = 1;

/** Page → extension, via chrome.runtime.sendMessage. Answered with a Pong. */
export interface Ping {
  type: "tc:ping";
}

export interface Pong {
  type: "tc:pong";
  version: string;
  protocol: number;
}

/** Page → extension over a port opened with chrome.runtime.connect. */
export interface ConnectRequest {
  type: "tc:connect";
  /** Single-use pairing token minted by the app; the only authorization the POST carries. */
  token: string;
  /** Absolute URL of POST /api/connections/espn on the page's own origin. */
  endpoint: string;
}

export interface CancelRequest {
  type: "tc:cancel";
}

export type PageMessage = ConnectRequest | CancelRequest;

/** Extension → page over the same port. Best effort: the page also polls the server. */
export type Status =
  | { type: "tc:status"; state: "awaiting_login" }
  | { type: "tc:status"; state: "verifying" }
  | { type: "tc:status"; state: "connected"; identity: string; league: { slug: string; name: string } | null; connected: boolean }
  | { type: "tc:status"; state: "rejected"; reason: string }
  | { type: "tc:status"; state: "timeout" }
  | { type: "tc:status"; state: "cancelled" };

export type StatusState = Status["state"];
