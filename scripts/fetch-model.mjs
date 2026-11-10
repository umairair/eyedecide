// Downloads the MediaPipe face model into public/models so the app works offline.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "models", "face_landmarker.task");

const res = await fetch(URL);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
console.log(`Saved ${dest}`);
