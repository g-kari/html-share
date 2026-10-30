import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { automaticTags } from "../scripts/technology-tags.mjs";

// Read authored records rather than the bounded, generated public shell.
let html;
try { html = await readFile(new URL("../reports/technology-updates.source.html", import.meta.url), "utf8"); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  html = await readFile(new URL("../public/technology-updates.html", import.meta.url), "utf8");
}
const records = JSON.parse(html.match(/<script\b[^>]*\bid="technology-update-data"[^>]*>([\s\S]*?)<\/script>/)[1]).records;
const keys = (record, kind) => automaticTags(record).filter((item) => item.kind === kind).map((item) => item.id.replace(`${kind}-`, ""));
const record = (title, lead = "", category = "agent", extra = {}) => ({ title, lead, category, ...extra });

const existingProducts = {
  "cloudflare-skills-files-032": ["cloudflare-agents-sdk"],
  "jules-winddown-20261231": ["other"],
  "codex-01660-resume-permissions": ["codex"],
  "cloudflare-mcp-analytics-status": ["other"],
  "ollama-04013-lfm3-linux-windows": ["ollama"],
  "aws-agentcore-cli-100-ga": ["other"],
  "cloudflare-workflows-jurisdiction": ["other"],
  "cloudflare-dns-advanced-deadline": ["other"],
  "openwebui-0124-security-update": ["other"],

  "litellm-11063-signing-key-rotation": ["other"],
  "ollama-04010-nemotron-bolt-e4b": ["ollama"],
  "cloudflare-d1-undelete-seven-days": ["other"],
  "claude-code-21309-sandbox-boundaries": ["claude-code"],
  "mcp-typescript-240-output-compatibility": ["other"],
  "diffusers-0420-python-latent-migration": ["other"],
  "openai-sdk-decisions-structured-instructions": ["other"],
  "aws-agentcore-gateway-fallback": ["other"],
  "cloudflare-mcp-sse-retired": ["other"],
  "cloudflare-pi14-storage-migration": ["cloudflare-agents-sdk","piharness","pi-durable"],
  "cloudflare-createai-provider-migration": ["other"],
  "puripuly-heart-290-partial-translation": ["puripuly-heart"],
  "claude-code-21307-mcp-retry": ["claude-code"],
  "ollama-0408-flint-macos": ["ollama"],
  "gemini-deep-research-legacy-shutdown": ["gemini"],
  "vrct-360-ocr-vad-websocket": ["other"],
  "cloudflare-mcp-step-up": ["other"],
  "cloudflare-clairic-preview": ["other"],
  "mcp-reference-servers-v2": ["other"],
  "sglang-0522-python-apple": ["other"],
  "comfyui-0421-moss-fix": ["other"],
  "litellm-11060-stdio-default-off": ["other"],
  "cloudflare-local-explorer-cron": ["other"],
  "aws-lambda-durable-go-ga": ["other"],
  "vllm-0320-compatibility-asr": ["other"],
  "claude-code-21302-mcp-permission-defaults": ["claude-code"],
  "cloudflare-workers-builds-default-tooling": ["cloudflare-workers"],
  "cloudflare-stream-webrtc-ga-billing": ["other"],
  "cloudflare-ai-search-cjk-trigram": ["other"],
  "cloudflare-cli-beta16-breaking-docs-search": ["other"],
  "codex-cli-01630": ["codex"],
  "ollama-0406-windows-runner": ["ollama"],
  "modular-avatar-119-alpha2": ["other"],
  "flux3-klein-diffusers": ["other"],
  "lfm25-24b-a2b-local-agents": ["other"],
  "aws-dynamodb-streams-at-timestamp": ["other"],
  "gemini-4-argon-ga-unified-context": ["gemini"],
  "cloudflare-agents-0281-transport-harness": ["cloudflare-agents-sdk"],
  "cloudflare-workers-issues-mcp-events": ["cloudflare-workers"],
  "cloudflare-runtime-update-grace-20min": ["cloudflare-workers"],
  "cloudflare-opencode-experimental-harness": ["cloudflare-agents-sdk", "cloudflare-durable-objects"],
  "puripuly-heart-282-network-stt": ["puripuly-heart"],
  "cloudflare-api-mcp-skills": ["other"],
  "unity-edm-edm4u-deprecation": ["other"],
  "cloudflare-agents-028-browser-lifecycle": ["cloudflare-agents-sdk"],
  "cloudflare-failed-detections-field": ["other"],
  "cloudflare-markdown-streaming-6mib": ["cloudflare-markdown-agents"],
  "cloudflare-clef-omni-flash-limits": ["cloudflare-clef"],
  "cloudflare-http3-client-cancel-499": ["cloudflare-http3"],
  "codex-cli-01621": ["codex"],
  "claude-code-21296": ["claude-code"],
  "vrchat-202641-open-beta": ["vrchat"],
  "vrchat-planned-parameters-raycast-colliders": ["vrchat"],
  "aws-bedrock-cost-product-attributes": ["aws-bedrock"],
  "cloudflare-workflows-createbatch-object": ["cloudflare-workflows"],
  "unity-cli-beta13-pipeline-names": ["unity-cli"],
  "ollama-0402-model-backups": ["ollama"],
  "puripuly-heart-281-tag-fixes": ["puripuly-heart"],

  "openai-sol-ultrafast": ["gpt", "responses-api"],
  "claude-code-21294": ["claude-code"],
  "codex-cli-01620": ["codex"],
  "lightonocr-3": ["lightonocr"],
  "llamacpp-stable-development": ["llama-cpp"],
  "claude-monthly-api-credits": ["claude"],
  "claude-haiku-55": ["claude-haiku"],
  "claude-sonnet-cache-price": ["claude-sonnet"],
  "copilot-cli-local-models": ["github-copilot", "ollama"],
  "copilot-local-sandbox": ["github-copilot"],
  "liquidai-open-d1": ["liquid-ai-d1"],
  "gemini-image-lifecycle": ["nano-banana", "gemini"],
  "puripuly-heart-280": ["qwen", "puripuly-heart"],
  "runway-draft-mcp": ["runway", "seedance", "ideogram"],
  "cloudflare-piharness": ["cloudflare-agents-sdk", "piharness", "pi-durable", "cloudflare-durable-objects"],
  "cloudflare-oauth-v1": ["workers-oauth-provider"],
};

