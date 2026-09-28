# html-share

ChatGPT から生成した HTML を置いて、Cloudflare Pages 経由で共有するためのリポジトリです。

## Structure

- `index.html` - トップページ
- `pages/` - 共有用HTML

## Deploy

Cloudflare Pages でこのリポジトリの `main` ブランチを接続します。

- Production branch: `main`
- Build command: `exit 0`
- Output directory: `.`

以後、`pages/*.html` を追加・更新すると自動デプロイされます。
