# html-share

ChatGPT から生成した HTML を Cloudflare Workers Static Assets で共有するためのリポジトリです。

## Structure

- `public/index.html` - トップページ / SPA fallback
- `public/*.html` - 共有用HTML
- `wrangler.jsonc` - Workers / Static Assets / Custom Domain 設定

## Routing

Cloudflare Workers Static Assets の HTML handling を利用します。

- `/` → `public/index.html`
- `/zam` → `public/zam.html`
- `/test` → `public/test.html`
- 存在しないナビゲーションURL → `public/index.html`

共有ページは `public/<slug>.html` として追加すれば、`/<slug>` でアクセスできます。

## Deploy

Cloudflare Workers Builds で `main` ブランチを接続し、以下のコマンドでデプロイします。

```sh
npx wrangler deploy
```

Static Assets の対象は `./public` のみです。リポジトリの `.git` や Wrangler の一時ファイルは配信されません。

Custom Domain:

- https://share.0g0.xyz

Workers development URL は Cloudflare 側の設定が有効なら引き続き利用できます。
