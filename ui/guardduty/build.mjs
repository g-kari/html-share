import { build } from 'esbuild';
await build({
  entryPoints: [new URL('./app.jsx', import.meta.url).pathname],
  outfile: new URL('../../public/assets/guardduty-animate.js', import.meta.url).pathname,
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2022'],
  platform: 'browser',
  jsx: 'automatic',
  legalComments: 'none',
  sourcemap: false,
  logLevel: 'info',
});
