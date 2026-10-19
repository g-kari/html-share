import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, useReducedMotion } from 'motion/react';
import { AnimateUIProvider } from '@animate-ui/react/provider';
import { Tabs, TabsList, TabsTrigger, TabsHighlight, TabsHighlightItem, TabsContents, TabsContent } from '@animate-ui/react/primitives/tabs';

const ICONS = Object.freeze({
  guardduty: '/assets/aws-icons/guardduty.svg',
  rds: '/assets/aws-icons/rds.svg',
  lambda: '/assets/aws-icons/lambda.svg',
  cloudtrail: '/assets/aws-icons/cloudtrail.svg',
  eventbridge: '/assets/aws-icons/eventbridge.svg',
  cloudwatch: '/assets/aws-icons/cloudwatch.svg',
  securityhub: '/assets/aws-icons/securityhub.svg',
  bedrock: '/assets/aws-icons/bedrock.svg',
  sagemaker: '/assets/aws-icons/sagemaker.svg',
  iam: '/assets/aws-icons/iam.svg',
});

const SOURCES = [
  { icon: 'rds', label: 'Amazon RDS', group: 'DATABASE' },
  { icon: 'lambda', label: 'AWS Lambda', group: 'COMPUTE' },
  { icon: 'cloudtrail', label: 'AWS CloudTrail', group: 'API ACTIVITY' },
  { icon: 'bedrock', label: 'Amazon Bedrock', group: 'AI WORKLOAD' },
];
const OUTPUTS = [
  { icon: 'eventbridge', label: 'EventBridge', group: 'OPTIONAL ROUTE' },
  { icon: 'securityhub', label: 'Security Hub', group: 'OPTIONAL INTEGRATION' },
  { icon: 'cloudwatch', label: 'CloudWatch', group: 'OBSERVABILITY' },
];

const SCENARIOS = [
  {
    value: 'rds',
    tab: '01 / RDS DATA',
    mission: 'OPERATION: DATA SHIELD',
    title: 'PostgreSQLの不審な操作をどう追うか',
    summary: 'ログイン試行の異常と、データ流出・破壊につながる操作は別の監視観点。保護範囲と料金条件も分けて確認。',
    status: 'DATA RISK / SIMULATED',
    steps: [
      {icon:'rds', number:'01', heading:'Amazon RDS', subtitle:'保護対象を特定', detail:'DBエンジン・バージョン・リージョン'},
      {icon:'rds', number:'02', heading:'認証・操作', subtitle:'異常な兆候を確認', detail:'ログインとデータ操作は別の検出面'},
      {icon:'guardduty', number:'03', heading:'GuardDuty', subtitle:'Findingを確認', detail:'対象リソースと検出根拠を追跡'},
      {icon:'eventbridge', number:'04', heading:'通知・調査', subtitle:'連携は任意設定', detail:'影響の確認と対応Runbook'}
    ],
    note:'RDS_DATA_RISK の対象条件・追加料金・無料トライアルは実環境と最新のAWS公式資料で確認。図の配線は概念図です。'
  },
  {
    value: 'rules',
    tab: '02 / CUSTOM RULES',
    mission: 'OPERATION: RULE FORGE',
    title: '追加ルールを段階的に有効化する',
    summary: '環境に意味のある検出を選び、Dry runの観測結果からノイズや運用費用を評価。',
    status: 'RULE CHECK / SIMULATED',
    steps: [
      {icon:'iam', number:'01', heading:'監視対象', subtitle:'AWSの操作や設定', detail:'必要な追加ルールを選択'},
      {icon:'guardduty', number:'02', heading:'GuardDuty', subtitle:'Custom Rules', detail:'提供された選択式ルールを使う'},
      {icon:'cloudwatch', number:'03', heading:'Dry run', subtitle:'メトリクスで検証', detail:'14日間の評価期間を管理'},
      {icon:'eventbridge', number:'04', heading:'段階的に適用', subtitle:'検出経路を整備', detail:'アラート・誤検知対応を検討'}
    ],
    note:'自由入力のSIEMクエリを実行する仕組みではありません。Dry runと本番検出は区別します。'
  },
  {
    value: 'incident',
    tab: '03 / THREAT CHAIN',
    mission: 'OPERATION: SIGNAL TRACE',
    title: '点のアラートから攻撃の連鎖を追う',
    summary: '関連するAWSイベント・Findingを時系列で並べ、AI調査の示唆を原ログで裏付けて対応を決定。',
    status: 'THREAT TRACE / SIMULATED',
    steps: [
      {icon:'cloudtrail', number:'01', heading:'CloudTrail等', subtitle:'関連する操作', detail:'複数ソースの兆候を収集'},
      {icon:'guardduty', number:'02', heading:'GuardDuty', subtitle:'攻撃シーケンス', detail:'単独Findingと関連付け'},
      {icon:'guardduty', number:'03', heading:'AI調査支援', subtitle:'根拠と推奨を読む', detail:'CloudTrail等の一次ログで検証'},
      {icon:'securityhub', number:'04', heading:'対応・連携', subtitle:'優先度を判断', detail:'Security Hub連携は任意の構成'}
    ],
    note:'攻撃シーケンスの解説記事公開日と機能公開日は異なります。AIの見解は根拠の代替にはなりません。'
  }
];

