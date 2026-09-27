import { useEffect, useState, type ReactNode } from 'react';
import { Field, Notice } from '../shared';
import { useStatisticsWorkspace } from '../workspace';
import type { Tail } from './state';
import './inference.css';

export function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  return <Field label={label}><select className="stats-input" value={value} onChange={e => onChange(e.target.value as T)}>{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>;
}
export function TailSelect({ value, onChange }: { value: Tail; onChange: (tail: Tail) => void }) { return <Select label="H₁ 的方向" value={value} onChange={onChange} options={[["upper", "大于（上尾）"], ["lower", "小于（下尾）"], ["two", "不等于（双尾）"]]} />; }
export function TextInput({ label, value, onChange, hint, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; hint?: string; rows?: number }) {
  const [draft, setDraft] = useState(value), [error, setError] = useState('');
  useEffect(() => { setDraft(value); setError(''); }, [value]);
  const commit = () => { if (draft === value) return; try { onChange(draft); setError(''); } catch (e) { setError(e instanceof Error ? e.message : '输入无效；尚未应用。'); } };
  return <div><Field label={label} hint={hint}><textarea className="stats-textarea" rows={rows} value={draft} aria-invalid={!!error} onChange={e => setDraft(e.target.value)} onBlur={commit} maxLength={6000} /></Field>{draft !== value && <button className="stats-button" type="button" onClick={commit}>应用输入</button>}{error && <Notice tone="warning">{error} 当前保留上次有效输入。</Notice>}</div>;
}
export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="inference-check"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /> {label}</label>; }
export function Reveal({ children }: { children: ReactNode }) { const { resultsHidden } = useStatisticsWorkspace(); return resultsHidden ? <Notice>教学结果已隐藏。先预测，再用工作台“显示结果”核对。</Notice> : <>{children}</>; }
export function SharedImport({ onLoad, paired = false, minimum = 2 }: { onLoad: (a: number[], b?: number[]) => void; paired?: boolean; minimum?: number }) {
  const { shared } = useStatisticsWorkspace(); const [error, setError] = useState('');
  const load = () => { try { if (!shared.sample || shared.sample.length < minimum || shared.sample.length > 200 || !shared.sample.every(x => Number.isFinite(x) && Math.abs(x) <= 1e9) || shared.secondSample && (shared.secondSample.length < minimum || shared.secondSample.length > 200 || !shared.secondSample.every(x => Number.isFinite(x) && Math.abs(x) <= 1e9))) throw new Error(`本工具支持每组 ${minimum}–200 个有限观测，绝对值不超过 10⁹。`); onLoad(shared.sample, shared.secondSample); setError(''); } catch (e) { setError(e instanceof Error ? e.message : '共享样本无法载入。'); } };
  return <div className="stats-stack"><button type="button" className="stats-button" disabled={!shared.sample} onClick={load}>载入共享样本{shared.label ? `：${shared.label}` : ''}</button>{paired && <small>逐项对应必须来自真实配对设计；导入后请核实顺序。</small>}{error && <Notice tone="warning">{error}</Notice>}</div>;
}
export const relation = (tail: Tail) => tail === 'upper' ? '>' : tail === 'lower' ? '<' : '≠';
export const f = (value: number | undefined, digits = 5) => value === undefined ? '—' : value === Infinity ? '∞' : value === -Infinity ? '−∞' : Number.isFinite(value) ? Number(value.toPrecision(digits)).toString() : '无定义';
