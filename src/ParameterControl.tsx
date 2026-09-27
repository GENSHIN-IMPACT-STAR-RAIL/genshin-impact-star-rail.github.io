import { useEffect, useState } from "react";

function readNumber(text: string) {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()))
    return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function ParameterControl({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  // Expand to accommodate typed values; do not move slider bounds under a drag.
  const [bounds, setBounds] = useState({
    min: Math.min(-5, Math.floor(value)),
    max: Math.max(5, Math.ceil(value)),
  });
  useEffect(() => {
    if (!editing) setDraft(String(value));
    setBounds((b) => ({
      min: Math.min(b.min, Math.floor(value)),
      max: Math.max(b.max, Math.ceil(value)),
    }));
  }, [value, editing]);
  const commit = () => {
    const n = readNumber(draft);
    if (n === null) {
      setDraft(String(value));
      setError("请输入有限数值；已保留上次有效值");
    } else {
      onChange(n);
      setDraft(String(n));
      setError("");
    }
    setEditing(false);
  };
  return (
    <div className="parameter">
      <div className="parameter-head">
        <label htmlFor={`param-${name}`}>{name}</label>
        <input
          className="parameter-value"
          aria-label={`参数 ${name} 数值`}
          aria-invalid={!!error}
          aria-describedby={error ? `param-error-${name}` : undefined}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onFocus={() => {
            setEditing(true);
            setError("");
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            setError("");
            const n = readNumber(e.target.value);
            if (n !== null) onChange(n);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      </div>
      <input
        id={`param-${name}`}
        aria-label={`参数 ${name}`}
        title={`范围 ${bounds.min} 至 ${bounds.max}`}
        type="range"
        min={bounds.min}
        max={bounds.max}
        step="any"
        value={value}
        onChange={(e) => {
          setError("");
          onChange(Number(Number(e.target.value).toPrecision(12)));
        }}
      />
      <div className="range-labels">
        <span>{bounds.min}</span>
        <span>{(bounds.min + bounds.max) / 2}</span>
        <span>{bounds.max}</span>
      </div>
      {error && (
        <div id={`param-error-${name}`} className="error" role="status">
          {error}
        </div>
      )}
    </div>
  );
}
