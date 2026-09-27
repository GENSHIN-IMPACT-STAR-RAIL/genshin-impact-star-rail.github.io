import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from "react";
import { initialDocument, parseDocument, validShared } from "./workspace-model";
import { readWorks, saveWork, type SavedWork } from "./workspace-storage";
import type {
  SharedData,
  StatisticsDocument,
  ToolSpec,
} from "./workspace-types";

type Context = {
  document: StatisticsDocument;
  tools: ToolSpec[];
  ready: boolean;
  storageStatus: string;
  shared: SharedData;
  share: (patch: Partial<SharedData>) => void;
  navigate: (id: string) => void;
  resultsHidden: boolean;
  setResultsHidden: (value: boolean) => void;
  setTool: <T>(id: string, action: SetStateAction<T>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  rename: (title: string) => void;
  importDocument: (raw: string) => void;
  resetTool: (id: string) => void;
  saveNamed: () => Promise<void>;
  savedWorks: SavedWork[];
  openWork: (id: string) => void;
};
const WorkspaceContext = createContext<Context | null>(null);
const FALLBACK = "mathroom-statistics-current-fallback";
export function StatisticsProvider({
  tools,
  children,
}: {
  tools: ToolSpec[];
  children: ReactNode;
}) {
  const [document, setDocument] = useState(() => initialDocument(tools));
  const [ready, setReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState("读取作品…");
  const [savedWorks, setSavedWorks] = useState<SavedWork[]>([]);
  const resultsHidden = document.display?.resultsHidden ?? false;
  const [past, setPast] = useState<StatisticsDocument[]>([]);
  const [future, setFuture] = useState<StatisticsDocument[]>([]);
  const live = useRef(document);
  live.current = document;
  const generation = useRef(0);
  const allowSave = useRef(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const works = await readWorks();
        if (!alive) return;
        setSavedWorks(
          works
            .filter((w) => w.id !== "current")
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        );
        const current = works.find((w) => w.id === "current");
        if (current) {
          try {
            setDocument(parseDocument(JSON.stringify(current.document), tools));
          } catch {
            const backup = {
              ...current,
              id: `recovery-${Date.now()}`,
              title: `恢复备份 · ${current.title || "未识别作品"}`,
            };
            try {
              await saveWork(backup);
              if (alive) setSavedWorks((old) => [backup, ...old]);
            } catch {
              allowSave.current = false;
            }
            if (alive) setStorageStatus("旧作品保留为备份，当前使用新草稿");
          }
        } else {
          const raw = localStorage.getItem(FALLBACK);
          if (raw) setDocument(parseDocument(raw, tools));
        }
        setStorageStatus("本机已保存");
      } catch {
        if (!alive) return;
        try {
          const raw = localStorage.getItem(FALLBACK);
          if (raw) setDocument(parseDocument(raw, tools));
          setStorageStatus("已恢复本机草稿");
        } catch {
          setStorageStatus("旧草稿未载入，可从 JSON 恢复");
        }
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tools]);
  useEffect(() => {
    if (!ready || !allowSave.current) return;
    const revision = ++generation.current;
    setStorageStatus("正在保存…");
    const timer = setTimeout(async () => {
      try {
        await saveWork({
          id: "current",
          title: document.title,
          updatedAt: new Date().toISOString(),
          document,
        });
        if (revision === generation.current) setStorageStatus("本机已保存");
      } catch {
        try {
          localStorage.setItem(FALLBACK, JSON.stringify(document));
          if (revision === generation.current) setStorageStatus("本机已保存");
        } catch {
          if (revision === generation.current)
            setStorageStatus("保存失败，请导出作品");
        }
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [document, ready]);
  const commit = (next: StatisticsDocument) => {
    const previous = live.current;
    live.current = next;
    setPast((old) => [...old.slice(-29), previous]);
    setFuture([]);
    setDocument(next);
  };
  const value: Context = {
    document,
    tools,
    ready,
    storageStatus,
    shared: document.shared,
    resultsHidden,
    setResultsHidden: (value) => {
      const next = { ...live.current, display: { resultsHidden: value } };
      live.current = next;
      setDocument(next);
    },
    setTool: <T,>(id: string, action: SetStateAction<T>) => {
      const spec = tools.find((t) => t.id === id);
      if (!spec) return;
      const old = live.current.states[id] as T;
      const next =
        typeof action === "function" ? (action as (old: T) => T)(old) : action;
      if (!spec.validate(next)) throw new Error(`“${spec.title}”输入超出范围`);
      commit({
        ...live.current,
        states: { ...live.current.states, [id]: next },
      });
    },
    share: (patch) => {
      const merged = { ...live.current.shared, ...patch };
      if (patch.sample && !patch.secondSample) {
        delete merged.secondSample;
        merged.design = patch.design ?? "single";
      }
      if (!validShared(merged)) throw new Error("共享数据超出支持范围");
      commit({ ...live.current, shared: merged });
    },
    navigate: (id) => {
      if (tools.some((t) => t.id === id) || id === "binomial-demo")
        setDocument((old) => ({ ...old, activeTool: id }));
    },
    undo: () => {
      if (!past.length) return;
      setFuture((old) => [live.current, ...old]);
      setDocument(past[past.length - 1]);
      setPast((old) => old.slice(0, -1));
    },
    redo: () => {
      if (!future.length) return;
      setPast((old) => [...old, live.current]);
      setDocument(future[0]);
      setFuture((old) => old.slice(1));
    },
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    rename: (title) =>
      setDocument((old) => ({ ...old, title: title.slice(0, 80) })),
    importDocument: (raw) => commit(parseDocument(raw, tools)),
    resetTool: (id) => {
      const spec = tools.find((t) => t.id === id);
      if (spec)
        commit({
          ...live.current,
          states: {
            ...live.current.states,
            [id]: structuredClone(spec.initialState),
          },
        });
    },
    saveNamed: async () => {
      const work = {
        id: crypto.randomUUID(),
        title: live.current.title,
        updatedAt: new Date().toISOString(),
        document: structuredClone(live.current),
      };
      await saveWork(work);
      setSavedWorks((old) => [work, ...old]);
    },
    savedWorks,
    openWork: (id) => {
      const work = savedWorks.find((w) => w.id === id);
      if (work) commit(parseDocument(JSON.stringify(work.document), tools));
    },
  };
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useStatisticsWorkspace(): Context {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("统计工作台尚未初始化");
  return context;
}
export function useToolState<T>(
  id: string,
): [T, (action: SetStateAction<T>) => void] {
  const workspace = useStatisticsWorkspace();
  return [
    workspace.document.states[id] as T,
    (action) => workspace.setTool(id, action),
  ];
}
