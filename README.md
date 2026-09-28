# html-share

ChatGPT から生成した HTML を Cloudflare Workers Static Assets で共有するためのリポジトリです。

## Structure

- `public/index.html` - 自動生成されるトップページ / SPA fallback
- `public/**/*.html` - 共有用HTML
- `scripts/generate-index.mjs` - HTML一覧からトップページを生成
- `.github/workflows/generate-index.yml` - index 自動再生成
- `wrangler.jsonc` - Workers / Static Assets / Custom Domain 設定

## Add a page

共有ページを追加するときは、`public/` 配下に HTML を置くだけです。

例:

```text
public/
├─ zam.html
├─ aws-news.html
└─ memo/
   └─ mysql.html
```

Cloudflare Workers Static Assets の HTML handling により、URLは次のようになります。

- `public/zam.html` → `/zam`
- `public/aws-news.html` → `/aws-news`
- `public/memo/mysql.html` → `/memo/mysql`

各ページの `<title>` を一覧のタイトルとして使用します。

```html
<title>ページタイトル</title>
```

`meta description` があれば一覧にも表示します。

```html
<meta name="description" content="ページの説明">
```

## Automatic index generation

`main` に `public/**/*.html` の変更が push されると GitHub Actions が自動で:

1. `public/` を再帰的に走査
2. `public/index.html` 自身を除外
3. 各 HTML の `<title>` と `meta description` を取得
4. `.html` を外した公開URLを生成
5. `public/index.html` を再生成
6. 差分がある場合だけ `github-actions[bot]` が commit / push

そのため `public/index.html` は基本的に手編集しません。

手元で再生成する場合:

```sh
node scripts/generate-index.mjs
```

## Routing

Cloudflare Workers Static Assets の設定:

- `/` → `public/index.html`
- `/foo` → `public/foo.html`
- `/foo/bar` → `public/foo/bar.html`
- 存在しないナビゲーションURL → `public/index.html`

## Deploy

Cloudflare Workers Builds で `main` ブランチを接続し、Deploy command は以下です。

```sh
npx wrangler deploy
```

Static Assets の対象は `./public` のみです。リポジトリの `.git` や Wrangler の一時ファイルは配信されません。

Custom Domain:

- https://share.0g0.xyz