function AWSIcon({name, size='md', label=''}) {
  return <span className={'gd-service-icon gd-icon-' + size}>
    <img src={ICONS[name]} alt={label} width="72" height="72" loading="lazy" decoding="async" />
  </span>;
}

function Satellite({data, index, highlighted, direction}) {
  return <div className={'gd-satellite ' + (highlighted ? 'gd-satellite-highlight' : '')} style={{'--node-order': index}}>
    <AWSIcon name={data.icon} size="sm"/>
    <span className="gd-satellite-copy"><small>{data.group}</small><b>{data.label}</b></span>
    {highlighted && <span className="gd-satellite-beacon" aria-hidden="true" />}
  </div>;
}

function CommandMap({scenario, animate}) {
  const highlight = {
    rds: ['rds', 'eventbridge'],
    rules: ['cloudtrail', 'eventbridge', 'cloudwatch'],
    incident: ['cloudtrail', 'securityhub'],
  }[scenario.value] || [];
  return <div className={'gd-command-map ' + (animate ? 'gd-map-running' : 'gd-map-idle')} role="group" aria-label="AWS監視フローの模式図">
    <div className="gd-map-grid" aria-hidden="true"/>
    <div className="gd-map-column gd-map-sources">
      <span className="gd-map-caption">DATA SOURCES / 例</span>
      {SOURCES.map((d,i)=><Satellite key={d.icon} data={d} index={i} highlighted={highlight.includes(d.icon)} direction="in" />)}
    </div>
    <div className="gd-data-link gd-data-in" aria-hidden="true"><span className="gd-data-beam"/></div>
    <div className="gd-defense-core">
      <span className="gd-map-caption">DETECTION CORE</span>
      <div className="gd-core-orbit" aria-hidden="true"><i/><i/><i/></div>
      <div className="gd-core-emblem"><AWSIcon name="guardduty" size="xl" /></div>
      <b>Amazon GuardDuty</b>
      <small>THREAT DETECTION</small>
      <span className="gd-core-sim">SIMULATION / NOT LIVE</span>
    </div>
    <div className="gd-data-link gd-data-out" aria-hidden="true"><span className="gd-data-beam"/></div>
    <div className="gd-map-column gd-map-outputs">
      <span className="gd-map-caption">OPTIONAL DESTINATIONS</span>
      {OUTPUTS.map((d,i)=><Satellite key={d.icon} data={d} index={i} highlighted={highlight.includes(d.icon)} direction="out" />)}
    </div>
  </div>;
}

function MissionSteps({scenario, animate, replay}) {
  return <div className="gd-mission-steps" role="list" aria-label={scenario.title}>
    {scenario.steps.map((step,index)=><React.Fragment key={step.number}>
      <motion.div role="listitem" className="gd-mission-step" key={scenario.value+'-'+step.number+'-'+replay}
        initial={animate ? {opacity:0, scale:0.87, y:28, filter:'blur(8px)'} : false}
        animate={{opacity:1,scale:1,y:0,filter:'blur(0px)'}}
        transition={animate ? {type:'spring',stiffness:230,damping:23,delay:index*.2} : {duration:0}}>
        <span className="gd-mission-step-number">NODE {step.number}</span>
        <AWSIcon name={step.icon} />
        <strong>{step.heading}</strong>
        <span className="gd-mission-subtitle">{step.subtitle}</span>
        <span className="gd-mission-detail">{step.detail}</span>
      </motion.div>
      {index<scenario.steps.length-1 && <span className="gd-mission-arrow" aria-hidden="true"><i/></span>}
    </React.Fragment>)}
  </div>;
}

