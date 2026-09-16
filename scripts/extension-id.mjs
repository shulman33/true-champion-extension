import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Prints the extension id Chrome derives from manifest.json's `key`
 * (sha256 of the DER public key, first 32 hex chars mapped to a–p).
 * Keeping `key` in the manifest makes the unpacked build, the Playwright
 * build, and the Web Store listing share one id.
 */
const { key } = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const hex = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);
console.log([...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join(""));
