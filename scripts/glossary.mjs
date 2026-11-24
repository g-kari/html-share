import { readFile } from "node:fs/promises";
import path from "node:path";
import { escapeHtml } from "./social-metadata.mjs";

// Glossary auto-linking.
//
// The dictionary at glossary/terms.json is the single source of truth.
// At generation time (scripts/generate-index.mjs) each article's first
// plain-text occurrence of a dictionary term is wrapped in a link to the
// matching anchor on /glossary, and the term list on public/glossary.html
// is re-rendered from the same dictionary. Generated links carry
// class="gloss" so the RSS fingerprint can unwrap them again: adding or
// removing an auto-link must never look like an authored page edit.

export const GLOSSARY_PAGE = "glossary.html";
export const GLOSSARY_ROUTE = "/glossary";
const REGION_START = "<!-- html-share: glossary terms -->";
const REGION_END = "<!-- /html-share: glossary terms -->";
const OPT_OUT = "<!-- glossary: off -->";

// Elements whose text is never linkified: headings, existing links, code,
// captions, definition lists (articles keep their own glossary there), and
// non-prose or interactive elements.
const SKIP_TAGS = new Set([
  "a", "pre", "code", "script", "style", "title", "head", "template",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "figcaption", "dl", "button", "textarea", "select", "svg", "math",
]);
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);

export function glossaryAnchor(term) {
  return `term-${term.id}`;
}

export async function loadGlossaryTerms(root) {
  let raw;
  try {
    raw = await readFile(path.join(root, "glossary", "terms.json"), "utf8");
  } catch (error) {
    // Partial source copies (test fixtures, older exports) may not carry
    // the dictionary yet. Auto-linking then simply stays off; the full
    // repository always ships glossary/terms.json.
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const data = JSON.parse(raw);
  if (data.version !== 1 || !Array.isArray(data.terms) || !data.terms.length) {
    throw new Error("Invalid glossary dictionary: glossary/terms.json");
  }
  const ids = new Set();
  for (const term of data.terms) {
    if (!/^[a-z0-9-]+$/.test(term.id || "") || ids.has(term.id)) {
      throw new Error(`Invalid or duplicate glossary term id: ${term.id}`);
    }
    ids.add(term.id);
    if (!term.term || !term.category || !term.description || !Array.isArray(term.aliases)) {
      throw new Error(`Incomplete glossary term: ${term.id}`);
    }
  }
  return data.terms;
}

// All surface forms, longest first, so "eBPF verifier" wins over "eBPF"
// and "脆弱なコードパス" wins over "コードパス".
function patternsFor(terms) {
  const patterns = [];
  for (const term of terms) {
    for (const surface of [term.term, ...term.aliases]) {
      patterns.push({ surface, term });
    }
  }
  return patterns.sort((a, b) => b.surface.length - a.surface.length);
}

const ASCII_WORD = /^[A-Za-z0-9_]$/;

function isAsciiSurface(surface) {
  return /^[\x20-\x7e]+$/.test(surface);
}

// ASCII terms (abbreviations and proper nouns) match only on a word
// boundary, so "ABI" never matches inside another word. Japanese terms
// have no word boundaries and match as substrings; longest-first order
// keeps a longer term from being shadowed by a shorter one inside it.
function matchAt(text, index, { surface }) {
  if (!text.startsWith(surface, index)) return false;
  if (isAsciiSurface(surface)) {
    const before = index > 0 ? text[index - 1] : "";
    const after = index + surface.length < text.length ? text[index + surface.length] : "";
    if (ASCII_WORD.test(before) || ASCII_WORD.test(after)) return false;
  }
  return true;
}

function linkifyText(text, patterns, used) {
  let result = "";
  let index = 0;
  while (index < text.length) {
    let linked = false;
    // Never start a match inside an HTML entity reference.
    if (text[index] !== "&") {
      for (const pattern of patterns) {
        if (used.has(pattern.term.id)) continue;
        if (!matchAt(text, index, pattern)) continue;
        const matched = text.slice(index, index + pattern.surface.length);
        if (matched.includes("&") || matched.includes("<")) continue;
        result += `<a class="gloss" href="${GLOSSARY_ROUTE}#${glossaryAnchor(pattern.term)}" title="${escapeHtml(pattern.term.description)}">${matched}</a>`;
        used.add(pattern.term.id);
        index += pattern.surface.length;
        linked = true;
        break;
      }
    }
    if (!linked) {
      result += text[index];
      index++;
    }
  }
  return result;
}

// Split HTML into comment / tag / text tokens with just enough structure
// to know which elements each text node lives inside.
function tokenize(html) {
  const tokens = [];
  const pattern = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|<![^>]*>/g;
  let last = 0;
  for (const match of html.matchAll(pattern)) {
    if (match.index > last) tokens.push({ kind: "text", value: html.slice(last, match.index) });
    const raw = match[0];
    if (raw.startsWith("<!--")) {
      tokens.push({ kind: "comment", value: raw });
    } else if (raw.startsWith("<!")) {
      tokens.push({ kind: "raw", value: raw });
    } else {
      const closing = raw.startsWith("</");
      const name = /^<\/?\s*([A-Za-z][A-Za-z0-9-]*)/.exec(raw)?.[1].toLowerCase() || "";
      tokens.push({ kind: "tag", value: raw, name, closing, selfClosing: /\/\s*>$/.test(raw) });
    }
    last = match.index + raw.length;
  }
  if (last < html.length) tokens.push({ kind: "text", value: html.slice(last) });
  return tokens;
}

function tagAttributes(raw) {
  const attrs = new Map();
  for (const match of raw.matchAll(/([A-Za-z-]+)\s*=\s*"([^"]*)"|([A-Za-z-]+)\s*=\s*'([^']*)'/g)) {
    attrs.set((match[1] || match[3]).toLowerCase(), match[2] ?? match[4]);
  }
  return attrs;
}

