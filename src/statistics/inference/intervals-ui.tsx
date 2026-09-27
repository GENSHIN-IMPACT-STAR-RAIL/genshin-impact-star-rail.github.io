import { useMemo } from 'react';
import { Panel, NumberField, Result, Notice, Formula, Plot } from '../shared';
import { useToolState } from '../workspace';
import { captured } from './common';
import { interval, invertInterval, minimumNormalSampleSize, minimumTSampleSize, normalCoverage } from './intervals';
import type { IntervalState } from './state';
import { Select, TextInput, Reveal, SharedImport, f } from './ui';

const conditions: Record<IntervalState['method'], string> = {
  known: '独立随机样本；总体正态，且总体 σ 已知。原样本输入时样本均值可继承，σ 仍由已知参数栏指定。',
  large: '独立大样本；用样本 s 估计总体 σ，依靠 CLT 近似。n≥30 不是所有偏斜总体的保证。',
  proportion: '独立 Bernoulli 试验；Wald 正态近似需要成功与失败次数均足够。',
  t: '独立随机样本来自正态总体，σ 未知；s² 的分母为 n−1。',
  paired: '逐项配对，统一用 A−B；差值总体正态，对差值作 t 区间。',
  pooled: '两个独立正态总体，有共同未知方差的条件；合并方差后用 t。',
  'independent-large': '两组独立大样本；两项 s²/n 相加，不要求共同方差。',
};

