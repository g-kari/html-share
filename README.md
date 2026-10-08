# html-share

ChatGPT から生成した HTML を Cloudflare Workers Static Assets で共有するためのリポジトリです。

## Structure

- `public/index.html` - 自動生成されるトップページ / SPA fallback
- `public/feed.xml` - 自動生成されるRSS 2.0（新規公開・更新）
- `public/**/*.html` - 共有用HTML
- `reports/vulnerabilities.source.html` - 脆弱性レポートの編集原本（非配信）
- `scripts/split-vulnerabilities.mjs` - 原本から軽量トップ・20件単位の本文JSON・静的分割ページを生成
- `public/assets/vulnerabilities-view.js` - 全件検索・絞り込み・ページ送り・旧anchor解決
- `public/assets/vulnerabilities/*.json` / `public/vulnerabilities/archive/*.html` - 自動生成の本文・全件検索索引・JavaScript不要の分割ページ
- `scripts/generate-index.mjs` - HTML一覧・RSS・OGP・Twitterカードを生成
- `scripts/rss-feed.mjs` - RSS・購読リンク・コンテンツ更新日時の共通処理
- `scripts/report-feeds.mjs` - 脆弱性・漏洩レポートの実質的更新を独立項目で配信
- `public/vulnerabilities-feed.xml` / `public/security-incidents-feed.xml` - 自動生成される専用RSS
- `.report-feed-state.json` - 専用RSSの記録ハッシュ・更新履歴（配信対象外）
- `report-feed-corrections.json` - レビュー対象のRSS配信表示訂正。本文更新とは別で、配信対象外の原本
- `.feed-state.json` - 生成用の日時・内容ハッシュ（配信対象外）
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
7. RSSと全ページのRSS autodiscoveryリンクを生成
8. 差分がある場合だけ `github-actions[bot]` が生成物と日時状態をまとめて commit / push

生成処理は現在の `main` を読み直してから実行します。並行してページが更新された場合も、新しい本文を古い生成結果で上書きしません。PRではテストだけを実行し、`main` に書き込みません。

そのため `public/index.html`、`public/feed.xml`、専用RSS XML、`.feed-state.json`、`.report-feed-state.json` は手編集しません。

手元で再生成する場合（初回は `npm ci --ignore-scripts`）:

```sh
node scripts/generate-index.mjs
```

## RSS (new pages and updates)

購読URL: https://share.0g0.xyz/feed.xml

トップページにRSSの購読リンクを表示し、全ページの `<head>` に
`application/rss+xml` の autodiscoveryリンクを補完します。RSS 2.0の各項目は
公開ページのタイトル・説明・公開URLだけを含みます。本文・Git履歴・リポジトリ内の
非公開ファイルはフィードに入れません。トップページ自身は項目から除外します。

- ページの新規公開と、本文・タイトル・説明・スタイル等のソース変更を対象にします。
- 更新順に並び、項目の `pubDate` はそのページの最新の内容公開日時です。
- `dcterms:created` は最初の公開日時、`dcterms:modified` は最新の更新日時です。
- 公開URLを固定GUIDとして使い、更新しても同じ項目を更新します。更新の通知・既読扱いはRSSリーダーによって異なります。
- OGP/RSSの自動生成部分だけの変更、別のファイルの変更、ビルドの再実行では日時が変わりません。
- ファイルのmtimeや現在時刻は使いません。Gitの内容変更commit日時と保存済みの内容ハッシュを使います。
- 削除した公開ページはフィードからも除外します。
- `/feed.xml` はRSSのContent-Typeで配信し、キャッシュは5分です。

初期の既存ページの日時は公開ディレクトリへの追加・内容変更commitから復元しています。
GitHub Actionsは完全な履歴を取得し、現在の `main` からフィードと日時状態を再生成します。
Cloudflareのbuild hookも同じ処理を実行します。保存済み状態があれば、浅いcheckoutや
Gitを含まないソースコピーでも変更のないページの日時を維持できます。
新しいページや内容を変えたページは、再生成する前にcommitしてください。
ローカルのGitなしのソースコピーで試す場合だけ、再現可能な日時を
`SOURCE_DATE_EPOCH`（UNIX秒）で指定できます。日時が判断できない変更はビルドを失敗させ、
毎回新しい更新として誤配信しないようにします。

