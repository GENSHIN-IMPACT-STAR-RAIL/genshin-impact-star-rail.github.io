import assert from "node:assert/strict";
import { test } from "node:test";
import { solveFirstOrder, traceIntegralCurve, integralCurveFamily, parseInitial } from "./ode.ts";
import type { View } from "./plot.ts";

const view: View = {x:0,y:0,scale:52};
const sample = (points: [number,number][], x: number) => {
  const nearest = points.reduce((a,b)=>Math.abs(b[0]-x)<Math.abs(a[0]-x)?b:a);
  return nearest[1];
};

test("linear solution and initial curve agree for y' + y = x", () => {
  const equation=solveFirstOrder("dy/dx + y = x");
  assert.equal(equation.kind,"linear");
  assert.match(equation.general,/e\^\{ x\}/);
  const points=traceIntegralCurve(equation,[0,1],view,800,600);
  assert.ok(Math.abs(sample(points,1)-2/Math.E)<0.025);
});

test("Bernoulli substitution and selected curve agree", () => {
  const equation=solveFirstOrder("dy/dx + y = x*y^2");
  assert.equal(equation.kind,"bernoulli");
  assert.match(equation.general,/y\^\{-1\}/);
  const points=traceIntegralCurve(equation,[0,1],view,800,600);
  assert.ok(Math.abs(sample(points,1)-0.5)<0.025);
});

test("separable equation retains both branches and singularity", () => {
  const equation=solveFirstOrder("dy/dx = 1/y");
  assert.equal(equation.kind,"separable");
  assert.ok(Number.isNaN(equation.slope(0,0)));
  const upper=traceIntegralCurve(equation,[0,1],view,800,600);
  assert.ok(upper.every(([,y])=>y>0));
  assert.ok(Math.abs(sample(upper,1)-Math.sqrt(3))<0.025);
  const lower=traceIntegralCurve(equation,[0,-1],view,800,600);
  assert.ok(lower.every(([,y])=>y<0));
});

test("reversed first order equation uses y as independent variable", () => {
  const equation=solveFirstOrder("dx/dy + x = y");
  assert.equal(equation.kind,"linear");
  assert.equal(equation.independent,"y");
  const points=traceIntegralCurve(equation,[0,0],view,800,600);
  const nearest=points.reduce((a,b)=>Math.abs(b[1]-1)<Math.abs(a[1]-1)?b:a);
  assert.ok(Math.abs(nearest[0]-1/Math.E)<0.025);
});

test("unsupported order and derivative degree are rejected", () => {
  assert.throws(()=>solveFirstOrder("dy/dx = x + a"),/暂不支持其他参数/);
  assert.throws(()=>solveFirstOrder("(dy/dx)^2 = x"),/一次式/);
});

test("source-domain holes and numeric initial expressions stay distinct", () => {
  const equation=solveFirstOrder("dy/dx = (x^2-1)/(x-1)");
  assert.ok(Number.isNaN(equation.slope(1,0)));
  assert.ok(Number.isFinite(equation.slope(0,0)));
  assert.ok(Math.abs(parseInitial("pi/2")-Math.PI/2)<1e-12);
  assert.equal(parseInitial("1/2"),0.5);
});

test("curve density fills view without unbounded work", () => {
  const equation=solveFirstOrder("dy/dx = x*y");
  const sparse=integralCurveFamily(equation,view,800,600,90);
  const dense=integralCurveFamily(equation,view,800,600,32);
  assert.ok(dense.length>sparse.length);
  assert.ok(dense.length<=75);
});

test("separation preserves equilibria omitted by division", () => {
  const equation=solveFirstOrder("dy/dx = x*(1-y^2)");
  assert.equal(equation.kind,"separable");
  assert.match(equation.general,/\\ln/);
  const family=integralCurveFamily(equation,view,800,600,58);
  const equilibria=family.filter(line=>line.length===2).map(line=>line[0][1]);
  assert.ok(equilibria.some(y=>Math.abs(y-1)<1e-8));
  assert.ok(equilibria.some(y=>Math.abs(y+1)<1e-8));
});
