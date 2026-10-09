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
7. build hook / GitHub Actions がページ一覧・RSS・OGP・Twitterカードを自動生成する
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
- `public/assets/search/index-*.json` も生成物。サイト全体の全文検索は公開HTML本文だけを読み、検索時のみ索引を取得する。新ページは自動で検索対象になり、非公開原本やscript/JSONは索引に含めない
- `public/feed.xml`、`public/vulnerabilities-feed.xml`、`public/security-incidents-feed.xml`、`.feed-state.json`、`.report-feed-state.json` も生成物として扱い、手編集しない
- RSSの購読URLは `https://share.0g0.xyz/feed.xml`。公開ページを追加・更新すると自動反映される
- ページの公開URLを固定GUIDとし、内容変更commitの日時で更新する。生成部分だけの再生成は更新にしない
- 脆弱性・事案の専用RSSは更新ごとの別GUID。各レポートのJSON `records` / `incidents` に実質的な追加・訂正をする際は `changes[].summary` に具体的な変更概要を同時に記録する（先頭・末尾追加どちらも可）。事案では対象IDも記録することを推奨（過去のID未記録の実質的履歴も扱う）
- 確認日時・並べ替え・UIのみの変更は専用RSSの新着にしない。履歴・GUID・日時は状態に保存し、同じ差分は重複配信しない。概要のない実質変更はビルドを停止するので、データ変更を含まない別の後続commitで該当差分の意味のある概要を加えて再実行する（事案では該当差分の全対象IDも指定）（元のデータ公開日時を維持）。未commitの実質データは状態保存前に停止する
- 専用RSSはGitの実際の掲載日時を復元する。履歴の日付を発生日と扱わず、過去項目を現在時刻で埋めない。詳細はREADMEのReport update RSSを参照
- 各ページのOGP/Twitterカードは自動補完されるため、通常は手入力不要
- `<title>` と `meta description` をページごとに設定する
- 既存の生成コメント内は編集せず、独自OGPタグはコメント外に設定する
- 共通画像は `/assets/html-share-card-v1.png`（1200×630 PNG）
- 独自画像を使う場合は幅・高さ・MIME type・altも設定する

## Vulnerability report authoring

- `/vulnerabilities` の編集原本は `reports/vulnerabilities.source.html`。非配信の原本を更新し、既存HTMLカードと `vulnerability-report-data` JSONのID集合を一致させる。
- `public/vulnerabilities.html`、`public/assets/vulnerabilities/*.json`、`public/vulnerabilities/archive/*.html` は生成物で、直接更新しない。`node scripts/generate-index.mjs` が20件単位の軽量本文と静的な代替ページを生成する。
- 冒頭は既存の一覧優先順から短い3項目を生成し、元の確認ポイント全文を折りたたみに保持する。上部・下部のページ送りは同じ状態を使い、IDとaria-labelを分離する。JS無効/初期化失敗時は旧fragment一覧を開いたままにする。
- 全件検索索引は検索時のみ、本文JSONは該当ページ分だけ取得。旧 `/vulnerabilities#id`・検索/絞り込み・履歴・出典は維持する。JS無効/読込失敗時の全本文リンクも削らない。
- 通常/専用RSSは原本を読み、移行前の公開HTMLと新原本のGit履歴を連続して扱う。構造だけの変更を新しい脆弱性更新として配信しない。静的分割ページを通常RSSやトップ一覧に追加しない。
- 旧単体HTMLの未反映候補をそのまま公開ファイルへ上書きせず、最新原本に事実の差分だけを再baseして生成・テストする。

## Important

- `.git` やリポジトリ直下全体を Static Assets にしない
- Static Assets の対象は `./public` のみ
- 既存slugと衝突する場合は上書き前に内容を確認する

