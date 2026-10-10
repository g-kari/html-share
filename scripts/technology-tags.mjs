/**
 * Deterministic, local classification of the technology-update record schema.
 *
 * These tags are navigation aids, not new assertions about a release. No AI,
 * network lookup, dates, record IDs, facts, test suggestions or source captions
 * participate. Product evidence is limited to title/lead names and allowlisted
 * official URL/repository identifiers. Provider homepages and arbitrary URLs
 * containing a product name do not identify a product. An exact source is a
 * fallback when the headline already identifies another product: one omnibus
 * Haiku announcement must not make a Sonnet pricing item a Haiku update.
 * Explicit “compared with / より / と比較” reference products are excluded;
 * named integrations or multiple updated products remain eligible.
 *
 * Domains follow the report's eight category values, never keyword guesses.
 * Change signals come only from title/lead/flag. Multiple supported tags are
 * retained, but negated/corrected signals are skipped. Lifecycle/compatibility
 * and correction are deliberately distinct from confirmed deprecation.
 * Unknown records get neutral product/domain/change fallbacks, so every record
 * has all three dimensions. Fixed ASCII IDs and declaration order are stable
 * across locale, input order, repeated builds, and future record versions.
 * Extend the dictionaries and their tests rather than deriving IDs from text.
 */

const normalized = (value) => typeof value === "string" ? value.normalize("NFKC").toLowerCase() : "";
const tag = (kind, key, label) => ({ id: `${kind}-${key}`, label, kind });

const DOMAINS = new Map([
  ["api", ["api", "モデル・API料金"]],
  ["agent", ["agent", "開発エージェント"]],
  ["local", ["local", "OSS・ローカル"]],
  ["audio", ["audio", "音声・字幕"]],
  ["media", ["media", "画像・動画"]],
  ["mcp", ["mcp", "MCP・実行基盤"]],
  ["cloud", ["cloud", "クラウド・運用"]],
  ["vr", ["vr", "VRChat・制作互換性"]],
]);

function sourceURLs(record) {
  if (!Array.isArray(record.sources)) return [];
  return record.sources.flatMap((source) => {
    const value = Array.isArray(source) ? source[1] : source?.url;
    if (typeof value !== "string") return [];
    try {
      const url = new URL(value);
      // Reject embedded credentials and lookalike hosts; queries are never
      // product evidence. Percent encoding cannot hide repository separators.
      if (url.protocol !== "https:" || url.username || url.password || url.port) return [];
      return [{ host: url.hostname.toLowerCase(), path: url.pathname.toLowerCase() }];
    } catch { return []; }
  });
}

const repository = (owner, name) => (url) => url.host === "github.com"
  && (url.path === `/${owner}/${name}` || url.path.startsWith(`/${owner}/${name}/`));
const officialPath = (hosts, path) => (url) => hosts.includes(url.host) && path.test(url.path);
const someSource = (urls, predicate) => urls.some(predicate);
const cloudflareContext = (text, urls) => /\bcloudflare\b/.test(text) || someSource(urls, (url) =>
  url.host === "developers.cloudflare.com" || url.host === "blog.cloudflare.com"
  || (url.host === "github.com" && url.path.startsWith("/cloudflare/")));

