import test from "node:test";
import assert from "node:assert/strict";
import {
  bagOutcomes,
  choose,
  countModel,
  dataModel,
  decodeMoments,
  eventSummary,
  equalWidthGroups,
  groupedQuantile,
  mergeMoments,
  multisetSelections,
  memberIds,
  numericList,
  parseFrequency,
  parseGroups,
  parseOutcomes,
  probabilityModel,
  rawFrequency,
  rthSuccessProbability,
  sourcePrior,
  summaryMoments,
  weightedMoments,
  weightedQuantile,
} from "./model.ts";
import {
  countingInitial,
  dataInitial,
  probabilityInitial,
  validateCounting,
  validateData,
  validateProbability,
} from "./state.ts";

const close = (actual: number, expected: number, tolerance = 1e-10) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} differs from ${expected}`,
  );

test("raw and frequency data agree; denominator n and n-1 stay separate", () => {
  const raw = weightedMoments(rawFrequency([2, 3, 3, 5, 6, 8, 9, 12])),
    freq = weightedMoments(parseFrequency(dataInitial.frequency));
  assert.deepEqual(raw, freq);
  assert.equal(raw.n, 8);
  assert.equal(raw.sum, 48);
  assert.equal(raw.sumSquares, 372);
  assert.equal(raw.mean, 6);
  assert.equal(raw.variance, 10.5);
  assert.equal(raw.unbiased, 12);
  assert.equal(weightedMoments(rawFrequency([3])).unbiased, null);
});
test("weighted accumulation avoids subtracting near-equal huge raw moments", () => {
  const m = weightedMoments(rawFrequency([1e9 + 1, 1e9 + 2, 1e9 + 3]));
  close(m.variance, 2 / 3);
  close(m.unbiased!, 1);
});
test("grouped data preserve unequal widths and interpolate rather than invent raw values", () => {
  const groups = parseGroups("0 5 3\n5 10 4\n10 20 1"),
    m = dataModel({ ...dataInitial, mode: "grouped" });
  close(groupedQuantile(groups, 0.5), 6.25);
  assert.equal(m.values, null);
  assert.equal(m.raw, null);
  close(m.moments.mean, 6.5625);
  const heights = groups.map((g) => g.f / (g.high - g.low));
  close(
    heights.reduce(
      (sum, h, i) => sum + h * (groups[i].high - groups[i].low),
      0,
    ),
    8,
  );
  assert.throws(() => parseGroups("0 10 3\n5 12 2"), /重叠/);
  assert.throws(() => parseGroups("2 2 1"), /大于/);
  assert.throws(
    () =>
      dataModel({
        ...dataInitial,
        mode: "grouped",
        coded: true,
        codeA: 1e6,
        codeB: 1e-30,
      }),
    /浮点精度/,
  );
});
test("linked automatic histogram conserves frequency and includes the final endpoint", () => {
  assert.deepEqual(equalWidthGroups(rawFrequency([0, 1, 2, 3, 4]), 2), [
    { low: 0, high: 2, f: 2 },
    { low: 2, high: 4, f: 3 },
  ]);
  const equal = equalWidthGroups(rawFrequency([1e18, 1e18]), 5);
  assert.ok(equal[0].high > equal[0].low);
  assert.equal(equal[0].f, 2);
  const closeBounds = equalWidthGroups(rawFrequency([1e12, 1e12 + 0.001]), 30);
  assert.ok(closeBounds.every((g) => g.high > g.low));
  assert.equal(
    closeBounds.reduce((a, b) => a + b.f, 0),
    2,
  );
});
test("quantile conventions are explicit including one-item and repeated-frequency cases", () => {
  const table = rawFrequency([1, 2, 3, 4, 5, 6, 7, 8]);
  close(weightedQuantile(table, 0.25, "position"), 2.25);
  close(weightedQuantile(table, 0.25, "halves"), 2.5);
  assert.equal(weightedQuantile(rawFrequency([4]), 0.75, "halves"), 4);
  assert.equal(weightedQuantile(parseFrequency("1 2\n4 2"), 0.5), 2.5);
  const g = parseGroups("0 2 0\n2 4 3\n4 6 0");
  assert.equal(groupedQuantile(g, 0), 2);
  assert.equal(groupedQuantile(g, 1), 4);
});
test("negative coding reverses ordering, retains variance scaling and restores moments", () => {
  const source = weightedMoments(rawFrequency([1, 2, 4]));
  const decoded = decodeMoments(source, 10, -2),
    direct = weightedMoments(rawFrequency([8, 6, 2]));
  close(decoded.mean, direct.mean);
  close(decoded.variance, direct.variance);
  close(decoded.unbiased!, direct.unbiased!);
  close(decoded.sumSquares, 104);
  assert.equal(decoded.minimum, 2);
  assert.equal(decoded.maximum, 8);
  const m = dataModel({
    ...dataInitial,
    raw: "1 2 4",
    coded: true,
    codeA: 10,
    codeB: -2,
  });
  assert.equal(m.quantile(0.5), 6);
  assert.deepEqual(m.values, [8, 6, 2]);
  assert.throws(() => decodeMoments(source, 1, 0), /≠ 0/);
});
test("summary correction identities and pooled moments include between-group variation", () => {
  const old = summaryMoments(3, 6, 14),
    corrected = summaryMoments(3, old.sum + 5 - 3, old.sumSquares + 25 - 9);
  close(corrected.mean, 8 / 3);
  close(corrected.variance, 26 / 9);
  const a = weightedMoments(rawFrequency([1, 1])),
    b = weightedMoments(rawFrequency([5, 5]));
  assert.equal(a.sd, 0);
  assert.equal(b.sd, 0);
  assert.equal(mergeMoments(a, b).sd, 2);
  assert.throws(() => summaryMoments(2, 10, 1), /不一致/);
  assert.throws(() => numericList("  "), /空白/);
  assert.throws(() => parseFrequency("1 2\n2 -1"), /频数/);
  assert.throws(() => parseFrequency("1"), /2 列/);
});
test("counting classroom anchors and exact BigInt arithmetic", () => {
  assert.equal(
    countModel({
      ...countingInitial,
      template: "groups",
      groups: "2,2",
      named: false,
    }).count,
    3n,
  );
  assert.equal(
    countModel({
      ...countingInitial,
      template: "groups",
      groups: "2,2",
      named: true,
    }).count,
    6n,
  );
  assert.equal(
    countModel({
      ...countingInitial,
      template: "groups",
      groups: "1,1,2",
      named: false,
    }).count,
    6n,
  );
  assert.equal(
    countModel({
      ...countingInitial,
      template: "groups",
      groups: "1,2",
      named: false,
    }).count,
    3n,
  );
  assert.equal(
    countModel({
      ...countingInitial,
      template: "repeated",
      repeated: "2,2,1",
      distinguish: false,
    }).count,
    30n,
  );
  assert.equal(
    countModel({
      ...countingInitial,
      template: "repeated",
      repeated: "2,2,1",
      distinguish: true,
    }).count,
    120n,
  );
  assert.equal(choose(100, 50), 100891344545564193334812497256n);
});
test("small exhaustive result counts independently check every permutation constraint", () => {
  for (const n of [2, 3, 4, 5, 6])
    for (const template of [
      "permutation",
      "adjacent",
      "nonadjacent",
      "notall",
      "endpoint",
      "distance",
    ] as const) {
      const r = countModel({
        ...countingInitial,
        n,
        r: Math.min(3, n),
        k: Math.min(2, n),
        distance: 2,
        template,
      });
      assert.equal(r.count, BigInt(r.previewTotal!), `${template} n=${n}`);
    }
  assert.equal(
    countModel({ ...countingInitial, template: "endpoint", n: 1 }).count,
    1n,
  );
  assert.equal(
    countModel({ ...countingInitial, template: "nonadjacent", n: 4, k: 3 })
      .count,
    0n,
  );
});
test("quota combinations respect mandatory/excluded groups and class bounds", () => {
  const r = countModel({
    ...countingInitial,
    template: "selection",
    n: 8,
    r: 4,
    required: 1,
    excluded: 1,
    quotaSize: 3,
    quotaMin: 1,
    quotaMax: 2,
  });
  assert.equal(r.count, 18n);
  assert.equal(BigInt(r.previewTotal!), r.count);
  assert.equal(
    countModel({
      ...countingInitial,
      template: "selection",
      n: 8,
      r: 1,
      required: 2,
      excluded: 0,
      quotaSize: 2,
      quotaMin: 0,
      quotaMax: 2,
    }).count,
    0n,
  );
  assert.throws(
    () =>
      countModel({
        ...countingInitial,
        template: "selection",
        n: 2,
        required: 2,
        excluded: 1,
      }),
    /不相容/,
  );
});
test("multiset unordered choices differ from labelled entities and match quantity-vector enumeration", () => {
  assert.equal(multisetSelections([2, 2, 1], 2), 5n);
  assert.equal(multisetSelections([2, 2, 1], 0), 1n);
  assert.equal(multisetSelections([2, 2, 1], 6), 0n);
  for (const r of [0, 1, 2, 3, 4, 5]) {
    const result = countModel({
      ...countingInitial,
      template: "multiset",
      repeated: "2,2,1",
      r,
      distinguish: false,
    });
    assert.equal(result.count, BigInt(result.previewTotal!));
  }
  assert.equal(
    countModel({
      ...countingInitial,
      template: "multiset",
      repeated: "2,2,1",
      r: 2,
      distinguish: true,
    }).count,
    10n,
  );
});
test("named mandatory, excluded and quota members are enforced in each displayed selection", () => {
  const result = countModel({
    ...countingInitial,
    template: "selection",
    n: 6,
    r: 3,
    requiredMembers: "C",
    excludedMembers: "A",
    quotaMembers: "B,D",
    quotaMin: 1,
    quotaMax: 1,
  });
  assert.equal(result.count, 4n);
  assert.equal(result.previewTotal, 4);
  for (const p of result.preview) {
    const members = p.split(" ");
    assert.ok(members.includes("C"));
    assert.ok(!members.includes("A"));
    assert.equal(
      Number(members.includes("B")) + Number(members.includes("D")),
      1,
    );
  }
  assert.throws(
    () =>
      countModel({
        ...countingInitial,
        template: "selection",
        requiredMembers: "C",
        excludedMembers: "C",
      }),
    /不相容/,
  );
  assert.throws(() => memberIds("A,A", 6), /重复/);
  assert.throws(() => memberIds("Z", 6), /不在/);
});
test("weighted conditional probability changes denominator when direction switches", () => {
  const outcomes = parseOutcomes(probabilityInitial.outcomes),
    ab = eventSummary(outcomes, "A|B"),
    ba = eventSummary(outcomes, "B|A");
  close(ab.a, 0.5);
  close(ab.b, 0.3);
  close(ab.intersection, 0.2);
  close(ab.conditional!, 2 / 3);
  close(ba.conditional!, 0.4);
  assert.equal(ab.independent, false);
  const zero = eventSummary(
    [{ label: "唯一", p: 1, A: true, B: false }],
    "A|B",
  );
  assert.equal(zero.conditional, null);
  assert.equal(zero.independent, true);
  assert.equal(zero.exclusive, true);
  assert.throws(
    () => eventSummary(parseOutcomes("甲 .2 1 1\n乙 .3 0 0"), "A|B"),
    /总和/,
  );
  assert.throws(() => parseOutcomes("甲 .5 2 1"), /标记/);
});
test("tiny positive shared probability is neither zero nor approximately independent", () => {
  const model = eventSummary(
    [
      { label: "稀有交集", p: 1e-14, A: true, B: true },
      { label: "外部", p: 1 - 1e-14, A: false, B: false },
    ],
    "A|B",
  );
  assert.equal(model.exclusive, false);
  assert.equal(model.independent, false);
  assert.equal(model.conditional, 1);
});
test("without-replacement branches update stocks and give 3/10 for two reds", () => {
  const outcomes = bagOutcomes(3, 2, 2, "no", "fixed");
  close(outcomes.find((o) => o.label === "红→红")!.p, 3 / 10);
  close(outcomes.find((o) => o.label === "蓝→蓝")!.p, 1 / 10);
  close(
    outcomes.reduce((s, o) => s + o.p, 0),
    1,
  );
  close(eventSummary(outcomes, "A|B").a, 0.9);
  assert.equal(outcomes.length, 4);
});
test("stopping leaves do not grow again and empty bags stop before requested length", () => {
  for (const replacement of ["no", "yes", "red-only"] as const)
    for (const stop of ["fixed", "first-red", "second-red"] as const) {
      const outcomes = bagOutcomes(2, 2, 6, replacement, stop);
      close(
        outcomes.reduce((s, o) => s + o.p, 0),
        1,
      );
      for (const o of outcomes) {
        const path = o.path!;
        if (stop === "first-red")
          assert.equal(
            path.slice(0, -1).some((x) => x.label === "红"),
            false,
          );
        if (stop === "second-red")
          assert.ok(
            path.slice(0, -1).filter((x) => x.label === "红").length < 2,
          );
        if (replacement === "no") assert.ok(path.length <= 4);
      }
    }
  assert.deepEqual(
    bagOutcomes(0, 2, 10, "red-only", "first-red").map((o) => [o.label, o.p]),
    [["蓝→蓝", 1]],
  );
  assert.throws(() => bagOutcomes(0, 0, 2, "no", "fixed"), /总数/);
});
test("source inverse distinguishes unique, impossible, and unidentified cases", () => {
  close(sourcePrior(0.5, 0.8, 0.2)!, 0.5);
  assert.equal(sourcePrior(0.3, 0.3, 0.3), null);
  assert.throws(() => sourcePrior(0.7, 0.3, 0.3), /无解/);
  assert.throws(() => sourcePrior(0.9, 0.8, 0.2), /无解/);
  const model = probabilityModel({
    ...probabilityInitial,
    template: "source",
    sourceP: 0.3,
    sourceA: 0.8,
    sourceB: 0.2,
  });
  close(eventSummary(model.outcomes, "B|A").conditional!, 12 / 19);
});
test("rth-success formula handles boundary probabilities and unsupported k < r", () => {
  close(rthSuccessProbability(0.5, 2, 4), 3 / 16);
  assert.equal(rthSuccessProbability(1, 3, 3), 1);
  assert.equal(rthSuccessProbability(1, 3, 4), 0);
  assert.equal(rthSuccessProbability(0, 1, 1), 0);
  assert.throws(() => rthSuccessProbability(0.5, 3, 2), /要求/);
});
test("saved tool states reject malformed JSON shapes, non-finite values and invalid enums", () => {
  assert.ok(validateData(dataInitial));
  assert.ok(validateCounting(countingInitial));
  assert.ok(validateProbability(probabilityInitial));
  assert.equal(validateData({ ...dataInitial, codeB: 0 }), false);
  assert.equal(validateData({ ...dataInitial, observationIds: [1, 1] }), false);
  assert.equal(validateData({ ...dataInitial, raw: [] }), false);
  assert.equal(validateData({ ...dataInitial, extra: true }), false);
  assert.equal(validateCounting({ ...countingInitial, n: NaN }), false);
  assert.equal(validateCounting({ ...countingInitial, n: 101 }), false);
  assert.equal(
    validateCounting({ ...countingInitial, template: "circular" }),
    false,
  );
  assert.equal(validateProbability({ ...probabilityInitial, red: -1 }), false);
  assert.equal(
    validateProbability({ ...probabilityInitial, successP: Infinity }),
    false,
  );
  assert.equal(
    validateProbability({ ...probabilityInitial, direction: "A and B" }),
    false,
  );
});