## Report update RSS

- 脆弱性: https://share.0g0.xyz/vulnerabilities-feed.xml
- 漏洩・セキュリティ事案: https://share.0g0.xyz/security-incidents-feed.xml

全体RSS `/feed.xml` の固定ページGUID・更新日時の仕様は変更しません。
専用RSSは各レポートのJSON registerと `changes` 更新履歴から、追加・訂正・重要な続報を
更新ごとの別項目として生成します。本文全体、非公開ファイル、Gitのcommit messageは配信しません。
トップページには3本の購読リンク、各レポートのheadには全体RSSと対応する専用RSSの
autodiscoveryを生成します。専用RSSにもRSS Content-Typeと5分キャッシュを設定します。

### RSS delivery corrections

初回の浅いWorkers checkoutで誤配信された2項目は、元のGUIDを使い、
「RSS初回配信訂正」と明示して訂正します。これは新しい脆弱性・実悪用・事件・被害の
確認ではありません。正しい履歴は2026-10-07 17:06:35 UTCのWorkers buildで復元しました。
訂正通知自体の作成日時は2026-10-07 17:18:29 UTCで、原本へ保存し再生成で動かしません。各レポートの実質更新25件・16件の元GUID・日時は
別に保存します。専用RSSの全項目数は配信訂正を含み、状態の `items` は実質更新のみです。
レビュー対象の `report-feed-corrections.json` から訂正を生成し、原本は配信しません。
同じ訂正を再生成しても重複せず、全体RSS `/feed.xml` やレポート本文・日時を変えません。

### Report authoring contract

実質的に `records` / `incidents` を変更するときは、同じ更新で `changes[].summary` に
何を追加・訂正したかを具体的に記録してください。履歴の先頭追加・末尾追加を両方扱います。
同じ概要文を使った別の実質的更新も、記録IDと変更前後の正規化ハッシュで別GUIDになります。
GUIDはテーマと実際の差分で決まり、配信済み履歴・GUID・元の掲載日時は保存します。
更新履歴が後から整理されても過去の配信項目は消えません。

- `checked_at` / `checked_at_utc` / `checked`、確認日時、`last_content_change`、派生fingerprint、`updated` / `latest_date` だけの変更、レコード・出典の並べ替え、
  OGP/RSS生成部分、スタイル、表示件数のみの訂正は新着にしません。
- 同じ実質的差分の再適用、履歴の重複追加や言い換えだけでも新着を重複生成しません。
- 事案履歴は `incident_ids` / `added_ids` / `updated_ids` のいずれかに対象IDを記録することを推奨します。
  古いID未記録の実質的履歴も扱います。UIのみの履歴は実質データの差分がないため新着にしません。明示的な非配信履歴には `rss: false` を使用できます。
- 履歴文の単独・一意に対応する訂正は、実質データが不変なら既存RSS項目の文言を訂正し、
  GUID・日時を維持します。複数の古い文言変更が曖昧なときは配信済み文言を保存します。
  内容の訂正には新しい具体的な更新概要を付けて、訂正の経緯を別項目で残してください。
- 保存済みデータから実質的な変更があるのに対応する新規・改訂概要がない場合、ビルドは
  レポート名と `changes[].summary` の修正案を含むエラーで停止します。データ変更を含まない別の後続commitで該当差分の
  概要を加えて安全に再実行してください（事案では該当差分の全対象IDも指定）。データを先に公開したcommitの元日時を維持して復元します。

実質データがGitのcommit済み内容と異なる場合は、状態を保存する前に停止します。
レポートと更新概要をcommitしてから再生成してください。保存したGit cursorより後の履歴は
途中で同じ内容に戻っていても最終commitまで調べ、更新と訂正の両方を維持します。

