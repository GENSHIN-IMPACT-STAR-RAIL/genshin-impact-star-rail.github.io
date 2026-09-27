import type { ReactNode, ComponentProps } from "react";
import {
  Field,
  NumberField as SharedNumberField,
  Notice,
  Result,
} from "../shared";
import { useStatisticsWorkspace } from "../workspace";
import { format } from "../math";
import type { CountEvent } from "./state";
export function NumberField(props: ComponentProps<typeof SharedNumberField>) {
  return <SharedNumberField min={-1e6} max={1e6} {...props} />;
}
export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: [T, string][];
}) {
  return (
    <Field label={label}>
      <select
        className="stats-input"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function TextInput({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        className="stats-textarea"
        maxLength={8000}
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
export function Check({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />{" "}
      {label}
    </label>
  );
}
export function Output({ children }: { children: () => ReactNode }) {
  try {
    return <>{children()}</>;
  } catch (error) {
    return (
      <Notice tone="warning">
        {error instanceof Error ? error.message : String(error)}
      </Notice>
    );
  }
}
export function Reveal({ children }: { children: ReactNode }) {
  const { resultsHidden } = useStatisticsWorkspace();
  return resultsHidden ? (
    <Notice>结果已隐藏，揭示后可查看推导数值。</Notice>
  ) : (
    <>{children}</>
  );
}
export function CountEventFields({
  event,
  low,
  high,
  change,
}: {
  event: CountEvent;
  low: number;
  high: number;
  change: (patch: { event?: CountEvent; low?: number; high?: number }) => void;
}) {
  return (
    <>
      <Select
        label="计数事件"
        value={event}
        onChange={(event) => change({ event })}
        options={[
          ["le", "X ≤ a"],
          ["lt", "X < a"],
          ["ge", "X ≥ a"],
          ["gt", "X > a"],
          ["equal", "X = a"],
          ["interval", "a ≤ X ≤ b"],
        ]}
      />
      <NumberField
        label="边界 a"
        value={low}
        onChange={(low) => change({ low })}
      />
      {event === "interval" && (
        <NumberField
          label="边界 b"
          value={high}
          onChange={(high) => change({ high })}
        />
      )}
    </>
  );
}
export function MomentResults({
  mean,
  variance,
  second,
}: {
  mean: number;
  variance: number;
  second?: number;
}) {
  return (
    <div className="stats-results">
      <Result label="E(X)" value={format(mean)} />
      <Result label="Var(X)" value={format(variance)} />
      {second !== undefined && <Result label="E(X²)" value={format(second)} />}
    </div>
  );
}
export function Button({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="stats-button"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
