import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, useReducedMotion } from 'motion/react';
import { AnimateUIProvider } from '@animate-ui/react/provider';
import { Tabs, TabsList, TabsTrigger, TabsHighlight, TabsHighlightItem, TabsContents, TabsContent } from '@animate-ui/react/primitives/tabs';

const scenarios = [
  {
    value: 'rds',
    tab: 'RDS',
    caption: '同じ「RDS Protection」でも監視対象は異なる',
    title: 'ログイン監視とデータ操作監視を分ける',
    nodes: [
      {tag: '01 / DB', title: 'PostgreSQL', info: '保護対象とエンジン・バージョンを確認'},
      {tag: '02 / SIGNAL', title: '認証／操作', info: 'ログイン異常とデータ操作を別の観点で監視'},
      {tag: '03 / FINDING', title: 'GuardDuty', info: '検出タイプごとに根拠と対象を判断'},
      {tag: '04 / RESPONSE', title: '調査・封じ込め', info: '監査ログ、DB権限、影響データを照合'}
    ],
    note: 'RDS_DATA_RISK は追加の有効化条件・料金がある可能性。ログイン保護と混同せず、対象エンジン・リージョン・トライアル条件をAWS公式で照合。'
  },
  {
    value: 'rules',
    tab: 'Custom Rules',
    caption: '選択式ルールをいきなり本番有効化しない',
    title: 'Dry run から運用までの判断フロー',
    nodes: [
      {tag: '01 / SELECT', title: '対象ルール選択', info: '環境で意味のある追加ルールを選ぶ'},
      {tag: '02 / TRIAL', title: 'Dry run', info: '発火の傾向とノイズを確認（14日）'},
      {tag: '03 / REVIEW', title: '評価', info: '調査コスト、重要度、重複アラートを比較'},
      {tag: '04 / ENABLE', title: '段階的に適用', info: '誤検知時の扱いと通知経路を整える'}
    ],
    note: 'Custom Detection Rules は任意の独自クエリ言語ではなく、AWSが提供するオプショナルな検出ルールの選択。Dry run の終了期限を管理する。'
  },
  {
    value: 'incident',
    tab: '脅威調査',
    caption: '単発の通知から、攻撃の全体像へ',
    title: 'シグナルを相関させて優先順位を決める',
    nodes: [
      {tag: '01 / EVENTS', title: '複数の兆候', info: 'API、認証、ワークロード等の関連イベント'},
      {tag: '02 / CORRELATE', title: '攻撃シーケンス', info: '関連Finding・時間軸・リソースを照合'},
      {tag: '03 / INVESTIGATE', title: 'AI調査支援', info: '説明と推奨対応を、原ログで裏付け'},
      {tag: '04 / DECIDE', title: '対処優先度', info: '誤検知・影響範囲を人が判断'}
    ],
    note: '2026-10-12 の攻撃シーケンス記事は技術解説であり、その日に新しく提供が始まったという意味ではありません。AI調査の結果も一次ログで確認。'
  }
];

function Flow({ scenario }) {
  const reduce = useReducedMotion();
  return <div className="gd-flow" role="group" aria-label={scenario.title}>
    <div className="gd-flow-rail">
      {scenario.nodes.map((step, index) => <React.Fragment key={step.tag}>
        <motion.div className="gd-flow-node"
          initial={reduce ? false : {opacity: 0, y: 14}}
          whileInView={{opacity: 1, y: 0}}
          viewport={{once: true, amount: 0.25}}
          transition={reduce ? {duration: 0} : {duration: 0.38, delay: index * 0.08}}>
          <span className="gd-node-num">{step.tag}</span>
          <strong>{step.title}</strong>
          <span>{step.info}</span>
        </motion.div>
        {index < scenario.nodes.length - 1 && <span className="gd-flow-connector" aria-hidden="true">→</span>}
      </React.Fragment>)}
    </div>
    <p className="gd-note"><span aria-hidden="true">ⓘ</span> {scenario.note}</p>
  </div>;
}
function Visualizer() {
  useEffect(() => {
    const fallback = document.getElementById('flow-fallback');
    if (fallback) fallback.hidden = true;
  }, []);
  return <AnimateUIProvider tempo={0.85} reducedMotion="user">
    <Tabs defaultValue="rds" className="gd-tabs">
      <TabsHighlight className="gd-highlight">
        <TabsList className="gd-tablist" aria-label="検知フローの種類">
          {scenarios.map(s => <TabsHighlightItem key={s.value} value={s.value} className="gd-tabitem">
            <TabsTrigger className="gd-tab" value={s.value}>{s.tab}</TabsTrigger>
          </TabsHighlightItem>)}
        </TabsList>
      </TabsHighlight>
      <TabsContents className="gd-panels">
        {scenarios.map(s => <TabsContent key={s.value} value={s.value} className="gd-panel">
          <div className="gd-panel-heading"><span>{s.caption}</span><h3>{s.title}</h3></div>
          <Flow scenario={s} />
        </TabsContent>)}
      </TabsContents>
    </Tabs>
  </AnimateUIProvider>;
}
const host = document.getElementById('guardduty-motion-root');
if (host) createRoot(host).render(<Visualizer />);
