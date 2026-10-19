import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Accordion } from '@animate-ui/react/primitives/radix-ui/accordion';
import { AnimateUIProvider } from '@animate-ui/react/provider';

const roots = new WeakMap();
const focusCleanups = new WeakMap();

// Read only the static guide's authored text/links; never mount over search or articles.
export function SiteGuide({ sections, initiallyOpen }) {
  const [value, setValue] = useState(initiallyOpen);
  return <AnimateUIProvider reducedMotion="user"><Accordion.Root type="multiple" value={value} onValueChange={setValue} className="site-guide">
    {sections.map(({ id, title, links, text }) => <Accordion.Item value={id} key={id} className="guide-item">
      <Accordion.Header className="guide-heading"><Accordion.Trigger className="guide-trigger">{title}<span aria-hidden="true" className="guide-chevron">⌄</span></Accordion.Trigger></Accordion.Header>
      <Accordion.Content className="guide-panel"><div className="guide-inner"><p>{text}</p><ul>{links.map(({href,label}) => <li key={href}><a href={href}>{label}</a></li>)}</ul></div></Accordion.Content>
    </Accordion.Item>)}
  </Accordion.Root></AnimateUIProvider>;
}

export function mountGuide(fallback, host) {
  if (!fallback.isConnected || !host.isConnected || fallback.dataset.enhanced) return;
  // Do not replace the guide while a reader is navigating a link within it.
  const focused = document.activeElement;
  if (fallback.contains(focused) && focused.tagName !== 'SUMMARY') return;
  const details = [...fallback.querySelectorAll('details')];
  const focusedIndex = details.findIndex(d => d.querySelector('summary') === focused);
  const sections = details.map(d => ({id:d.dataset.guideSection, title:d.querySelector('summary').textContent,
    text:d.querySelector('p').textContent, links:[...d.querySelectorAll('a')].map(a=>({href:a.getAttribute('href'),label:a.textContent}))}));
  const initiallyOpen = details.filter(d=>d.open).map(d=>d.dataset.guideSection);
  let root;
  let lastFocusedIndex = -1;
  focusCleanups.get(host)?.();
  const trackFocus = () => { lastFocusedIndex = [...host.querySelectorAll('.guide-trigger')].indexOf(document.activeElement); };
  document.addEventListener('focusin', trackFocus);
  const cleanupFocus = () => document.removeEventListener('focusin', trackFocus);
  focusCleanups.set(host, cleanupFocus);
  const restore = () => {
    const activeIndex = lastFocusedIndex;
    cleanupFocus();
    host.hidden = true; fallback.hidden = false; delete fallback.dataset.enhanced;
    if (activeIndex >= 0) details[activeIndex]?.querySelector('summary')?.focus({preventScroll:true});
  };
  root = roots.get(host);
  if (!root) {
    root = createRoot(host, { onUncaughtError: () => host.restoreNativeGuide?.() });
    roots.set(host, root);
  }
  host.restoreNativeGuide = restore;
  try {
    flushSync(()=>root.render(<SiteGuide sections={sections} initiallyOpen={initiallyOpen}/>));
    if (host.querySelectorAll('.guide-trigger').length !== sections.length) {
      root.unmount(); roots.delete(host); restore(); return;
    }
    host.hidden = false;
    fallback.hidden = true;
    fallback.dataset.enhanced = 'true';
    if (focusedIndex >= 0) host.querySelectorAll('.guide-trigger')[focusedIndex]?.focus({preventScroll:true});
  } catch (error) {
    root.unmount(); roots.delete(host); restore();
    throw error;
  }
}
