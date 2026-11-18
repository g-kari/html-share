/* HTML Share — shared reading aids. Progressive enhancement only:
   without this script every page stays fully readable.
   Provides: reading progress bar, back-to-top button, heading anchor
   links, and table-of-contents scrollspy (nav.toc). */

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function initProgressAndBackTop() {
  const bar = document.createElement("div");
  bar.className = "hs-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.prepend(bar);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "hs-backtop";
  button.textContent = "↑";
  button.setAttribute("aria-label", "ページの先頭へ戻る");
  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });
  });
  document.body.append(button);

  let ticking = false;
  const update = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    bar.style.transform = `scaleX(${ratio})`;
    button.classList.toggle("hs-show", window.scrollY > 600);
  };
  window.addEventListener("scroll", () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  update();
}

function initHeadingAnchors() {
  for (const heading of document.querySelectorAll("h2[id], h3[id]")) {
    if (heading.querySelector(".hs-anchor")) continue;
    const anchor = document.createElement("a");
    anchor.className = "hs-anchor";
    anchor.href = `#${heading.id}`;
    anchor.textContent = "#";
    anchor.setAttribute("aria-label", "この見出しへのリンク");
    heading.append(anchor);
  }
}

function initScrollSpy() {
  const links = [...document.querySelectorAll('nav.toc a[href^="#"]')];
  if (!links.length || !("IntersectionObserver" in window)) return;
  const byId = new Map(links.map((link) => [decodeURIComponent(link.hash.slice(1)), link]));
  const targets = [...byId.keys()]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  if (!targets.length) return;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const link of links) link.classList.remove("active");
      const link = byId.get(entry.target.id);
      if (link) {
        link.classList.add("active");
        link.setAttribute("aria-current", "true");
      }
      for (const other of links) {
        if (other !== link) other.removeAttribute("aria-current");
      }
    }
  }, { rootMargin: "-30% 0px -60% 0px" });
  for (const target of targets) observer.observe(target);
}

initProgressAndBackTop();
initHeadingAnchors();
initScrollSpy();