test("all authored records have deterministic product/domain/change dimensions", () => {
  assert.equal(records.length, Object.keys(existingProducts).length);
  for (const item of records) {
    const tags = automaticTags(item);
    assert.deepEqual(keys(item, "product"), existingProducts[item.id], item.id);
    assert.deepEqual(keys(item, "domain"), [item.category], item.id);
    assert.ok(tags.some((value) => value.kind === "change"), item.id);
    assert.deepEqual(automaticTags(structuredClone(item)), tags);
    assert.equal(new Set(tags.map((value) => value.id)).size, tags.length);
    for (const value of tags) {
      assert.deepEqual(Object.keys(value), ["id", "label", "kind"]);
      assert.match(value.id, /^(product|domain|change)-[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.ok(value.label.length > 0);
    }
  }
});

test("current change tags distinguish pricing, fixes, public weights, GA, beta and correction", () => {
  const expected = {
    "cloudflare-skills-files-032": ["compatibility"],
    "jules-winddown-20261231": ["update"],
    "codex-01660-resume-permissions": ["fix"],
    "cloudflare-mcp-analytics-status": ["update"],
    "ollama-04013-lfm3-linux-windows": ["update"],
    "aws-agentcore-cli-100-ga": ["ga","compatibility"],
    "cloudflare-workflows-jurisdiction": ["feature","compatibility"],
    "cloudflare-dns-advanced-deadline": ["compatibility","deprecation"],
    "openwebui-0124-security-update": ["fix","ga","security"],
  "litellm-11063-signing-key-rotation": ["release","compatibility"],
  "ollama-04010-nemotron-bolt-e4b": ["feature"],
  "cloudflare-d1-undelete-seven-days": ["update"],
  "claude-code-21309-sandbox-boundaries": ["fix","security"],
  "mcp-typescript-240-output-compatibility": ["feature","preview","compatibility"],
  "diffusers-0420-python-latent-migration": ["compatibility"],
  "openai-sdk-decisions-structured-instructions": ["compatibility"],
  "aws-agentcore-gateway-fallback": ["update"],
  "cloudflare-mcp-sse-retired": ["compatibility","security","deprecation"],
  "cloudflare-pi14-storage-migration": ["improvement","preview","compatibility"],
  "cloudflare-createai-provider-migration": ["compatibility","deprecation"],
  "puripuly-heart-290-partial-translation": ["fix","feature"],
  "claude-code-21307-mcp-retry": ["fix"],
  "ollama-0408-flint-macos": ["update"],
  "gemini-deep-research-legacy-shutdown": ["preview"],
  "vrct-360-ocr-vad-websocket": ["feature","compatibility","security","deprecation"],
  "cloudflare-mcp-step-up": ["feature"],
  "cloudflare-clairic-preview": ["pricing","preview"],
  "mcp-reference-servers-v2": ["release","compatibility"],
  "sglang-0522-python-apple": ["release","compatibility"],
  "comfyui-0421-moss-fix": ["fix"],
  "litellm-11060-stdio-default-off": ["compatibility"],
  "cloudflare-local-explorer-cron": ["update"],
  "aws-lambda-durable-go-ga": ["release","ga"],
  "vllm-0320-compatibility-asr": ["compatibility"],
  "claude-code-21302-mcp-permission-defaults": ["fix"],
  "cloudflare-workers-builds-default-tooling": ["compatibility"],
  "cloudflare-stream-webrtc-ga-billing": ["pricing","ga"],
  "cloudflare-ai-search-cjk-trigram": ["improvement"],
  "cloudflare-cli-beta16-breaking-docs-search": ["preview","compatibility"],
  "codex-cli-01630": ["fix","improvement"],
  "ollama-0406-windows-runner": ["fix"],
  "modular-avatar-119-alpha2": ["fix"],
  "flux3-klein-diffusers": ["release"],
  "lfm25-24b-a2b-local-agents": ["release"],
  "aws-dynamodb-streams-at-timestamp": ["update"],
  "gemini-4-argon-ga-unified-context": ["pricing", "ga", "compatibility"],
  "cloudflare-agents-0281-transport-harness": ["fix", "compatibility"],
  "cloudflare-workers-issues-mcp-events": ["feature", "preview"],
  "cloudflare-runtime-update-grace-20min": ["update"],
  "cloudflare-opencode-experimental-harness": ["preview", "lifecycle"],
  "puripuly-heart-282-network-stt": ["fix"],
  "cloudflare-api-mcp-skills": ["update"],
  "unity-edm-edm4u-deprecation": ["compatibility", "deprecation"],
  "cloudflare-agents-028-browser-lifecycle": ["feature", "compatibility", "lifecycle"],
  "cloudflare-failed-detections-field": ["update"],
  "cloudflare-markdown-streaming-6mib": ["compatibility"],
  "cloudflare-clef-omni-flash-limits": ["pricing"],
  "cloudflare-http3-client-cancel-499": ["improvement"],
  "codex-cli-01621": ["fix"],
  "claude-code-21296": ["fix","compatibility"],
  "vrchat-202641-open-beta": ["fix","preview"],
  "vrchat-planned-parameters-raycast-colliders": ["preview"],
  "aws-bedrock-cost-product-attributes": ["pricing"],
  "cloudflare-workflows-createbatch-object": ["compatibility"],
  "unity-cli-beta13-pipeline-names": ["preview"],
  "ollama-0402-model-backups": ["update"],
  "puripuly-heart-281-tag-fixes": ["fix","release"],
    "openai-sol-ultrafast": ["pricing", "performance", "feature"],
    "claude-code-21294": ["fix", "improvement"],
    "codex-cli-01620": ["performance", "improvement"],
    "lightonocr-3": ["release"],
    "llamacpp-stable-development": ["fix", "improvement"],
    "claude-monthly-api-credits": ["pricing"],
    "claude-haiku-55": ["pricing", "compatibility"],
    "claude-sonnet-cache-price": ["pricing"],
    "copilot-cli-local-models": ["update"],
    "copilot-local-sandbox": ["ga", "security"],
    "liquidai-open-d1": ["release"],
    "gemini-image-lifecycle": ["compatibility", "lifecycle", "correction"],
    "puripuly-heart-280": ["performance", "improvement"],
    "runway-draft-mcp": ["feature"],
    "cloudflare-piharness": ["preview"],
    "cloudflare-oauth-v1": ["feature", "security"],
  };
  for (const item of records) assert.deepEqual(keys(item, "change"), expected[item.id], item.id);
});

test("category mapping uses the eight supported categories, including MCP in a media lead", () => {
  const labels = ["モデル・API料金", "開発エージェント", "OSS・ローカル", "音声・字幕", "画像・動画", "MCP・実行基盤", "クラウド・運用", "VRChat・制作互換性"];
  ["api", "agent", "local", "audio", "media", "mcp", "cloud", "vr"].forEach((category, i) => {
    const tags = automaticTags(record("Runway", "MCP を追加", category));
    assert.deepEqual(tags.filter((item) => item.kind === "domain"), [{ id: `domain-${category}`, label: labels[i], kind: "domain" }]);
  });
  assert.deepEqual(keys(record("Audio APIs and MCP", "", "new-domain"), "domain"), ["other"]);
});

test("unknown, missing and malformed fields receive all three neutral dimensions", () => {
  const expected = [
    { id: "product-other", label: "その他の製品", kind: "product" },
    { id: "domain-other", label: "その他の分野", kind: "domain" },
    { id: "change-update", label: "更新", kind: "change" },
  ];
  for (const item of [undefined, null, 42, {}, { title: {}, lead: [], category: 1, sources: "oops" }, record("未知の製品", "詳細は未確認", "unknown")]) {
    assert.deepEqual(automaticTags(item), expected);
  }
});

test("future title versions and NFKC/case normalization preserve IDs", () => {
  const samples = [
    [record("CLAUDE CODE v9.2", "バグを修正"), ["claude-code"]],
    [record("Ｃｏｄｅｘ CLI 1.200.0", "編集を改善"), ["codex"]],
    [record("GPT-7.2", "Responses API に追加", "api"), ["gpt", "responses-api"]],
    [record("Claude Haiku 6", "互換性の変更", "api"), ["claude-haiku"]],
    [record("Sonnet 8.2 の料金改定", "", "api"), ["claude-sonnet"]],
    [record("LightOnOCR-4", "重みを公開", "local"), ["lightonocr"]],
    [record("Liquid AI d1", "d1-omni-900M の重みを公開", "local"), ["liquid-ai-d1"]],
    [record("Runway と Ideogram 5.1", "Seedance 3 を追加", "media"), ["runway", "seedance", "ideogram"]],
    [record("Qwen4 の公開", "", "local"), ["qwen"]],
  ];
  for (const [item, products] of samples) assert.deepEqual(keys(item, "product"), products);
  assert.deepEqual(keys(record("Claude Code と Claude API", "Haiku 6 も追加", "api"), "product"), ["claude-code", "claude-haiku", "claude"]);
});

test("exact official repositories and identifiers can classify otherwise unnamed updates", () => {
  const samples = [
    ["https://github.com/openai/codex/releases/tag/v9", "codex"],
    ["https://github.com/anthropics/claude-code/pull/99", "claude-code"],
    ["https://github.com/ggml-org/llama.cpp", "llama-cpp"],
    ["https://github.com/ollama/ollama/releases/tag/v9", "ollama"],
    ["https://huggingface.co/lightonai/LightOnOCR-4-1B", "lightonocr"],
    ["https://huggingface.co/LiquidAI/d1-omni-900M", "liquid-ai-d1"],
    ["https://huggingface.co/Qwen/Qwen4-Instruct", "qwen"],
    ["https://github.com/kapitalismho/PuriPuly-heart/releases/tag/v3", "puripuly-heart"],
    ["https://github.com/cloudflare/workers-oauth-provider/releases/tag/v2", "workers-oauth-provider"],
    ["https://github.blog/changelog/2026-11-03-example-for-github-copilot-cli/", "github-copilot"],
    ["https://developers.openai.com/api/docs/models/gpt-7.2", "gpt"],
    ["https://platform.claude.com/docs/en/models/sonnet-6-1/migration-guide", "claude-sonnet"],
  ];
  for (const [url, product] of samples) {
    assert.deepEqual(keys(record("v9.0 の変更", "", "agent", { sources: [["一次資料", url]] }), "product"), [product], url);
  }
  assert.deepEqual(keys(record("連携更新", "", "local", { sources: [{ url: samples[0][0] }, { url: samples[3][0] }] }), "product"), ["codex", "ollama"]);
});

test("source fallback does not attach the subject of an omnibus announcement to another headline", () => {
  const source = [["Haiku and pricing", "https://www.anthropic.com/claude-haiku-5-5"]];
  assert.deepEqual(keys(record("Sonnet 5.5 が半額", "", "api", { sources: source }), "product"), ["claude-sonnet"]);
  assert.deepEqual(keys(record("Claude Max に API クレジット", "", "api", { sources: source }), "product"), ["claude"]);
});

test("secondary comparison products are excluded while named integrations remain", () => {
  for (const lead of ["Claude Code と比較する候補。", "Claude Code より高速。", "faster than Claude Code", "compared with Claude Code", "unlike Claude Code", "比較対象は Claude Code", "Claude Code ではなく Codex CLI の更新。"])
    assert.deepEqual(keys(record("Codex CLI の改善", lead), "product"), ["codex"], lead);
  assert.deepEqual(keys(record("Copilot CLI", "Ollama に対応を追加。", "local"), "product"), ["github-copilot", "ollama"]);
  assert.deepEqual(keys(record("Claude Code の更新ではありません", "", "agent", { sources: [["公式", "https://github.com/anthropics/claude-code/releases"]] }), "product"), ["other"]);
});

test("ambiguous product names and ordinary words stay neutral without identifying context", () => {
  for (const title of ["Haiku を読む", "Sonnet を書く", "Copilot", "Agents SDK", "d1 の値", "Durable Object", "runwayx", "Codexish", "Qwenness", "llamaXcpp", "Ollamax", "GPTfoo"]) {
    assert.deepEqual(keys(record(title), "product"), ["other"], title);
  }
  assert.deepEqual(keys(record("Agents SDK に追加", "", "mcp", { sources: [["公式", "https://developers.cloudflare.com/changelog/post/2026-11-01-example/"]] }), "product"), ["cloudflare-agents-sdk"]);
  assert.deepEqual(keys(record("OpenAI Agents SDK", ""), "product"), ["other"]);
});

test("fake hosts, similarly named repositories, URL queries and captions cannot establish a product", () => {
  const badURLs = [
    "https://example.com/openai/codex", "https://github.com/fork-owner/codex/releases", "https://github.com/openai/codex-fork/releases",
    "https://github.com.example.com/openai/codex", "https://developers.openai.com.evil.example/api/docs/models/gpt-9",
    "https://example.com/?q=claude-code", "https://github.com/openai?repo=codex", "http://github.com/openai/codex",
    "https://user:password@github.com/openai/codex", "https://github.com:8443/openai/codex", "https://github.com/openai%2fcodex",
    "https://huggingface.co/other/LightOnOCR-3", "https://huggingface.co/LiquidAI/d1-omni-900M-fake", "not a URL",
    "https://www.anthropic.com/", "https://developers.openai.com/api/docs/changelog", "https://github.blog/changelog/2026-11-01-not-copilot/",
  ];
  for (const url of badURLs) assert.deepEqual(keys(record("お知らせ", "", "api", { sources: [["Codex Claude Code GPT", url]] }), "product"), ["other"], url);
});

test("facts, test suggestions, IDs and source labels are excluded from both products and changes", () => {
  const item = record("Codex CLI 2.0", "通常の更新", "agent", {
    id: "gpt-removed", flag: "参考", facts: ["Gemini を廃止。Claude Code に料金改定。"],
    test: "Ollama の価格、sandbox、移行を再テスト。新機能を追加し提供終了を確認。",
    sources: [["Runway deprecation / beta / GA / 修正", "https://example.com/new-feature"]],
  });
  assert.deepEqual(keys(item, "product"), ["codex"]);
  assert.deepEqual(keys(item, "change"), ["update"]);
});

test("corrected or unannounced end dates never become confirmed deprecation", () => {
  const samples = [
    record("Gemini の終了日未発表", "", "media"),
    record("Gemini の終了日を訂正", "10月29日に提供終了という説明を訂正。", "media"),
    record("Gemini は廃止ではない", "非推奨ではない。", "media"),
    record("Gemini の廃止予定なし", "提供終了は未発表。", "media"),
    record("Gemini is not deprecated", "The deprecation date is unknown.", "media"),
    record("Gemini is no longer deprecated", "Deprecation was incorrect.", "media"),
    record("Gemini の提供終了を撤回", "廃止が中止。", "media"),
    record("Gemini: no deprecation is planned", "Deprecation hasn't been announced.", "media"),
    record("Gemini deprecation was withdrawn", "", "media"),
    record("Gemini lifecycle", "", "media", { sources: [["Google deprecations", "https://ai.google.dev/gemini-api/docs/deprecations"]] }),
  ];
  for (const item of samples) assert.ok(!keys(item, "change").includes("deprecation"), JSON.stringify(item));
  const current = records.find((item) => item.id === "gemini-image-lifecycle");
  assert.ok(keys(current, "change").includes("correction"));
  assert.ok(!keys(current, "change").includes("deprecation"));
});

test("explicit affirmative deprecation still works in unseen releases and independent clauses", () => {
  for (const item of [
    record("Gemini 旧モデルの提供終了", "11月1日にサポート終了。", "media"),
    record("Claude legacy model is deprecated", "", "api"),
    record("Codex の旧認証を廃止", "", "agent"),
    record("Ollama の変更", "実験 API は廃止ではない。旧エンドポイントは提供終了。", "local"),
  ]) assert.ok(keys(item, "change").includes("deprecation"), item.title);
});

test("negated feature/release/GA/preview signals do not generate misleading change tags", () => {
  const samples = [
    [record("Codex", "新機能は追加されていない。"), "feature"],
    [record("Codex", "重みは公開されていない。"), "release"],
    [record("Codex", "未公開。"), "release"],
    [record("Codex", "not generally available"), "ga"],
    [record("Codex", "not a beta release"), "preview"],
    [record("Codex", "性能改善はない。"), "improvement"],
    [record("Codex", "互換性に変更なし。"), "compatibility"],
  ];
  for (const [item, absent] of samples) assert.ok(!keys(item, "change").includes(absent), item.lead);
  assert.deepEqual(keys(record("Copilot CLI", "beta を終了し、GA として一般提供。"), "change"), ["ga"]);
  assert.deepEqual(keys(record("Copilot CLI", "beta を終了、GAへ。"), "change"), ["ga"]);
});

test("mutation of returned tags cannot alter later outputs or the input record", () => {
  const input = structuredClone(records[0]);
  const before = structuredClone(input);
  const expected = automaticTags(input);
  const output = automaticTags(input);
  output[0].label = "changed";
  output.push({ id: "made-up", label: "made-up", kind: "product" });
  assert.deepEqual(input, before);
  assert.deepEqual(automaticTags(input), expected);
});



