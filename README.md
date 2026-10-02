# html-share

ChatGPT から生成した HTML を Cloudflare Workers Static Assets で共有するためのリポジトリです。

## Structure

- `public/index.html` - 自動生成されるトップページ / SPA fallback
- `public/**/*.html` - 共有用HTML
- `scripts/generate-index.mjs` - HTML一覧・OGP・Twitterカードを生成
- `.github/workflows/generate-index.yml` - 一覧・SNSメタデータの自動再生成
- `scripts/social-metadata.mjs` - 公開URLとSNSメタデータの共通処理
- `tests/social-metadata.test.mjs` - Node標準テスト
- `public/assets/html-share-card-v1.png` - 共通OGP画像（1200×630）
- `design/render-card.py` - 共通画像の任意の再描画用ソース（Pillow）
- `wrangler.jsonc` - Workers / Static Assets / Custom Domain / build 設定

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

`main` にページ・生成スクリプト・画像などの変更が push されると GitHub Actions が自動で:

1. `public/` を再帰的に走査
2. `public/index.html` 自身を除外
3. 各 HTML の `<title>` と `meta description` を取得
4. `.html` を外した公開URLを生成
5. `public/index.html` を再生成
6. 全ページの `<head>` にOGP・Twitterカードを補完
7. 差分がある場合だけ `github-actions[bot]` が commit / push

生成処理は現在の `main` を読み直してから実行します。並行してページが更新された場合も、新しい本文を古い生成結果で上書きしません。PRではテストだけを実行し、`main` に書き込みません。

そのため `public/index.html` は基本的に手編集しません。

手元で再生成する場合:

```sh
node scripts/generate-index.mjs
```

## Social previews (OGP / Twitter Cards)

全ページとトップページに、共有URL・ページタイトル・説明・共通画像を自動補完します。
`<title>` と `meta description` を書くだけで、今後の新しいページにも適用されます。
説明がない場合はタイトルを含む短い説明を使用します。

- OGP: `og:type`, `og:site_name`, `og:title`, `og:description`, `og:url`, `og:image`, `og:image:alt`
- 共通画像: PNG / 1200×630、絶対URL、幅・高さ・MIME typeを明示
- Twitter Cards: `summary_large_image`、タイトル・説明・画像・alt
- canonical: `.html` を外した絶対URL（ネストした `index.html` は末尾 `/`）

既存の本文・スタイル・スクリプトは維持します。生成部分は
`<!-- html-share: social metadata -->` のコメントで区切られ、何度実行しても重複しません。
生成部分の外に書いたOGP/Twitter/canonicalタグを優先するため、ページ単位のカスタマイズもできます。
相対canonical・画像URLは、そのページの公開URLを基準に絶対URLへ変換します。
独自画像を指定するときは、その画像の `og:image:width`, `og:image:height`,
`og:image:type`, `og:image:alt` も指定してください。共通画像のサイズを独自画像へ流用しません。

```html
<meta property="og:image" content="/assets/my-page.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="画像の説明">
```

共通画像はバージョン付きファイル名と長期キャッシュを使用します。
画像を変更するときはファイル名と `scripts/social-metadata.mjs`、`public/_headers`、テストを合わせて更新してください。
SNS側に古いプレビューが残ることがあります。サイト側の更新後も、各サービスの再クロールまで反映が遅れる場合があります。

検証:

```sh
node --test tests/*.test.mjs
node scripts/generate-index.mjs
npx wrangler deploy --dry-run
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

`wrangler.jsonc` の空の `previews` ブロックは、既存のブランチビルド（`npx wrangler preview`）に対応するための設定です。

`wrangler.jsonc` の build hook がデプロイ前に生成処理を実行するため、GitHub Actions の生成commitを待たずに新しいページにもOGPが入ります。

Static Assets の対象は `./public` のみです。リポジトリの `.git` や Wrangler の一時ファイルは配信されません。

Custom Domain:

- https://share.0g0.xyz
