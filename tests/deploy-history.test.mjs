import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { prepareDeployHistory } from "../scripts/prepare-deploy-history.mjs";

test("deploy preparation restores a real shallow checkout and preserves HEAD and working files", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "deploy-history-"));
  const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
  try {
    git(dir, "init", "-b", "main");
    git(dir, "config", "user.name", "Fixture"); git(dir, "config", "user.email", "fixture@example.invalid");
    for (let i = 0; i < 3; i++) {
      writeFileSync(path.join(dir, "report.txt"), String(i));
      git(dir, "add", "report.txt"); git(dir, "commit", "-m", `History ${i}`);
    }
    const clone = path.join(dir, "clone");
    execFileSync("git", ["clone", "--depth", "1", pathToFileURL(dir).href, clone], { stdio: "pipe" });
    const head = git(clone, "rev-parse", "HEAD");
    writeFileSync(path.join(clone, "keep.txt"), "keep");
    assert.equal(git(clone, "rev-parse", "--is-shallow-repository"), "true");
    prepareDeployHistory(clone);
    assert.equal(git(clone, "rev-list", "--count", "HEAD"), "3");
    assert.equal(git(clone, "rev-parse", "HEAD"), head);
    assert.match(git(clone, "status", "--porcelain"), /keep.txt/);
    git(clone, "remote", "remove", "origin");
    prepareDeployHistory(clone); // Complete history needs no network or remote.
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("fetch failure is fatal and no fallback bypasses history checks", () => {
  const calls = [];
  const run = (_, args, opts) => {
    calls.push(args.slice(2));
    assert.equal(opts.env.GIT_TERMINAL_PROMPT, "0");
    assert.equal(opts.timeout, 120_000);
    if (args[2] === "fetch") throw new Error("transport failed");
    return args.includes("HEAD") ? "abc\n" : "true\n";
  };
  assert.throws(() => prepareDeployHistory("/fixture", run), /transport failed/);
  assert.deepEqual(calls.at(-1), ["fetch", "--unshallow", "origin"]);
  assert.equal(calls.length, 3);
});

test("incomplete history after fetch and unexpected HEAD changes fail closed", () => {
  assert.throws(() => prepareDeployHistory("/fixture", (_, args) => args.includes("HEAD") ? "abc" : "true"), /complete Git history/);
  let heads = 0;
  assert.throws(() => prepareDeployHistory("/fixture", (_, args) => args.includes("HEAD") ? String(heads++) : "false"), /checkout changed/);
  assert.throws(() => prepareDeployHistory("/fixture", (_, args) => args.includes("HEAD") ? "abc" : "unknown"), /Cannot determine/);
});
