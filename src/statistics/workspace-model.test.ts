import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialDocument,
  parseDocument,
  validShared,
  validDistribution,
} from "./workspace-model.ts";
import type { ToolSpec } from "./workspace-types.ts";
const tools = [
  {
    id: "data",
    title: "数据",
    initialState: { text: "1 2 3" },
    validate: (v: unknown) =>
      !!v &&
      typeof (v as { text: string }).text === "string" &&
      (v as { text: string }).text.length < 100,
  },
] as ToolSpec[];
test("workspace validation rejects unknown versions, invalid tools and forged values before replacing state", () => {
  const doc = initialDocument(tools);
  assert.deepEqual(parseDocument(JSON.stringify(doc), tools), doc);
  assert.throws(() =>
    parseDocument(JSON.stringify({ ...doc, version: 2 }), tools),
  );
  assert.throws(() =>
    parseDocument(
      JSON.stringify({ ...doc, states: { data: { text: 4 } } }),
      tools,
    ),
  );
  assert.throws(() =>
    parseDocument(
      JSON.stringify({ ...doc, states: { unexpected: {} } }),
      tools,
    ),
  );
  assert.throws(() =>
    parseDocument(
      JSON.stringify({ ...doc, shared: { sample: [null] } }),
      tools,
    ),
  );
  assert.throws(() => parseDocument("x".repeat(2000001), tools));
  assert.deepEqual(
    parseDocument(JSON.stringify({ ...doc, states: {} }), tools).states,
    doc.states,
  );
  assert.equal(
    parseDocument(
      JSON.stringify({ ...doc, display: { resultsHidden: true } }),
      tools,
    ).display?.resultsHidden,
    true,
  );
  assert.throws(() =>
    parseDocument(
      JSON.stringify({ ...doc, display: { resultsHidden: "yes" } }),
      tools,
    ),
  );
});
test("shared data validates domains, probabilities, design and complete samples", () => {
  assert.ok(
    validShared({
      sample: [1, 2, 3],
      design: "single",
      distribution: {
        kind: "finite",
        values: [1, 3],
        probabilities: [0.2, 0.8],
      },
    }),
  );
  assert.ok(
    !validDistribution({
      kind: "finite",
      values: [1, 3],
      probabilities: [0.2, 0.7],
    }),
  );
  assert.ok(!validDistribution({ kind: "normal", mean: 0, sd: 0 }));
  assert.ok(!validDistribution({ kind: "geometric", p: 0 }));
  assert.ok(validDistribution({kind:'binomial',n:0,p:.5}));
  assert.ok(!validShared({ sample: [], design: "single" }));
  assert.ok(!validShared({ sample: [1], design: "unknown" }));
});