// The regex boundaries exclude English substring collisions, while allowing
// Japanese particles directly after a Latin product name and version suffixes.
const PRODUCTS = [
  { key: "cloudflare-markdown-agents", label: "Markdown for Agents", names: /\bmarkdown[\s-]+for[\s-]+agents(?=$|[^a-z0-9])/g, context: cloudflareContext,
    source: officialPath(["developers.cloudflare.com"], /^\/(?:fundamentals\/reference\/markdown-for-agents|changelog\/post\/2026-10-09-markdown-for-agents-in-process-conversion)\/?$/) },
  { key: "cloudflare-clef", label: "Cloudflare Clef", names: /\b(?:cloudflare[\s-]+clef|clef-(?:omni|flash))(?=$|[^a-z0-9])/g, context: cloudflareContext,
    source: officialPath(["developers.cloudflare.com"], /^\/(?:workers-ai\/models\/clef(?:-(?:omni|flash))?|changelog\/post\/2026-10-09-clef-omni-workers-ai)\/?$/) },
  { key: "cloudflare-http3", label: "Cloudflare HTTP/3", names: /\bcloudflare[\s-]+http\/3(?=$|[^a-z0-9])/g,
    source: officialPath(["developers.cloudflare.com"], /^\/changelog\/post\/2026-10-09-http3-499-reporting-improvement\/?$/) },
  { key: "cloudflare-workflows", label: "Cloudflare Workflows", names: /\bcloudflare[\s-]+workflows(?=$|[^a-z0-9])/g,
    source: officialPath(["developers.cloudflare.com"], /^\/(?:workflows(?:\/|$)|changelog\/post\/2026-10-08-create-batch-object-form\/?$)/) },
  { key: "aws-bedrock", label: "Amazon Bedrock", names: /\b(?:amazon|aws)[\s-]+bedrock(?=$|[^a-z0-9])/g,
    source: officialPath(["aws.amazon.com"], /^\/about-aws\/whats-new\/2026\/10\/aws-bedrock-attributes-in-cost-explorer\/?$/) },
  { key: "vrchat", label: "VRChat", names: /\bvrchat(?=$|[^a-z0-9])/g,
    source: (url) => repository("vrchat-community", "creator-docs")(url) || officialPath(["docs.vrchat.com"], /^\/docs\/vrchat-202641-open-beta\/?$/)(url) || officialPath(["ask.vrchat.com"], /^\/t\/developer-update-8-october-2026\/49095\/?$/)(url) },
  { key: "unity-cli", label: "Unity CLI", names: /\bunity[\s-]+cli(?=$|[^a-z0-9])/g,
    source: officialPath(["discussions.unity.com"], /^\/t\/(?:unity-cli-1-0-0-beta-13-is-rolling-out\/1738551|heads-up-upcoming-com-unity-pipeline-0-9-0-release-will-include-breaking-changes-to-command-names\/1738559)\/?$/) },

  { key: "claude-code", label: "Claude Code", names: /\bclaude[\s-]+code(?=$|[^a-z0-9])/g, source: repository("anthropics", "claude-code") },
  { key: "claude-haiku", label: "Claude Haiku", names: /\b(?:claude[\s-]+haiku|haiku[\s-]+\d)(?=$|[^a-z])/g,
    source: officialPath(["www.anthropic.com", "anthropic.com", "platform.claude.com"], /^\/(?:claude-haiku(?:-\d)+\/?$|docs\/en\/models\/haiku(?:-\d)+(?:\/|$))/) },
  { key: "claude-sonnet", label: "Claude Sonnet", names: /\b(?:claude[\s-]+sonnet|sonnet[\s-]+\d)(?=$|[^a-z])/g,
    source: officialPath(["www.anthropic.com", "anthropic.com", "platform.claude.com"], /^\/(?:claude-sonnet(?:-\d)+\/?$|docs\/en\/models\/sonnet(?:-\d)+(?:\/|$))/) },
  { key: "claude", label: "Claude", names: /\bclaude(?=$|[^a-z0-9])/g,
    source: officialPath(["support.claude.com"], /^\/en\/articles\/\d+-monthly-api-credits-for-max-and-team-plans\/?$/) },
  { key: "gpt", label: "GPT", names: /\bgpt(?:[\s-]*\d|(?=$|[^a-z0-9]))/g,
    source: officialPath(["developers.openai.com", "platform.openai.com"], /^\/(?:api\/)?docs\/models\/gpt-(?:\d|[a-z])[^/]*(?:\/|$)/) },
  { key: "responses-api", label: "Responses API", names: /\bresponses[\s-]+api(?=$|[^a-z0-9])/g,
    source: officialPath(["developers.openai.com", "platform.openai.com"], /^\/(?:api\/)?docs\/api-reference\/responses(?:\/|$)/) },
  { key: "codex", label: "Codex", names: /\bcodex(?=$|[^a-z0-9])/g, source: repository("openai", "codex") },
  { key: "github-copilot", label: "GitHub Copilot", names: /\b(?:github[\s-]+copilot|copilot[\s-]+cli)(?=$|[^a-z0-9])/g,
    contextualNames: /\bcopilot(?=$|[^a-z0-9])/g,
    source: (url) => repository("github", "copilot-cli")(url)
      || officialPath(["github.blog"], /^\/changelog\/\d{4}-\d{2}-\d{2}-[^/]*\bgithub-copilot(?:-[^/]*)?\/?$/)(url) },
  { key: "ollama", label: "Ollama", names: /\bollama(?=$|[^a-z0-9])/g, source: repository("ollama", "ollama") },
  { key: "lightonocr", label: "LightOnOCR", names: /\blightonocr(?=$|[^a-z0-9])/g,
    source: officialPath(["huggingface.co"], /^\/(?:blog\/lightonai\/lightonocr-\d+\/?$|lightonai\/lightonocr-\d+(?:[-/]|$))/) },
  { key: "llama-cpp", label: "llama.cpp", names: /\bllama\.cpp(?=$|[^a-z0-9])/g, source: repository("ggml-org", "llama.cpp") },
  { key: "liquid-ai-d1", label: "Liquid AI d1", names: /\b(?:liquid[\s-]+ai[\s-]+d1|d1-(?:omni-)?\d+[bm])(?=$|[^a-z0-9])/g,
    source: officialPath(["huggingface.co"], /^\/(?:blog\/liquidai\/open-d1\/?$|liquidai\/d1-(?:omni-)?\d+[bm](?:\/|$))/) },
  { key: "nano-banana", label: "Nano Banana", names: /\bnano[\s-]+banana(?=$|[^a-z0-9])/g },
  { key: "gemini", label: "Gemini", names: /\bgemini(?=$|[^a-z0-9])/g,
    source: officialPath(["ai.google.dev"], /^\/gemini-api(?:\/|$)/) },
  { key: "qwen", label: "Qwen", names: /\bqwen(?=$|[^a-z]|\d)/g,
    source: (url) => repository("qwenlm", "qwen")(url)
      || officialPath(["huggingface.co"], /^\/qwen\/qwen(?:\d|[-/]|$)/)(url) },
  { key: "puripuly-heart", label: "PuriPuly-heart", names: /\bpuripuly[\s-]+heart(?=$|[^a-z0-9])/g, source: repository("kapitalismho", "puripuly-heart") },
  { key: "runway", label: "Runway", names: /\brunway(?=$|[^a-z0-9])/g,
    source: officialPath(["runway.com"], /^\/changelog\/?$/) },
  { key: "seedance", label: "Seedance", names: /\bseedance(?=$|[^a-z0-9])/g },
  { key: "ideogram", label: "Ideogram", names: /\bideogram(?=$|[^a-z0-9])/g },
  { key: "cloudflare-agents-sdk", label: "Agents SDK (Cloudflare)", names: /\b(?:cloudflare[\s-]+)?agents[\s-]+sdk(?=$|[^a-z0-9])/g, context: cloudflareContext,
    source: repository("cloudflare", "agents") },
  { key: "piharness", label: "PiHarness", names: /\bpiharness(?=$|[^a-z0-9])/g,
    source: officialPath(["developers.cloudflare.com"], /^\/changelog\/post\/\d{4}-\d{2}-\d{2}-pi-harness\/?$/) },
  { key: "pi-durable", label: "Pi Durable", names: /\bpi[\s-]+durable(?=$|[^a-z0-9])/g },
  { key: "cloudflare-durable-objects", label: "Durable Objects", names: /\bdurable[\s-]+objects?(?=$|[^a-z0-9])/g, context: cloudflareContext,
    source: officialPath(["developers.cloudflare.com"], /^\/durable-objects(?:\/|$)/) },
  { key: "workers-oauth-provider", label: "Workers OAuth Provider", names: /\bworkers[\s-]+oauth[\s-]+provider(?=$|[^a-z0-9])/g,
    source: (url) => repository("cloudflare", "workers-oauth-provider")(url)
      || officialPath(["developers.cloudflare.com"], /^\/changelog\/post\/\d{4}-\d{2}-\d{2}-workers-oauth-provider-[^/]+\/?$/)(url) },
  { key: "cloudflare-workers", label: "Cloudflare Workers", names: /\bcloudflare[\s-]+workers(?=$|[^a-z0-9])/g,
    source: officialPath(["developers.cloudflare.com"], /^\/workers(?:\/|$)/) },
];