export function IntervalsTool() {
  const [s, set] = useToolState<IntervalState>('intervals'); const patch = (change: Partial<IntervalState>) => set(old => ({ ...old, ...change }));
  const calculated = captured(() => interval(s)), r = calculated.result;
  const two = ['paired', 'pooled', 'independent-large'].includes(s.method), raw = s.source === 'raw' || s.method === 'paired';
  const planning = captured(() => {
    if (!r) throw new Error('先完善区间输入。');
    const sd = s.method === 'proportion' ? Math.sqrt(r.center * (1 - r.center)) : s.method === 'pooled' ? Math.sqrt(2 * r.pooledVariance!) : s.method === 'independent-large' ? Math.hypot(r.first.sd, r.second.sd) : s.method === 'known' ? s.sd : r.first.sd;
    return r.df === undefined ? minimumNormalSampleSize(sd, s.level, s.targetWidth, s.method === 'known' ? 1 : 2) : minimumTSampleSize(sd, s.level, s.targetWidth, s.method === 'pooled');
  });
  const inverse = captured(() => invertInterval(s.inverseLow, s.inverseHigh, s.level, r?.se ?? 0, r?.df));
  const coverage = useMemo(() => normalCoverage(s.level, s.n, s.sd, s.coverageSeed), [s.level, s.n, s.sd, s.coverageSeed]);
  const range = Math.max(...coverage.flatMap(c => [Math.abs(c.low), Math.abs(c.high)]), 1e-6), x = (v: number) => 280 + v / range * 235;
  return <div className="inference-tool stats-stack"><div className="stats-grid"><Panel title="构造置信区间"><div className="stats-stack">
    <Select label="课程方法" value={s.method} onChange={method => patch({ method, n: Math.max(s.n, method === 'known' ? 1 : 2) })} options={[["known", "已知 σ：正态均值"], ["large", "大样本均值：近似 z"], ["proportion", "总体比例：Wald 近似"], ["t", "单样本 t"], ["paired", "配对差 t"], ["pooled", "独立均差 pooled t"], ["independent-large", "独立大样本均差"]]} />
    <Notice>{conditions[s.method]}</Notice>
    {s.method !== 'proportion' && s.method !== 'paired' && <Select label="数据来源" value={s.source} onChange={source => patch({ source })} options={[["summary", "汇总统计量"], ["raw", "原始样本"]]} />}
    {s.method !== 'proportion' && <SharedImport minimum={s.method === 'known' ? 1 : 2} paired={s.method === 'paired'} onLoad={(a, b) => patch({ source: 'raw', sample: a.join(', '), ...(b ? { sample2: b.join(', ') } : {}) })} />}
    {raw && s.method !== 'proportion' ? <><TextInput label="样本 A" value={s.sample} onChange={sample => patch({ sample })} />{two && <TextInput label="样本 B（配对时保持顺序）" value={s.sample2} onChange={sample2 => patch({ sample2 })} />}{s.method === 'known' && <NumberField label="已知总体 σ" value={s.sd} min={1e-8} max={1e8} onChange={sd => patch({ sd })} />}</> : <div className="stats-grid">
      <NumberField label="样本量 n" value={s.n} min={s.method === 'known' ? 1 : 2} max={1e6} step={1} onChange={n => patch({ n, successes: Math.min(s.successes, n) })} />
      {s.method === 'proportion' ? <NumberField label="成功次数" value={s.successes} min={0} max={s.n} step={1} onChange={successes => patch({ successes })} /> : <><NumberField label="样本均值 x̄" value={s.center} min={-1e9} max={1e9} onChange={center => patch({ center })} /><NumberField label={s.method === 'known' ? '已知总体 σ' : '样本标准差 s（n−1）'} value={s.sd} min={1e-8} max={1e8} onChange={sd => patch({ sd })} /></>}
      {two && <><NumberField label="第二组样本量 n₂" value={s.n2} min={2} max={1e6} step={1} onChange={n2 => patch({ n2 })} /><NumberField label="第二组均值" value={s.center2} min={-1e9} max={1e9} onChange={center2 => patch({ center2 })} /><NumberField label="第二组样本标准差 s₂" value={s.sd2} min={1e-8} max={1e8} onChange={sd2 => patch({ sd2 })} /></>}
    </div>}
    <NumberField label="置信水平（如 0.95）" value={s.level} min={.5} max={.9999} step={.01} onChange={level => patch({ level })} />
    <input aria-label="比较置信水平" type="range" min={.5} max={.999} step={.001} value={s.level} onChange={e => patch({ level: Number(e.target.value) })} />
  </div></Panel><Panel title="中心 ± 临界值 × 标准误"><Formula value="\widehat\theta\pm c\operatorname{SE}(\widehat\theta)" />
    {calculated.error && <Notice tone="warning">{calculated.error}</Notice>}{r && <div className="stats-stack"><div className="stats-results"><Result label="区间" value={`[${f(r.low)}, ${f(r.high)}]`} /><Result label="中心 / 标准误" value={`${f(r.center)} / ${f(r.se)}`} /><Result label={r.df === undefined ? '正态临界值' : `t 临界值，df=${r.df}`} value={f(r.critical)} /><Result label="半宽 / 全宽" value={`${f(r.halfWidth)} / ${f(r.width)}`} />{r.pooledVariance !== undefined && <Result label="合并方差 sₚ²" value={f(r.pooledVariance)} />}</div>
    <Reveal><Plot height={170} series={[{ kind: 'line', data: [{ x: r.low, y: 1 }, { x: r.high, y: 1 }], name: '置信区间' }, { kind: 'points', data: [{ x: r.center, y: 1 }], name: '点估计' }]} xDomain={[r.low - Math.max(r.width * .2, .01), r.high + Math.max(r.width * .2, .01)]} yDomain={[0, 2]} xLabel="目标参数 θ" markers={[{ x: r.low, label: f(r.low) }, { x: r.high, label: f(r.high) }]} /></Reveal>
    {r.warnings.map(w => <Notice key={w} tone="warning">{w}</Notice>)}<Notice>这是总体参数的区间，不是“95% 的个体位于区间内”。固定参数不会在本次区间内随机移动。</Notice></div>}
  </Panel></div>
  <div className="stats-grid"><Panel title="目标全宽 → 最小样本量"><div className="stats-stack"><NumberField label="目标全宽（不是半宽）" value={s.targetWidth} min={1e-8} max={1e9} onChange={targetWidth => patch({ targetWidth })} />
  <Notice>{two && s.method !== 'paired' ? '按两组等样本量规划，结果为每组 n；固定当前规划方差。' : s.method === 'proportion' ? '固定当前样本比例作为规划 p；保守规划可改用 p=0.5。' : '固定当前 σ 或 s 作为未来样本的规划标准差；未知方差不能保证实际样本区间一定这么宽。'} {s.method === 'known' ? '已知 σ 且总体正态时，合法下限为 n=1。' : '未知方差及其他近似方法的本工具下限为 n=2；近似适用性仍需另行核实。'}</Notice>
  {planning.error && <Notice tone="warning">{planning.error}</Notice>}{planning.result && <div className="stats-results"><Result label={two && s.method !== 'paired' ? '每组最小 n' : '最小 n'} value={planning.result.n} /><Result label="该 n 的全宽 ≤ 目标" value={f(planning.result.width)} /><Result label="相邻 n−1 的全宽" value={planning.result.previousWidth === undefined ? `已达到 n=${s.method === 'known' ? 1 : 2} 下限` : f(planning.result.previousWidth)} /></div>}</div></Panel>
  <Panel title="区间反求"><div className="stats-stack"><div className="stats-grid"><NumberField label="给定区间下限" value={s.inverseLow} min={-1e9} max={1e9} onChange={inverseLow => patch({ inverseLow })} /><NumberField label="给定区间上限" value={s.inverseHigh} min={-1e9} max={1e9} onChange={inverseHigh => patch({ inverseHigh })} /></div>{inverse.error && <Notice tone="warning">{inverse.error}</Notice>}{inverse.result && <div className="stats-results"><Result label="恢复区间中心" value={f(inverse.result.center)} /><Result label="按当前置信水平恢复 SE" value={f(inverse.result.inferredSe)} /><Result label="按当前 SE 反求置信度" value={`${f(100 * inverse.result.inferredLevel)}%`} />{!two && s.method !== 'proportion' && <Result label="由 SE 和当前 n 反求标准差" value={f(inverse.result.inferredSe * Math.sqrt(r?.first.n ?? s.n))} />}</div>}<Notice>反求保持当前分布和自由度。仅凭一条区间无法唯一恢复原始样本；均差中心也不能确定两组各自均值。</Notice></div></Panel></div>
  <Panel title="重复抽样：动的是区间，参数固定"><div className="stats-grid"><div className="stats-stack"><Notice>独立教学实验：总体 N(0,σ²)，σ 已知。每条区间来自一个新样本均值，竖线固定为 μ=0。绿色实线 ● 表示覆盖，红色虚线 × 表示未覆盖。固定随机种子时，可分别改变 n、σ、置信度比较。</Notice><div className="stats-grid"><NumberField label="覆盖实验 n" value={s.n} min={s.method === 'known' ? 1 : 2} max={1e6} step={1} onChange={n => patch({ n, successes: Math.min(n, s.successes) })} /><NumberField label="覆盖实验 σ" value={s.sd} min={1e-8} max={1e8} onChange={sd => patch({ sd })} /></div><button type="button" className="stats-button" onClick={() => patch({ coverageSeed: s.coverageSeed % 1000000000 + 1 })}>重新抽取 50 个区间</button><Result label="此次覆盖比例" value={`${coverage.filter(c => c.covers).length}/50`} note="有限次模拟不保证恰等于名义置信度。" /><Notice>同一样本构造的不同置信度区间的覆盖事件相互关联，不能把覆盖概率当作独立事件相乘。</Notice></div><Reveal><svg className="inference-svg" role="img" aria-label="50 个置信区间与固定参数零的覆盖图" viewBox="0 0 560 480"><line x1={280} x2={280} y1={20} y2={465} stroke="currentColor" strokeDasharray="4 4" /><text x={287} y={14}>固定 μ=0</text>{coverage.map((c, i) => <g key={i} stroke={c.covers ? 'var(--success)' : 'var(--danger)'}><line x1={x(c.low)} x2={x(c.high)} y1={27 + i * 8.5} y2={27 + i * 8.5} strokeWidth={2} strokeDasharray={c.covers ? undefined : '4 3'} />{c.covers ? <circle cx={x((c.low + c.high) / 2)} cy={27 + i * 8.5} r={2} fill="var(--success)" /> : <path d={`M${x((c.low + c.high) / 2) - 3},${24 + i * 8.5}l6,6m-6,0l6,-6`} />}</g>)}</svg></Reveal></div></Panel>
  </div>;
}
