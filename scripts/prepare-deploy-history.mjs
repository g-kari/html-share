import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Report RSS dates/GUIDs require committed history, not deployment time.
// Fetch only through the checkout's existing origin; never push or change auth.
export function prepareDeployHistory(root, run = execFileSync) {
  const git = (...args) => run("git", ["-C", root, ...args], {
    encoding: "utf8", stdio: "pipe", timeout: 120_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
  const before = git("rev-parse", "HEAD");
  const shallow = git("rev-parse", "--is-shallow-repository");
  if (shallow !== "true" && shallow !== "false") throw new Error("Cannot determine deploy checkout history completeness.");
  if (shallow === "true") git("fetch", "--unshallow", "origin");
  if (git("rev-parse", "--is-shallow-repository") !== "false") throw new Error("Deployment requires complete Git history; build stopped.");
  if (git("rev-parse", "HEAD") !== before) throw new Error("Deploy checkout changed while preparing history; build stopped.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    prepareDeployHistory(fileURLToPath(new URL("../", import.meta.url)));
    console.log("Deployment Git history is complete; original HEAD preserved.");
  } catch {
    // Do not print remote URLs or credential-bearing transport errors.
    console.error("Could not prepare complete Git history. Deployment stopped without bypassing RSS history checks.");
    process.exitCode = 1;
  }
}
