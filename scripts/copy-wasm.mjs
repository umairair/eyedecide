// Copies MediaPipe's WASM runtime into public/ so the app never depends on a CDN for it.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "mediapipe");

if (!existsSync(src)) {
  console.warn("[copy-wasm] @mediapipe/tasks-vision not installed yet; skipping");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("[copy-wasm] MediaPipe WASM copied to public/mediapipe");
