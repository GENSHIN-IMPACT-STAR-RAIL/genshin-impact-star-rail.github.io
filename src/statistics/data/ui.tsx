import type { ReactNode } from "react";
import { Field, Notice } from "../shared";
export const fmt = (n: number | null | undefined) =>
  n == null
    ? "未定义"
    : Number.isInteger(n) && Math.abs(n) < 1e10
      ? String(n)
      : Number(n.toPrecision(7)).toString();
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <Field label={label}>
      <select
        className="stats-input"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function attempt<T>(
  fn: () => T,
): { value: T; error: null } | { value: null; error: string } {
  try {
    return { value: fn(), error: null };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : String(e) };
  }
}
export function HiddenResults({
  hidden,
  children,
}: {
  hidden: boolean;
  children: ReactNode;
}) {
  return hidden ? (
    <Notice>结果已隐藏。先预测，再使用工作台的“显示结果”核对。</Notice>
  ) : (
    <>{children}</>
  );
}
