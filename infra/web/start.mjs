import { readFileSync } from "node:fs";
import { validateContainerConfig } from "./config.mjs";

const built = JSON.parse(readFileSync(new URL("./web-build-config.json", import.meta.url), "utf8"));
try {
  validateContainerConfig(process.env, built);
} catch (error) {
  console.error(`[anynote-web] ${error.message}`);
  process.exit(1);
}
await import("./apps/web/server.js");
