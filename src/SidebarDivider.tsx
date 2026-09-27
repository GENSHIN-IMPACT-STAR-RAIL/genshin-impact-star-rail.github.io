import { useEffect, useRef, useState } from "react";

const MIN_WIDTH = 240,
  DEFAULT_WIDTH = 326;
export function SidebarDivider() {
  const ref = useRef<HTMLDivElement>(null);
  const preferred = useRef(DEFAULT_WIDTH);
  const drag = useRef<{ start: number; width: number } | null>(null);
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, max: 660 });
  const [active, setActive] = useState(false);
  const measure = () => {
    const main = ref.current?.parentElement;
    if (!main) return;
    const max = Math.max(
      MIN_WIDTH,
      Math.min(660, Math.floor(main.clientWidth - 310)),
    );
    const width = Math.max(MIN_WIDTH, Math.min(max, preferred.current));
    main.style.setProperty("--sidebar-width", `${width}px`);
    setSize((old) =>
      old.width === width && old.max === max ? old : { width, max },
    );
  };
  const change = (width: number) => {
    preferred.current = width;
    measure();
  };
  const stop = () => {
    drag.current = null;
    setActive(false);
  };
  useEffect(() => {
    const main = ref.current!.parentElement!;
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    measure();
    return () => {
      observer.disconnect();
      main.style.removeProperty("--sidebar-width");
    };
  }, []);
  useEffect(() => {
    document.body.classList.toggle("resizing-sidebar", active);
    return () => document.body.classList.remove("resizing-sidebar");
  }, [active]);
  return (
    <div
      ref={ref}
      className={`sidebar-divider${active ? " dragging" : ""}`}
      role="separator"
      aria-label="调整控制台宽度"
      aria-orientation="vertical"
      aria-controls="control-panel"
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={size.max}
      aria-valuenow={size.width}
      aria-valuetext={`${size.width} 像素`}
      tabIndex={0}
      title="左右拖动调整宽度；双击恢复默认"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { start: e.clientX, width: size.width };
        setActive(true);
      }}
      onPointerMove={(e) => {
        if (drag.current)
          change(
            Math.max(
              MIN_WIDTH,
              Math.min(
                size.max,
                drag.current.width + e.clientX - drag.current.start,
              ),
            ),
          );
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onDoubleClick={() => change(DEFAULT_WIDTH)}
      onKeyDown={(e) => {
        let width: number;
        if (e.key === "ArrowLeft") width = size.width - 16;
        else if (e.key === "ArrowRight") width = size.width + 16;
        else if (e.key === "Home") width = MIN_WIDTH;
        else if (e.key === "End") width = size.max;
        else return;
        e.preventDefault();
        change(Math.max(MIN_WIDTH, Math.min(size.max, width)));
      }}
    >
      <span aria-hidden="true" />
    </div>
  );
}
