from pathlib import Path
p=Path('src/AnalysisTools.tsx')
s=p.read_text(encoding='utf-8-sig')
s=s.replace('"pick" | "tangent" | "integral" | "segment" | "region"','"pick" | "segment" | "region"')
s=s.replace('const [showTangent, setShowTangent] = useState(false);','const [tangentKeys, setTangentKeys] = useState<string[]>([]);\n    const [segmentSource, setSegmentSource] = useState<"intersections" | "points">("intersections");\n    const [candidates, setCandidates] = useState<Pick[]>([]);')
s=s.replace('      target,\n      scale:', '      scale:')
s=s.replace('open && (action === "segment" || action === "region") ? action : null,','open && (action === "region" || (action === "segment" && segmentSource === "intersections")) ? action : null,')
s=s.replace('curves.find((c) => c.key === target) ??','(action === "segment" && segmentSource === "points" ? curves.find((c) => c.key === target) : undefined) ??')
a=s.index('    const tangentResult = useMemo(');b=s.index('    const boundPoints =',a)
s=s[:a]+'''    const tangentResults = useMemo(() => (selected?.hits ?? []).map(h => {
      const c = curves.find(c => c.key === h.key)!;
      const result = tangent(c, h);
      const latex = result ? exactTangent(c, h, selected?.exactXY) : null;
      return { curve: c, result: result ? {...result, latex: latex ?? result.latex, exact: !!latex} : null };
    }), [curves, selected]);
    useEffect(() => { setTangentKeys([]); }, [selected?.id]);
    useEffect(() => { setCandidates([]); }, [xInput, yInput, uInput]);
''' +s[b:]
s=s.replace('?? boundPoints[1];','?? boundPoints.find(p => p.id !== lower?.id);')
s=s.replace('(!showIntegral && action !== "integral")','(action !== "segment" || segmentSource !== "points")')
s=s.replace('upperExact, showIntegral, action]);','upperExact, action, segmentSource]);')
s=s.replace('setShowTangent(false);','setTangentKeys([]);')
s=s.replace('      setPoints([]);\n      setHover(null);','      setPoints([]);\n      setCandidates([]);\n      setHover(null);')
s=s.replace('      const p = enrichExact(candidate, curves);','      const p = enrichExact(candidate, curves);\n      setCandidates([]);')
s=s.replace('if (action === "segment" || action === "region") return;','if (action === "region" || (action === "segment" && segmentSource === "intersections")) return;')
s=s.replace('snapPoint(meshes, world(x, y), view.scale, target)','snapPoint(meshes, world(x, y), view.scale)')
a=s.index('        if (parameter || (!yInput.trim()');b=s.index('        } else {\n          const exactXY',a)
s=s[:a]+'''        if (parameter || !yInput.trim()) {
          const exactU = exactInput(parameter ? uInput : xInput), u = exactU.value;
          const matches: Pick[] = [];
          for (const c of curves) {
            if (parameter ? c.kind !== "parametric" && c.kind !== "polar" : c.kind !== "explicit") continue;
            if (parameter && (u < c.range.start || u > c.range.end)) continue;
            const xy = c.at(u);
            if (!xy.every(Number.isFinite)) continue;
            const h = {key:c.key, xy, u, exactU};
            const same = matches.find(p => Math.hypot(p.xy[0]-xy[0],p.xy[1]-xy[1]) < 1e-9);
            if (same) {same.hits.push(h); same.kind="交点";}
            else matches.push({xy, exactXY: exactAt(c,exactU) ?? undefined, hits:[h],kind:"曲线上的点"});
          }
          if (!matches.length) throw new Error(parameter ? "此参数范围内没有已定义的曲线点" : "没有可用的显函数点，请填写完整坐标");
          if (matches.length === 1) add(matches[0]);
          else {setCandidates(matches.map(p=>enrichExact(p,curves)));setError("");}
''' +s[b:]
s=s.replace('        showIntegral &&\n        integral', '        open && action === "segment" && segmentSource === "points" && showIntegral &&\n        integral')
a=s.index('      if (showTangent && tangentResult && selected)');b=s.index('      const draw =',a)
s=s[:a]+'''      if (open && action === "pick" && selected) for (const {curve: c, result} of tangentResults) {
        if (!result || !tangentKeys.includes(c.key)) continue;
        const p = pixel(selected.xy), d = result.direction, length = Math.hypot(size.w,size.h)*2;
        ctx.strokeStyle=curveColor(c.color,theme); ctx.lineWidth=1.6;ctx.setLineDash([7,5]);
        ctx.beginPath();ctx.moveTo(p[0]-d[0]*length,p[1]+d[1]*length);ctx.lineTo(p[0]+d[0]*length,p[1]-d[1]*length);ctx.stroke();ctx.setLineDash([]);
      }
''' +s[b:]
s=s.replace('      showTangent,\n      tangentResult,','      tangentKeys,\n      tangentResults,\n      action,\n      segmentSource,')
a=s.index('                    <button\n                      aria-pressed={action === "tangent"}');b=s.index('                    {(["segment", "region"]',a)
s=s[:a]+s[b:]
s=s.replace('onClick={() => setAction("pick")}', 'onClick={() => { setAction("pick"); setHover(null); setError(""); }}')
a=s.index('                    <label className="analysis-field">\n                      曲线');b=s.index('                    {cuts.panel}',a)
s=s[:a]+'''                    {action === "segment" && <label className="analysis-field">
                      截取方式
                      <select aria-label="曲线段截取方式" value={segmentSource} onChange={e=>{setSegmentSource(e.target.value as "intersections" | "points");setHover(null);setError("");}}>
                        <option value="intersections">按交点截取</option><option value="points">用两点截取</option>
                      </select>
                    </label>}
''' +s[b:]
s=s.replace('靠近曲线吸附，点击取点。交点、驻点和轴交点优先。','点击曲线自动识别并取点，优先吸附交点、驻点和轴交点。取点后可查看坐标与切线。')
s=s.replace('curve?.kind === "explicit" ? "可留空" : "坐标"','curves.some(c => c.kind === "explicit") ? "可留空" : "坐标"')
s=s.replace('{curve?.kind === "explicit" && (','{curves.some(c => c.kind === "explicit") && (')
s=s.replace('y 留空时，在{curve.name}上按 x 取点。','y 留空时自动寻找各曲线上的点；若有多个位置，再选择要保留的点。')
s=s.replace('{(curve?.kind === "parametric" ||\n                          curve?.kind === "polar") && (','{curves.some(c => c.kind === "parametric" || c.kind === "polar") && (')
s=s.replace('{curve.kind === "polar" ? "θ（弧度）" : "t"}','{polar ? "θ（弧度）" : "t"}')
a=s.index('                    {!!points.length && (');s=s[:a]+'''                    {action === "pick" && !!candidates.length && <div className="analysis-candidates" aria-label="候选点">
                      <p className="analysis-hint">找到多个位置，选择一个点：</p>
                      {candidates.map((p,i)=><button key={i} onClick={()=>add(p)}>
                        <StaticMath value={`(${pointLatex(p,0)},\\;${pointLatex(p,1)})`}/>
                        <small>{p.hits.map(h=>curves.find(c=>c.key===h.key)?.name).join("、")}</small>
                      </button>)}
                    </div>}
''' +s[a:]
s=s.replace('                    {!!points.length && (','                    {action === "pick" && !!points.length && (')
s=s.replace('                    {selected &&\n                      hit?', '                    {action === "pick" && selected &&\n                      hit?')
a=s.index('                    {action === "tangent" && (');b=s.index('                    {action === "integral" && (',a)
s=s[:a]+'''                    {action === "pick" && selected && <section className="analysis-result point-analysis" aria-label="所选点分析">
                      <strong>P{selected.id} · 点分析</strong>
                      {!tangentResults.length && <p className="analysis-hint">此点为自由点，不在当前曲线上。</p>}
                      {tangentResults.map(({curve:c,result})=><div className="point-tangent" key={c.key}>
                        <p>{c.name} · 此点处的切线</p>
                        {result ? <>
                          <StaticMath value={result.exact ? result.latex : result.latex.replace("=", "\\\\approx ")}/>
                          <label><input type="checkbox" checked={tangentKeys.includes(c.key)} onChange={e=>setTangentKeys(keys=>e.target.checked ? [...keys,c.key] : keys.filter(k=>k!==c.key))}/>显示{c.name}的切线</label>
                          <small>{result.exact ? "精确值" : "数值近似"}</small>
                        </> : <p className="analysis-hint">此处没有唯一的切线，可能是尖点或奇点。</p>}
                      </div>)}
                      {selected.hits.some(h=>h.u!==undefined) && <button className="analysis-next" onClick={()=>{
                        setTarget(selected.hits.find(h=>h.u!==undefined)!.key);setLowerId(String(selected.id));setUpperId("");setSegmentSource("points");setAction("segment");setHover(null);setError("");
                      }}>以此点为起点截取曲线段</button>}
                    </section>}
''' +s[b:]
s=s.replace('                    {action === "integral" && (','                    {action === "segment" && segmentSource === "points" && (')
s=s.replace('''                      <div className="analysis-result">
                        {curve?.kind === "implicit"''','''                      <div className="analysis-result">
                        <p className="analysis-hint">在画布上点取同一曲线的两个点，或使用已有点。选定端点后显示定积分。</p>
                        <label className="analysis-field">截取曲线<select aria-label="两点截取曲线" value={curve?.key ?? ""} onChange={e=>{setTarget(e.target.value);setLowerId("");setUpperId("");setError("");}}>
                          {curves.filter(c=>c.kind!=="implicit").map(c=><option key={c.key} value={c.key}>{c.name}</option>)}
                        </select></label>
                        {curve?.kind === "implicit"''')
