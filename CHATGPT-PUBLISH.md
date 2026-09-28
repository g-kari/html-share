# Chat Publish Workflow

このリポジトリは、ChatGPT から HTML を公開するための共有先です。

## Trigger

ユーザーが以下のような意図を示したら、このワークフローを使います。

- 「公開して」
- 「これ共有して」
- 「HTMLにして公開」
- 「shareに上げて」
- 「html-shareに出して」

## Repository

- Repository: `g-kari/html-share`
- Branch: `main`
- Public directory: `public/`
- Base URL: `https://share.0g0.xyz`

## Publish procedure

1. 公開対象の内容を、単体で表示できる自己完結HTMLにする
2. `<title>` を必ず付ける
3. 可能なら `<meta name="description" ...>` も付ける
4. 内容から短く意味のある英数字slugを決める
5. `public/<slug>.html` として `main` に commit
6. `public/index.html` は手編集しない
7. GitHub Actions がページ一覧を自動生成する
8. 公開URLとして `https://share.0g0.xyz/<slug>` を返す

## Routing

Cloudflare Workers Static Assets の HTML handling により、`.html` はURLから省略します。

Examples:

- `public/zam.html` → `https://share.0g0.xyz/zam`
- `public/aws-news.html` → `https://share.0g0.xyz/aws-news`
- `public/memo/mysql.html` → `https://share.0g0.xyz/memo/mysql`

## Existing automation

- `scripts/generate-index.mjs` が `public/**/*.html` を再帰的に走査
- `.github/workflows/generate-index.yml` が index を自動更新
- `public/index.html` は生成物として扱う

## Important

- `.git` やリポジトリ直下全体を Static Assets にしない
- Static Assets の対象は `./public` のみ
- 既存slugと衝突する場合は上書き前に内容を確認する
