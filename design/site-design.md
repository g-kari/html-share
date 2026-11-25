# サイト共通デザイン（site.css / site.js）

記事ページとトップページの見た目を統一するための共通デザインシステム。
実装は `public/assets/site.css` と `public/assets/site.js`。

現在のデザインは「ミニマル・モノクロ」（2026-11-25 採用）。白黒基調に
アクセントは赤1色（`#c8102e`、暗色時は `#ff4d4f`）だけを使い、見出しは
太ゴシック、余白は広めに取る。

## 目的と方針

- 色・フォント・余白・見出し・リンク・目次・表・コードの見た目を全ページで揃える。
- 新規ページはインラインCSSを複製せず、共通CSSをリンクして再利用する。
- アクセント色はサイト全体で赤1色に固定し、ページごとに変えない。
- ページ固有の差分（特殊な図版など）は小さな `<style>` で上書きする。
- JavaScriptは補助（プログレッシブエンハンスメント）だけに使い、無効でも全ページが読める。
- アニメーションは読みやすさを壊さない範囲に限定し、`prefers-reduced-motion` と印刷に配慮する。

## デザイントークン（CSS変数）

`site.css` の `:root` で定義する。ライトが既定で、`prefers-color-scheme: dark` で暗色に切り替わる。

| 変数 | 役割 |
|---|---|
| `--bg` | ページ背景 |
| `--paper` | パネル・目次・表ヘッダーなどの面 |
| `--ink` | 本文の文字色 |
| `--muted` | 補助テキスト |
| `--line` | 罫線 |
| `--accent` | リンク・見出しマーカーなど。赤 `#c8102e` で固定し、ページ側で上書きしない |
| `--accent-dark` | 暗色モード時のアクセント色（`#ff4d4f`） |
| `--code-bg` / `--code-ink` | コードブロックの背景・文字色 |
| `--radius` | 角丸（4px） |

## 主なコンポーネント（クラス）

- `.wrap` — 記事の本文コンテナ（最大800px、左右余白つき）
- `.sitebar` — 全ページ共通の上部バー（ブランド名「HTML Share」／一覧／RSS）。ブランドの四角マークはホバーで45°回転する
- `header.top`、`.kicker`、`.meta` — 記事ヘッダー
- `.summary3` — 冒頭の要点ボックス
- `nav.toc` — 目次（現在位置のスクロールスパイで `.active` を付ける）
- `.point` — 補足ボックス、`.links` — 関連リンク、`.note` — 小さな注記
- `.stats` / `.stat` — 数値の並び（ホバーで少し浮く）
- 表・`figure`・`pre`・`code`・`blockquote`・`details` は要素セレクタで統一済み

## 遊び心の要素

- 読書プログレスバー（`.hs-progress`、site.js が生成しスクロール量に連動）
- 「トップへ戻る」ボタン（`.hs-backtop`、ある程度スクロールすると表示）
- 見出しホバーで現れるアンカーリンク（`.hs-anchor`、site.js が注入）
- 目次リンクの下線アニメーションと現在位置ハイライト
- トップページの記事カードの段階的フェードイン（`hs-rise`、最大10件まで遅延）とホバー時の影
- テキスト選択色（`::selection`）をアクセント系に統一

すべて `prefers-reduced-motion: reduce` で無効化される。印刷時はプログレスバーと戻るボタンを隠す。

## 新規ページでの使い方

`<head>` に次を入れる（OGP等の生成ブロックとは別に書く。生成処理は生成ブロックとmeta以外を保持する）。

```html
<link rel="stylesheet" href="/assets/site.css">
```

アクセント色は共通CSS側で固定するため、ページ側で `--accent` を指定しない。

`</body>` の直前に次を入れる。

```html
<script type="module" src="/assets/site.js"></script>
```

本文は `.wrap` で囲み、先頭に `.sitebar`、見出しには `id` を付ける（アンカーとスクロールスパイの対象になる）。

## 適用状況と移行方針

- 適用済み：トップページ（`scripts/generate-index.mjs` のテンプレートが site.css を読み、色変数を共通トークンに委譲）、`sam-altman-stanford-cs153`、`pi-durable`
- 記事ページは新規作成時に共通デザインで書き、既存ページは改訂のついでに順次移行する。一括置換はしない（ページごとに固有CSSとの競合確認が必要なため）。
- 2026-11-25 の「ミニマル・モノクロ」刷新では、共通CSSを使う全ページの `--accent` / `--accent-dark` 上書きを共通の赤（`#c8102e` / `#ff4d4f`）へ統一した。固有CSSを持つ未移行ページは対象外で、移行時に共通デザインへ寄せる。
- レポート系（`vulnerabilities`、`technology-updates` のハブとアーカイブ）と `aws-guardduty-2026` は専用デザインとテストを持つため対象外。移行する場合は各テストの検証文字列（インラインCSS内の規則など）も合わせて見直す。

## キャッシュ

`public/_headers` で `/assets/site.css` と `/assets/site.js` に `Cache-Control: public, max-age=300, must-revalidate` と `X-Content-Type-Options: nosniff` を付けている（site-search.js と同じ方針）。内容を変えたら5分以内に再検証される。