s=s.replace('                                下限\n','                                起点（下限）\n').replace('                                上限\n','                                终点（上限）\n')
s=s.replace('已取点会列在这里，可随时切换到切线或积分。','已取点会列在这里。选中一个点查看分析，或用它作为曲线段端点。')
p.write_text(s,encoding='utf-8')
# Boundary curve choice belongs to the cut tool, never to point acquisition.
p=Path('src/CutAnalysisTools.tsx');s=p.read_text(encoding='utf-8-sig');s=s.replace('  target: string;\n','').replace('  target,\n','');s=s.replace('  const explicit =', '  const [target, setTarget] = useState("");\n  const explicit =')
s=s.replace('''    <div className="analysis-result cut-analysis">
      <label''','''    <div className="analysis-result cut-analysis">
      <label className="analysis-field">边界曲线<select aria-label="第一条边界曲线" value={first?.key ?? ""} onChange={e=>setTarget(e.target.value)}>
        {explicit.map(c=><option key={c.key} value={c.key}>{c.name}</option>)}
      </select></label>
      <label''')
p.write_text(s,encoding='utf-8')
p=Path('src/App.tsx');s=p.read_text(encoding='utf-8-sig');s=s.replace('取点、曲线段与区域分析','图像分析').replace('取点分析','图像分析');s=s.replace('选择已取点可显示切线；在同一曲线上取两个点可选作积分上下限。','选中一个点即可查看各条经过它的曲线的切线；“取曲线段”中可按交点或用两点截取，再计算积分。');s=s.replace('“取曲线段”和“取区域”支持两条显函数：','“按交点截取”和“取区域”支持两条显函数：');p.write_text(s,encoding='utf-8')
p=Path('src/AnalysisTools.tsx');s=p.read_text(encoding='utf-8');s=s.replace('取点、曲线段与区域分析','图像分析').replace('启用取点与分析','启用图像分析');p.write_text(s,encoding='utf-8')
