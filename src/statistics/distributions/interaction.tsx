import "./interaction.css";
export function MobilePaneSwitch({
  value,
  onChange,
}: {
  value: "input" | "results";
  onChange: (value: "input" | "results") => void;
}) {
  return (
    <div
      className="distributions-mobile-panes"
      role="group"
      aria-label="任务与结果视图"
    >
      <button
        type="button"
        className="stats-button"
        aria-pressed={value === "input"}
        onClick={() => onChange("input")}
      >
        任务输入
      </button>
      <button
        type="button"
        className="stats-button"
        aria-pressed={value === "results"}
        onClick={() => onChange("results")}
      >
        图形与结果
      </button>
    </div>
  );
}
