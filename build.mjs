import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

/**
 * `node build.mjs` → dist/ (what goes to the Chrome Web Store).
 * `node build.mjs --dev` → dist-dev/, the same plus http://localhost:3001 in
 * externally_connectable and host_permissions so the app's Playwright suite
 * and local development can talk to an unpacked build, and the public key
 * from dev-key.json so that build always has the same id. The store build
 * must not carry a `key` (the Web Store rejects it and assigns its own id).
 */
const dev = process.argv.includes("--dev");
const out = dev ? "dist-dev" : "dist";
const LOCAL = "http://localhost:3001/*";

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: ["src/background.ts"],
  bundle: true,
  format: "esm",
  target: "chrome120",
  outfile: `${out}/background.js`,
  minify: false,
  sourcemap: false,
  legalComments: "none",
});

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
delete manifest.key;
if (dev) {
  manifest.externally_connectable.matches.push(LOCAL);
  manifest.host_permissions.push(LOCAL);
  manifest.name += " (dev)";
  manifest.key = JSON.parse(readFileSync("dev-key.json", "utf8")).key;
}
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
cpSync("icons", `${out}/icons`, { recursive: true });
console.log(`built ${out}/ (${manifest.name} ${manifest.version})`);
