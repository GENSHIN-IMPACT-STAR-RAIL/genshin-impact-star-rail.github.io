/** One wordmark and label treatment for every exploration space. */
export function WorkspaceBrand({ label }: { label: string }) {
  return (
    <a
      className="mathroom-brand"
      href="/"
      aria-label={`${label} · 返回数学探索室首页`}
      title="返回数学探索室首页"
    >
      <span className="mathroom-mark" aria-hidden="true">
        m<span>·</span>
      </span>
      <span className="mathroom-wordmark">
        <strong>mathroom</strong>
        <small>{label}</small>
      </span>
    </a>
  );
}
