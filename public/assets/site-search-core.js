const fold = (text) => text.normalize("NFKC").toLocaleLowerCase("ja")
  .replace(/[\u30a1-\u30f6]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60))
  .replace(/[\u200b-\u200d\ufeff]/g, "");

export const normalizeSearch = (text) => fold(String(text)).replace(/\s+/gu, " ").trim();
export const queryTerms = (query) => [...new Set(normalizeSearch(query).split(" ").filter(Boolean))];

export function prepareIndex(data) {
  if (data?.version !== 1 || !Array.isArray(data.documents)) throw new Error("Unsupported search index.");
  return data.documents.map((document) => {
    if (typeof document.route !== "string" || !/^\/(?!\/)/.test(document.route) || /[?#\\\u0000-\u0020]/.test(document.route) ||
        typeof document.title !== "string" || typeof document.description !== "string" || !Array.isArray(document.sections)) throw new Error("Invalid search document.");
    const sections = document.sections.map(({ text, anchor }) => {
      if (typeof text !== "string" || typeof anchor !== "string") throw new Error("Invalid search section.");
      return { text, anchor, normalized: normalizeSearch(text) };
    });
    const title = normalizeSearch(document.title);
    const description = normalizeSearch(document.description);
    return { ...document, sections, normalizedTitle: title, normalizedDescription: description, searchable: [title, description, ...sections.map((section) => section.normalized)].join("\n") };
  });
}

export function searchDocuments(documents, query) {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const results = [];
  for (const document of documents) {
    if (!terms.every((term) => document.searchable.includes(term))) continue;
    let best = null;
    let bodyScore = 0;
    let bestAnchorScore = -1;
    for (const section of document.sections) {
      const score = terms.filter((term) => section.normalized.includes(term)).length;
      const specific = section.anchor && !/^(main|content|advisories|archive-index)$/.test(section.anchor);
      const anchorScore = specific ? 1 + (terms.some((term) => normalizeSearch(section.anchor).includes(term)) ? 1 : 0) : 0;
      if (score > bodyScore || (score > 0 && score === bodyScore && (anchorScore > bestAnchorScore || (anchorScore === bestAnchorScore && section.text.length < best.text.length)))) {
        best = section; bodyScore = score; bestAnchorScore = anchorScore;
      }
    }
    const score = terms.reduce((total, term) => total + (document.normalizedTitle.includes(term) ? 8 : 0) + (document.normalizedDescription.includes(term) ? 3 : 0), bodyScore);
    const section = best || { text: document.description || document.sections[0]?.text || document.title, anchor: "" };
    results.push({ route: document.route, title: document.title, section, score });
  }
  return results.sort((a, b) => b.score - a.score || a.route.localeCompare(b.route, "ja"));
}

function normalizedMap(text) {
  const segments = typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(text)].map(({ segment, index }) => ({ segment, index }))
    : [...text.matchAll(/.[\p{M}\uff9e\uff9f]*/gu)].map((match) => ({ segment: match[0], index: match.index }));
  let normalized = "";
  const ranges = [];
  for (const { segment, index } of segments) {
    const value = fold(segment);
    for (let offset = 0; offset < value.length; offset++) ranges.push([index, index + segment.length]);
    normalized += value;
  }
  return { normalized, ranges };
}

// Return plain text and offsets; rendering never interpolates source/query HTML.
export function snippet(text, query, limit = 180) {
  const terms = queryTerms(query);
  const { normalized, ranges } = normalizedMap(text);
  const matches = [];
  for (const term of terms) {
    let from = 0;
    while (from < normalized.length) {
      const index = normalized.indexOf(term, from);
      if (index < 0) break;
      matches.push([ranges[index][0], ranges[index + term.length - 1][1]]);
      from = index + term.length;
    }
  }
  matches.sort((a, b) => a[0] - b[0]);
  const center = matches[0]?.[0] || 0;
  let start = Math.max(0, center - 45);
  let end = Math.min(text.length, start + limit);
  if (start && /[\uDC00-\uDFFF]/.test(text[start])) start--;
  if (end < text.length && /[\uDC00-\uDFFF]/.test(text[end])) end++;
  const visible = [];
  for (const [a, b] of matches) {
    if (a < start || a >= end) continue;
    const range = [a - start, Math.min(b, end) - start];
    if (visible.length && range[0] <= visible.at(-1)[1]) visible.at(-1)[1] = Math.max(visible.at(-1)[1], range[1]);
    else visible.push(range);
  }
  return { text: text.slice(start, end), ranges: visible, before: start > 0, after: end < text.length };
}