export function linkifyHtml(html, terms) {
  if (!terms.length || html.includes(OPT_OUT)) return html;
  const patterns = patternsFor(terms);
  const used = new Set();
  // Terms an author already linked by hand (for example Shirudo's
  // in-article #term-* links) count as used: never add a second link.
  for (const match of html.matchAll(/href="[^"]*#term-([a-z0-9-]+)"/g)) used.add(match[1]);

  const stack = [];
  let inBody = !/<body[\s>]/i.test(html);
  // An article's own glossary section (a heading with id="glossary" and
  // everything up to the next heading of the same or higher level) is
  // never linkified, so its definitions cannot link to themselves.
  let glossarySectionLevel = 0;
  let output = "";
  for (const token of tokenize(html)) {
    if (token.kind === "tag") {
      if (token.name === "body") inBody = !token.closing;
      const heading = /^h([1-6])$/.exec(token.name);
      if (heading && !token.closing) {
        const attrs = tagAttributes(token.value);
        if (attrs.get("id") === "glossary") glossarySectionLevel = Number(heading[1]);
        else if (glossarySectionLevel && Number(heading[1]) <= glossarySectionLevel) glossarySectionLevel = 0;
      }
      if (token.closing) {
        const at = stack.map((entry) => entry.name).lastIndexOf(token.name);
        if (at >= 0) stack.length = at;
      } else if (!token.selfClosing && !VOID_TAGS.has(token.name)) {
        const attrs = tagAttributes(token.value);
        const id = attrs.get("id") || "";
        const skip = id === "glossary" || id.startsWith("term-") ||
          (attrs.get("class") || "").split(/\s+/).includes("glossary") ||
          attrs.get("data-glossary") === "off";
        stack.push({ name: token.name, skip });
      }
      output += token.value;
      continue;
    }
    if (token.kind !== "text" || !inBody) {
      output += token.value;
      continue;
    }
    const skipped = glossarySectionLevel > 0 ||
      stack.some((entry) => entry.skip || SKIP_TAGS.has(entry.name));
    output += skipped ? token.value : linkifyText(token.value, patterns, used);
  }
  return output;
}

// Remove generated glossary links again, restoring the authored text.
// Used by the RSS fingerprint so auto-links never change a page's dates.
export function unwrapGlossaryLinks(html) {
  return html.replace(/<a class="gloss"[^>]*>([^<]*)<\/a>/g, "$1");
}

export function renderGlossaryTerms(terms) {
  const categories = [];
  for (const term of terms) {
    if (!categories.includes(term.category)) categories.push(term.category);
  }
  return categories.map((category) => {
    const entries = terms.filter((term) => term.category === category)
      .map((term) => `  <dt id="${glossaryAnchor(term)}">${escapeHtml(term.term)}</dt>\n  <dd>${escapeHtml(term.description)}</dd>`)
      .join("\n");
    return `<h2>${escapeHtml(category)}</h2>\n<dl>\n${entries}\n</dl>`;
  }).join("\n");
}

export function updateGlossaryPage(html, terms) {
  if (!terms.length) return html;
  const start = html.indexOf(REGION_START);
  const end = html.indexOf(REGION_END);
  if (start < 0 || end < start) return html;
  return html.slice(0, start + REGION_START.length) + "\n" +
    renderGlossaryTerms(terms) + "\n" + html.slice(end);
}
