import type { Status } from "./protocol";

/**
 * What the popup says. Pure so it can be unit tested without Chrome:
 * src/background.ts stores a LastResult when a connect ends, src/popup.ts
 * renders describe(). Never holds a cookie value or the pairing token.
 */

export const LAST_KEY = "last";

export interface LastResult {
  state: "connected" | "rejected" | "timeout";
  at: number;
  /** League name when connected, the reason when rejected. */
  detail: string | null;
}

export type Tone = "ok" | "busy" | "bad" | "idle";

export interface View {
  tone: Tone;
  title: string;
  detail: string;
}

export interface Badge {
  text: string;
  color: string;
}

/** The terminal statuses worth remembering; null for the rest. */
export function toLastResult(status: Status, now: number): LastResult | null {
  if (status.state === "connected") return { state: "connected", at: now, detail: status.league?.name ?? null };
  if (status.state === "rejected") return { state: "rejected", at: now, detail: status.reason };
  if (status.state === "timeout") return { state: "timeout", at: now, detail: null };
  return null;
}

/** Toolbar badge for a status; empty text clears it. */
export function badgeFor(status: Status): Badge {
  if (status.state === "awaiting_login" || status.state === "verifying") return { text: "…", color: "#f59e0b" };
  if (status.state === "connected") return { text: "✓", color: "#84cc16" };
  if (status.state === "rejected" || status.state === "timeout") return { text: "!", color: "#ef4444" };
  return { text: "", color: "#000000" };
}

export function ago(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function describe(input: { waitingForLogin: boolean; last: LastResult | null; now: number }): View {
  const { waitingForLogin, last, now } = input;
  if (waitingForLogin) {
    return { tone: "busy", title: "Waiting for your ESPN sign-in", detail: "Finish signing in on the ESPN tab. The connect completes on its own, then that tab closes." };
  }
  if (last?.state === "connected") {
    return { tone: "ok", title: last.detail ? `Connected ${last.detail}` : "ESPN connected", detail: `Sent to True Champion ${ago(last.at, now)}. Nothing else to do here.` };
  }
  if (last?.state === "rejected") {
    return { tone: "bad", title: "Last connect did not go through", detail: `${last.detail ?? "True Champion refused it."} (${ago(last.at, now)})` };
  }
  if (last?.state === "timeout") {
    return { tone: "bad", title: "ESPN sign-in timed out", detail: `The ten-minute wait ran out ${ago(last.at, now)}. Start again from True Champion.` };
  }
  return { tone: "idle", title: "Ready when you are", detail: "Nothing has been sent yet. Connecting starts on True Champion, not here." };
}
