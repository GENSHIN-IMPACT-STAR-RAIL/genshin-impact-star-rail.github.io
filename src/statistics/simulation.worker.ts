import { simulate, type SimulationConfig } from "./sampling-model";
self.onmessage = (event: MessageEvent<SimulationConfig>) => {
  try {
    const result = simulate(event.data, (done, values) =>
      self.postMessage({ type: "progress", done, statistics: values }),
    );
    self.postMessage({ type: "done", result });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "模拟失败",
    });
  }
};
