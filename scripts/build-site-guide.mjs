import { build } from 'esbuild';
import { minify } from 'terser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, readdir } from 'node:fs/promises';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function buildSiteGuide({ write = true } = {}) {
  // esbuild's identifier minifier names bindings from a character-frequency
  // histogram. A one-byte difference in any input (including text that does
  // not survive into the runtime structure) renames every binding, so the
  // committed bundle is not reproducible across machines. Syntax and
  // whitespace stay with the pinned esbuild; names come from terser's
  // scope-order mangler, which depends only on program structure.
  const result = await build({
    absWorkingDir: repoRoot,
    entryPoints: ['ui/site-guide.jsx'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    charset: 'ascii',
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false,
    legalComments: 'inline',
    write: false,
    metafile: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    jsx: 'automatic',
  });
  const mangled = await minify(result.outputFiles[0].text, {
    ecma: 2022,
    module: true,
    compress: false,
    mangle: { safari10: false },
    format: { comments: 'some', ascii_only: true },
  });
  if (!mangled.code) throw new Error('Pinned terser produced empty site guide output');
  const roots = [...new Set(Object.entries(Object.values(result.metafile.outputs)[0].inputs).filter(([p, v]) => v.bytesInOutput > 0 && p.startsWith('node_modules/')).map(([p]) => p).map(p => { const parts = p.split('/'); return parts.slice(0, parts[1].startsWith('@') ? 3 : 2).join('/'); }))].sort();
  const notices = [];
  for (const root of roots) {
    const packageRoot = path.join(repoRoot, root);
    const info = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
    const files = (await readdir(packageRoot)).filter(f => /^licen[sc]e(?:\.(?:md|txt))?$/i.test(f)).sort((a, b) => a.localeCompare(b, 'en'));
    if (!files.length) throw new Error(`No license file for bundled package ${info.name}`);
    notices.push(`${info.name} ${info.version}\n${await readFile(path.join(packageRoot, files[0]), 'utf8')}`);
  }
  const license = notices.join('\n\n========================================\n\n');
  const body = mangled.code.endsWith('\n') ? mangled.code : `${mangled.code}\n`;
  const code = `/*! Animate UI 2.0.0 — MIT + Commons Clause. Full notices: /assets/site-guide-LICENSE.txt */\n` + body;
  if (write) {
    await writeFile(path.join(repoRoot, 'public/assets/site-guide-v1.js'), code);
    await writeFile(path.join(repoRoot, 'public/assets/site-guide-LICENSE.txt'), license);
  }
  return code;
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) await buildSiteGuide();
