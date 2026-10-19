import { build } from 'esbuild';
import path from 'node:path';
import { readFile, writeFile, readdir } from 'node:fs/promises';
export async function buildSiteGuide({ write = true } = {}) {
  const result = await build({ entryPoints:['ui/site-guide.jsx'], bundle:true, format:'esm', platform:'browser', target:['es2022'], minify:true, legalComments:'inline', write:false, metafile:true, define:{'process.env.NODE_ENV':'"production"'}, jsx:'automatic' });
  const roots = [...new Set(Object.entries(Object.values(result.metafile.outputs)[0].inputs).filter(([p,v])=>v.bytesInOutput > 0 && p.startsWith('node_modules/')).map(([p])=>p).map(p=>{const parts=p.split('/');return parts.slice(0,parts[1].startsWith('@')?3:2).join('/');}))].sort();
  const notices = [];
  for (const root of roots) {
    const info = JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
    const files = (await readdir(root)).filter(f=>/^licen[sc]e(?:\.(?:md|txt))?$/i.test(f));
    if (!files.length) throw new Error(`No license file for bundled package ${info.name}`);
    notices.push(`${info.name} ${info.version}\n${await readFile(path.join(root,files[0]),'utf8')}`);
  }
  const license = notices.join('\n\n========================================\n\n');
  const code = `/*! Animate UI 2.0.0 — MIT + Commons Clause. Full notices: /assets/site-guide-LICENSE.txt */\n` + result.outputFiles[0].text;
  if (write) {
    await writeFile('public/assets/site-guide-v1.js', code);
    await writeFile('public/assets/site-guide-LICENSE.txt', license);
  }
  return code;
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) await buildSiteGuide();