function MissionPanel({scenario, animate, replay}) {
  return <section className="gd-mission-panel" aria-label={scenario.title}>
    <div className="gd-mission-titleblock">
      <div><span className="gd-mission-code">{scenario.mission}</span><h3>{scenario.title}</h3><p>{scenario.summary}</p></div>
      <div className="gd-mission-status"><span className="gd-status-dot" aria-hidden="true"/>{scenario.status}</div>
    </div>
    <MissionSteps scenario={scenario} animate={animate} replay={replay} />
    <div className="gd-signal-meter" aria-label="図の再生進行を表すデモ演出">
      <span>SIGNAL TRACE</span>
      <span className="gd-meter-track"><motion.i key={scenario.value+'-'+replay+'-'+animate} initial={{scaleX:animate?0:1}} animate={{scaleX:1}} transition={{duration:animate?3:0,ease:'easeInOut'}} /></span>
      <span>VISUAL DEMO</span>
    </div>
    <p className="gd-mission-note"><b>解析メモ</b>{scenario.note}</p>
  </section>;
}

function Visualizer() {
  const reduced = useReducedMotion();
  const [fx, setFx] = useState(true);
  const [replay, setReplay] = useState(0);
  const [selected, setSelected] = useState('rds');
  const animate = fx && !reduced;
  const scenario = SCENARIOS.find(s=>s.value===selected)||SCENARIOS[0];

  useEffect(() => {
    document.body.classList.toggle('gd-effects-paused', !animate);
    return () => document.body.classList.remove('gd-effects-paused');
  }, [animate]);
  useEffect(() => {
    const fallback=document.getElementById('flow-fallback');
    if (fallback) fallback.hidden=true;
  }, []);

  return <AnimateUIProvider tempo={0.8} reducedMotion="user">
    <div className={'gd-command ' + (animate ? 'gd-command-animated' : 'gd-command-still')}>
      <div className="gd-command-head">
        <div className="gd-command-identity">
          <AWSIcon name="guardduty" size="sm"/>
          <div><span className="gd-command-eyebrow">AWS SECURITY / VISUAL BRIEFING</span><strong>GUARDDUTY COMMAND CENTER</strong></div>
        </div>
        <div className="gd-command-controls">
          <span className="gd-sim-label"><span/>デモ画面（実測値ではありません）</span>
          <button type="button" className="gd-command-button" onClick={()=>setReplay(x=>x+1)}>↻ 再演出</button>
          <button type="button" className="gd-command-button gd-fx-toggle" aria-pressed={fx} onClick={()=>setFx(x=>!x)}>
            演出 {fx?'ON':'OFF'}
          </button>
        </div>
      </div>
      <CommandMap scenario={scenario} animate={animate}/>
      <div className="gd-mission-console">
        <div className="gd-console-heading"><span>MISSION SELECT</span><span>3 SCENARIOS / TRAINING ONLY</span></div>
        <Tabs value={selected} onValueChange={value=>{setSelected(value);setReplay(x=>x+1)}} className="gd-tabs">
          <TabsHighlight className="gd-highlight">
            <TabsList className="gd-tablist" aria-label="ミッションの選択">
              {SCENARIOS.map(s=><TabsHighlightItem key={s.value} value={s.value} className="gd-tabitem">
                <TabsTrigger className="gd-tab" value={s.value}>{s.tab}</TabsTrigger>
              </TabsHighlightItem>)}
            </TabsList>
          </TabsHighlight>
          <TabsContents className="gd-panels">
            {SCENARIOS.map(s=><TabsContent key={s.value} value={s.value} className="gd-panel">
              <MissionPanel scenario={s} animate={animate} replay={replay} />
            </TabsContent>)}
          </TabsContents>
        </Tabs>
      </div>
      <p className="gd-command-disclaimer">ゲーム風の演出は説明用シミュレーションです。実際の攻撃、検知、スキャン、AWSアカウント接続を示していません。構成図のサービス連携は設計例で、設定済みを意味しません。</p>
    </div>
  </AnimateUIProvider>;
}
const mount=document.getElementById('guardduty-motion-root');
if(mount)createRoot(mount).render(<Visualizer/>);