初回はGitの完全履歴を読み、各実質的差分が掲載されたcommitの実際の日時を復元します。
生成待ち中に複数の更新があった場合も、各commitの差分・概要・日時を個別に復元します。
日付はレポートの掲載日時で、脆弱性の公表日時や事件の発生日時ではありません。
保存済み状態はGitを含まないコピーでも日時とGUIDを維持します。Gitも状態もない初回の
ソースコピーでは更新履歴に明記された日付を使用し、日だけならJSTの開始時刻をRSS表現に
使ったことと「時刻は記録なし」を説明に明示します。現在時刻・mtimeで履歴を埋めません。
Gitも状態もない事案の初回backfillでは、UIのみの履歴との判別根拠がない対象ID未記録の
履歴を配信しません。完全履歴または保存済み状態を利用してください。
浅いGit checkoutでは、新規状態のbootstrapや保存状態と異なる実質データを配信しません。
初回やレポート更新直後のWorkers buildは、完全履歴を持つGitHub Actionsが正しい状態を
生成・commitするまで停止します。その生成commitからの次のbuildは保存済みGUID・日時を
そのまま使います。Gitなしのローカルexportと浅いCI checkoutは区別します。
通常の本番buildは保存状態を、GitHub Actionsは完全履歴と保存状態を使います。

生成物は `.report-feed-state.json` も含めて現在のmainからまとめてcommitします。
並行更新でpushに失敗したら、mainを再取得して再生成します。手作業で生成物を上書きしないでください。

## Lightweight vulnerability report

`/vulnerabilities` の公開URLと既存の各項目 `#id` は維持します。初期HTMLは対処優先度順の20件のみで、本文は20件単位の同一origin JSONに分割します。検索は従来の全カード本文・出典テキストを含む別の索引を初回の検索時だけ取得し、分野・悪用状況・深刻度・並べ方は小さいmanifestで全件を判定します。1ページ20件のDOMだけを維持し、本文chunkは必要な分だけ読み込んで再利用します。検索・ページ番号はURLに保存し、古い直接anchorとBack/Forwardも対象本文へ解決します。

JavaScript無効時は初期20件・全項目一覧と `/vulnerabilities/archive/page-N` の静的な分割ページから全本文・一次資料・確認範囲・更新履歴を読めます。読込失敗時は表示済み本文を残し、再試行と対象の静的ページへのリンクを表示します。各分割ページには固有canonical・通常/専用RSS discoveryを生成しますが、トップのページ一覧と全体RSSには独立の新ページとして載せません。

編集は `reports/vulnerabilities.source.html` にだけ行います。原本の既存HTMLカードとJSON `vulnerability-report-data` のID集合を一致させ、実質更新なら従来通り `changes[].summary` も同時に記録します。公開済みデータを追加・訂正する契約は変わりません。`public/vulnerabilities.html`、本文JSON、静的分割ページは手編集せず `npm run build` で生成します。原本はStatic Assetsに含めません。古い単体HTMLの更新候補は、現在の原本へ差分だけを再適用してから生成・テストしてください。

通常RSSのhash/日時判定・専用RSSの実質差分判定には編集原本を使用します。移行前の `public/vulnerabilities.html` と新しい原本の両Git履歴を一つの順序で調べ、旧GUIDと元の日時・配信履歴を保持します。原本をbyte-identicalで移すだけの構造変更や、表示chunkの再生成は新しい脆弱性の追加更新として配信しません。hash付きのJSONファイル名で世代を分離し、古いcacheと新しい本文の混在を防ぎます。通常RSSの他ページ・漏洩事案レポートの既存契約は維持します。

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
生成部分の外に書いた有効なOGP/Twitter/canonicalタグを優先するため、ページ単位のカスタマイズもできます。
空のタグは未設定として補完します。`template` 内のタグはメタデータとして使いません。
HTML文字参照の完全なデコードには、固定バージョンの `entities` をビルド時だけ使用します。
相対canonical・画像URLは、そのページの公開URLを基準に絶対URLへ変換します。
独自画像を指定するときは、その画像の `og:image:width`, `og:image:height`,
`og:image:type`, `og:image:alt` も指定してください。共通画像のサイズを独自画像へ流用しません。複数のOG画像を指定する場合は、各画像の直後にその画像の構造化メタデータを記載してください。

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

検証（Node.js 22以上）:

```sh
npm ci --ignore-scripts
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