// Small lexical negation handling is intentionally conservative. It removes
// claims such as “not deprecated”, “廃止予定なし”, “追加されていない” and
// “提供終了という説明を訂正”. It never interprets a URL called deprecations
// as evidence of retirement. Independent clauses can still add positive tags.
function positiveMatches(text, pattern, { completedStage = false, productSubject = false } = {}) {
  const regex = new RegExp(pattern.source, pattern.flags.replace("g", "") + "g");
  return [...text.matchAll(regex)].filter((match) => {
    const start = match.index;
    const before = text.slice(Math.max(0, start - 60), start).split(/[。！？!?;；\n]/).at(-1);
    const after = text.slice(start + match[0].length, start + match[0].length + 60).split(/[。！？!?;；\n]/)[0];
    if (productSubject && /(?:\b(?:compared (?:with|to)|versus|vs\.?|faster than|slower than|rather than|unlike|instead of|alternative to|similar to)\s*|(?:比較(?:先|対象)(?:は|の)?|比べるなら)[\s:：]*)$/.test(before)) return false;
    if (productSubject && /^(?:[\s-]+\d[\w.-]*)?\s*(?:より|並み|と(?:の)?比較|と比べ|との違い)/.test(after)) return false;
    if (/\b(?:no|not|never|without|no longer|isn't|wasn't|aren't|doesn't|hasn't|haven't|won't|cannot)\b[^,、]{0,32}$/.test(before)) return false;
    if (/^[\s」”"'）)]*(?:は|が|を|の|に|も)?[\s、]*(?:予定|方針|変更|日|時期|され(?:て|る)?|した|して(?:い)?|の発表|という(?:説明|記載|情報|発表)|との(?:説明|記載|情報|発表))?[\s、]*(?:は|が|を|では|とは|に)?[\s、]*(?:ない|なく|なし|未発表|未定|未確定|未実施|しない|せず|いない|いません|ません|誤り|誤報|訂正|取り消|撤回|中止)/.test(after)) return false;
    if (/^[^,、]{0,24}(?:されていない|されていません|ではない|ではなく|ではありません|(?:予定|方針)(?:は|が)?ない)/.test(after)) return false;
    if (completedStage && /^[\s]*(?:を|が)?(?:終了|卒業)/.test(after)) return false;
    if (/^(?:\s+\w+){0,3}\s+(?:not|unannounced|unconfirmed|unknown|incorrect|false|cancelled|canceled|withdrawn|retracted|revoked|hasn't|haven't|isn't|wasn't|aren't|won't)\b/.test(after)) return false;
    // Japanese correction wording often puts a short object before “訂正”.
    if (/^[\s」”"']*(?:という|との)(?:説明|記載|情報|発表)(?:は|が|を)?[^。；;]{0,16}(?:訂正|誤り|誤報|取り消)/.test(after)) return false;
    return true;
  });
}

const CHANGES = [
  ["pricing", "料金・請求", /料金|価格|費用|低価格|半額|請求|クレジット|\b(?:pricing|price|billing|credits?)\b/],
  ["performance", "速度・安定性", /速度|高速|遅延|待ち時間|安定性|性能|\b(?:latency|performance|stability|faster)\b/],
  ["fix", "修正", /(?<!訂)修正|\b(?:bug[\s-]+fix(?:es)?|fixed|fixes)\b/],
  ["improvement", "改善", /改善|改良|最適化|\b(?:improve(?:s|d|ments?)?|optimi[sz](?:e[ds]?|ation))\b/],
  ["feature", "機能追加", /追加|新機能|\b(?:added|adds|new[\s-]+features?)\b/],
  ["release", "公開・リリース", /(?<!未)公開|(?<!未)リリース|\b(?:released|launch(?:ed|es)?)\b/],
  ["ga", "正式提供", /正式提供|一般提供|\bga\b|\bgenerally[\s-]+available\b|\bgeneral[\s-]+availability\b/],
  ["preview", "プレビュー・試験提供", /プレビュー|試験提供|\b(?:beta|preview|experimental)\b/],
  ["compatibility", "互換性・移行", /互換性|移行|推奨置換先|\b(?:compatibility|migration|migrate[ds]?|breaking[\s-]+changes?)\b/],
  ["security", "安全性・認証", /認証|認可|隔離|セキュリティ|脆弱性|\b(?:sandbox(?:ing)?|security|authentication|authorization|vulnerabilit(?:y|ies))\b/],
  ["lifecycle", "ライフサイクル", /ライフサイクル|終了日|\blife[\s-]?cycle\b/],
  ["correction", "訂正", /訂正|誤記(?:を)?修正|取り消し|\bcorrection\b/],
  ["deprecation", "提供終了・非推奨", /廃止|非推奨|(?:提供|サポート|サービス|利用|モデル|配信)(?:を|が|の)?終了|\b(?:deprecat(?:ed|ion|ing)|sunset(?:ted)?|shutdown|end[\s-]+of[\s-]+(?:life|support))\b/],
];

/** Return fresh, ordered {id,label,kind} navigation tags without mutating record. */
export function automaticTags(record) {
  const value = record && typeof record === "object" ? record : {};
  const text = [normalized(value.title), normalized(value.lead)].join("\n");
  const urls = sourceURLs(value);
  const products = new Set();
  const rejectedProducts = new Set();
  let remaining = text;
  for (const product of PRODUCTS) {
    const context = !product.context || product.context(text, urls);
    const contextual = product.contextualNames && product.source && someSource(urls, product.source);
    const matches = context ? positiveMatches(remaining, product.names, { productSubject: true }) : [];
    const contextualMatches = contextual ? positiveMatches(remaining, product.contextualNames, { productSubject: true }) : [];
    const nameOccurrences = [...remaining.matchAll(new RegExp(product.names.source, product.names.flags))];
    if (nameOccurrences.length && !matches.length) rejectedProducts.add(product.key);
    if (matches.length || contextualMatches.length) {
      products.add(product.key);
    }
    // Consume specific Claude phrases even if they were secondary/negated.
    // Otherwise “Claude Code” would become an unrelated generic Claude tag.
    if (product.key.startsWith("claude-")) {
      for (const match of nameOccurrences.toReversed()) remaining = remaining.slice(0, match.index) + " ".repeat(match[0].length) + remaining.slice(match.index + match[0].length);
    }
  }
  if (!products.size) {
    for (const product of PRODUCTS) if (!rejectedProducts.has(product.key) && product.source && someSource(urls, product.source)) products.add(product.key);
  }
  const result = PRODUCTS.filter((product) => products.has(product.key)).map((product) => tag("product", product.key, product.label));
  if (!result.length) result.push(tag("product", "other", "その他の製品"));
  const [domain, label] = DOMAINS.get(normalized(value.category)) || ["other", "その他の分野"];
  result.push(tag("domain", domain, label));
  const headline = `${text}\n${normalized(value.flag)}`;
  const changes = CHANGES.filter(([key, , pattern]) => positiveMatches(headline, pattern, { completedStage: key === "preview" }).length);
  result.push(...(changes.length ? changes.map(([key, name]) => tag("change", key, name)) : [tag("change", "update", "更新")]));
  return result;
}

