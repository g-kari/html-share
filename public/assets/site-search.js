import { prepareIndex, searchDocuments, snippet } from "./site-search-core.js";

export function initSearch(document, window, fetchIndex = window.fetch.bind(window)) {
  const form = document.getElementById("site-search");
  const input = document.getElementById("search-query");
  const clear = document.getElementById("search-clear");
  const status = document.getElementById("search-status");
  const results = document.getElementById("search-results");
  const pages = document.getElementById("page-list");
  const more = document.getElementById("search-more");
  if (![form, input, clear, status, results, pages, more].every(Boolean)) return;
  let indexPromise;
  let documents;
  let request = 0;
  let timer;
  let composing = false;
  let found = [];
  let shown = 0;
  let renderedQuery = "";
  let committedUrl = window.location.href;
  const readQuery = () => (new URL(window.location.href).searchParams.get("q") || "").slice(0, 200);
  const setUrl = (query, push) => {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query); else url.searchParams.delete("q");
    if (push) {
      // Live input may already have replaced the current URL. Restore the
      // last submitted state before adding a new, useful Back/Forward entry.
      if (url.href !== committedUrl) {
        window.history.replaceState(null, "", committedUrl);
        window.history.pushState(null, "", url);
        committedUrl = url.href;
      }
    } else if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  };
  const load = () => {
    if (documents) return Promise.resolve(documents);
    if (!indexPromise) indexPromise = fetchIndex(form.dataset.index, { credentials: "same-origin" })
      .then((response) => { if (!response.ok) throw new Error("Search download failed."); return response.json(); })
      .then((data) => { documents = prepareIndex(data); return documents; })
      .catch((error) => { indexPromise = null; throw error; });
    return indexPromise;
  };
  const appendSnippet = (element, detail) => {
    if (detail.before) element.append(document.createTextNode("…"));
    let offset = 0;
    for (const [start, end] of detail.ranges) {
      element.append(document.createTextNode(detail.text.slice(offset, start)));
      const mark = document.createElement("mark");
      mark.textContent = detail.text.slice(start, end);
      element.append(mark);
      offset = end;
    }
    element.append(document.createTextNode(detail.text.slice(offset) + (detail.after ? "…" : "")));
  };
  const renderMore = () => {
    const firstNew = shown;
    for (const result of found.slice(shown, shown + 20)) {
      const article = document.createElement("article");
      article.className = "card";
      const link = document.createElement("a");
      link.href = result.route + (result.section.anchor ? "#" + encodeURIComponent(result.section.anchor) : "");
      const title = document.createElement("h2");
      title.textContent = result.title;
      const summary = document.createElement("p");
      appendSnippet(summary, snippet(result.section.text, renderedQuery));
      const route = document.createElement("span");
      route.className = "result-route";
      route.textContent = result.route;
      link.append(title, summary, route);
      article.append(link);
      results.append(article);
    }
    shown = Math.min(shown + 20, found.length);
    more.hidden = shown >= found.length;
    if (firstNew) results.children[firstNew]?.querySelector("a")?.focus();
  };
  const run = async (push = false) => {
    window.clearTimeout(timer);
    const query = input.value.trim();
    const current = ++request;
    clear.hidden = !query;
    setUrl(query, push);
    results.replaceChildren();
    more.hidden = true;
    if (!query) {
      status.textContent = "タイトルと本文を検索できます。";
      pages.hidden = false;
      results.hidden = true;
      results.removeAttribute("aria-busy");
      return;
    }
    status.textContent = "検索データを読み込んでいます…";
    pages.hidden = false;
    results.hidden = true;
    results.setAttribute("aria-busy", "true");
    try {
      const data = await load();
      if (current !== request) return;
      found = searchDocuments(data, query);
      renderedQuery = query;
      shown = 0;
      results.hidden = false;
      pages.hidden = true;
      status.textContent = found.length ? `${found.length}ページが見つかりました。` : "見つかりませんでした。別の言葉や短いキーワードで検索してください。";
      renderMore();
    } catch {
      if (current !== request) return;
      status.textContent = "検索データを読み込めませんでした。「検索」で再試行できます。ページ一覧からも開けます。";
      pages.hidden = false;
      results.hidden = true;
    } finally {
      if (current === request) results.removeAttribute("aria-busy");
    }
  };
  form.hidden = false;
  input.value = readQuery();
  form.addEventListener("submit", (event) => { event.preventDefault(); if (!composing) void run(true); });
  input.addEventListener("input", () => { request++; if (!composing) { window.clearTimeout(timer); timer = window.setTimeout(() => void run(), 250); } });
  input.addEventListener("compositionstart", () => { request++; composing = true; window.clearTimeout(timer); });
  input.addEventListener("compositionend", () => { composing = false; void run(); });
  clear.addEventListener("click", () => { input.value = ""; void run(true); input.focus(); });
  more.addEventListener("click", renderMore);
  window.addEventListener("popstate", () => { committedUrl = window.location.href; input.value = readQuery(); void run(); });
  void run();
  return { run };
}

if (typeof document !== "undefined" && typeof window !== "undefined") initSearch(document, window);
