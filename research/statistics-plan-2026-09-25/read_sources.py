"""Read-only source inventory and family-to-workbench traceability for the design.

Run with Python 3. No source worksheet or classification file is modified.
Counts describe local question identities, not unique problems or exam frequency.
"""
from pathlib import Path
from collections import Counter
import hashlib
import json

BASE = Path(r"E:\国际学校数学\【】山实剑桥PPT\导学案")
PROJECT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent

TOOLS = {
    "T01": "数据与统计图", "T02": "计数与排列组合", "T03": "样本空间与条件概率",
    "T04": "离散随机变量、二项与几何", "T05": "正态、反求与近似",
    "T06": "泊松过程与计数", "T07": "随机变量变换与组合", "T08": "PDF、CDF与连续变量变换",
    "T09": "PGF与卷积", "T10": "抽样、估计量与CLT", "T11": "置信区间",
    "T12": "假设检验、临界域与两类错误", "T13": "正态与t均值推断",
    "T14": "卡方检验", "T15": "符号与Wilcoxon检验", "T16": "历史相关回归（后置拓展）",
}

def route(module, code):
    p = code[0]
    if module == "S1":
        d = {"D": ["T01"], "C": ["T02"], "P": ["T03"], "R": ["T04"],
             "B": ["T04"], "G": ["T04"], "N": ["T05"]}
        extras = {"C08": ["T03"], "P07": ["T04"], "R04": ["T07"], "B04": ["T03", "T05"]}
        return d[p] + extras.get(code, [])
    if module == "S2":
        d = {"P": ["T06"], "L": ["T07"], "D": ["T08"], "S": ["T10"], "C": ["T11"], "T": ["T12"]}
        extras = {"P03": ["T05"], "P04": ["T05"], "L05": ["T06"], "S02": ["T01"], "T03": ["T13"]}
        return d[p] + extras.get(code, [])
    return {"C": ["T08"], "P": ["T09"], "E": ["T11", "T13"], "T": ["T13"],
            "K": ["T14"], "N": ["T15"], "A": ["T12", "T13", "T14", "T15"],
            "H": ["T16"], "B": ["T04", "T05", "T06", "T07", "T10"]}[p]

manifest = []
def record(path, purpose):
    raw = path.read_bytes()
    manifest.append({"path": str(path), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "purpose": purpose})
    return raw.decode("utf-8-sig")

summaries, families = {}, []
for module in ("S1", "S2", "FS"):
    directory = BASE / f"{module}题目分类考点-data"
    rows = [json.loads(line) for line in record(directory / "question_bank.jsonl", "全量结构化记录扫描；计数、考法与代表画像，不等于逐题重读原卷").splitlines() if line.strip()]
    ids = [r["question_id"] for r in rows]
    assert len(ids) == len(set(ids)), module
    summaries[module] = {
        "records": len(rows), "papers": len({r["paper_id"] for r in rows}),
        "evidence": dict(Counter(r["evidence_level"] for r in rows)),
        "scope": dict(Counter(r["syllabus_status"] for r in rows)),
        "primary_topics": dict(Counter(r["primary_topic"] for r in rows)),
        "all_family_codes": sorted({code for r in rows for code in r["method_family_codes"]}),
    }
    fpath = directory / ("method-clusters.json" if module == "S2" else "method-families.json")
    fs = json.loads(record(fpath, "全考法族定义及功能映射"))
    if isinstance(fs, list):
        fs = {f["code"]: f for f in fs}
    summaries[module]["family_definition_count"] = len(fs)
    assert set(summaries[module]["all_family_codes"]) <= set(fs), module
    for code, f in fs.items():
        hits = [r for r in rows if code in r["method_family_codes"]]
        current = [r for r in hits if r["syllabus_status"] in {"CURRENT_CORE", "CURRENT_S2_CORE"}]
        candidates = sorted(current or hits, key=lambda r: (r["evidence_level"].startswith("E3"), r.get("source_issue_status", "NONE") == "NONE", r.get("year", 0)), reverse=True)
        r = candidates[0] if candidates else {}
        families.append({
            "module": module, "code": code,
            "name": f.get("name_cn", f.get("name", f.get("label"))),
            "record_count": len(hits), "current_core_record_count": len(current),
            "tool_ids": route(module, code),
            "source_constraints": f.get("conditions_cn", f.get("constraints", "")),
            "representative": {k: r.get(k) for k in ["question_id", "question_summary_cn", "bottleneck_cn", "evidence_level", "syllabus_status", "source_issue_status", "qp_path", "qp_pdf_page_start", "qp_pdf_page_end"]},
            "representative_status": "设计溯源候选，未在本次逐题复核原卷，不是可直接上线的练习",
        })
    for name in ("statistics.json", "SCHEMA.md", "README.md", "method-clusters.md", "source-cautions.md"):
        record(directory / name, "来源口径、方法与证据边界")
    record(BASE / f"{module}题目分类考点-2010至今.md", "分类主入口")

for path in sorted((BASE / "tex/FS/chapters").glob("*.tex")):
    if int(path.name[:2]) < 10:
        record(path, "教师导学案对应可编辑章节；教学正文与公式")
record(BASE / "FS与S2新旧大纲对照.md", "课程边界与历史范围")
record(BASE / "S2题目分类考点-data/teaching-value.md", "S2到FS教学衔接")
for path in [BASE / "S1导学案/S1导学案.pdf", BASE / "output/pdf/FS/FS-complete-teacher.pdf",
             BASE / "FS导学案/8. Three important distribution in statistcs.docx",
             BASE / "S1题目分类考点-data/reference/9709-2026-2027-syllabus.pdf",
             BASE / "FS题目分类考点-data/reference/9231-2026-2027-syllabus.pdf"]:
    raw = path.read_bytes()
    manifest.append({"path": str(path), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "purpose": "导学案/官方课程依据；PDF相关教学内容读取，非整本逐题数学审计"})
for name in ["package.json", "vite.config.ts", "src/home-main.tsx", "src/App.tsx", "产品方向.md", "用户登录与数据系统流程手册.md"]:
    record(PROJECT / name, "项目当前实现与已有设计边界")

def save(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
save("source-manifest.json", {"date": "2026-09-25", "sources": manifest})
save("corpus-summary.json", {"date": "2026-09-25", "scope": "本地资料快照；不得解释为官方完整题库、考生错误率或已验收功能", "modules": summaries})
save("family-tool-map.json", {"status": "PROPOSED", "tools": TOOLS, "families": families})

md = ["# 统计考法与可视化功能映射", "", "日期：2026-09-25。所有功能均为设计建议，尚未实现。", "",
      "读取三套分类库的全量结构化记录后，逐个考法族映射。题数是本地题号身份命中数，允许重叠；FS 的 00 代码是整章入口，不是新增细考法。", "",
      "代表题仅用于追溯设计理由，题意和卡点来自原分类画像。本次未重新逐题阅读 QP/MS，也未将原有证据等级升级。数值、图形和方法条件须在对应功能实现时核原题。", "",
      "主方案：[统计板块详细方案](../../统计板块详细方案.md)。机器数据：[family-tool-map.json](family-tool-map.json)。", ""]
for module in ("S1", "S2", "FS"):
    s = summaries[module]
    md += [f"## {module}", "", f"{s['records']} 条题号记录，{s['papers']} 份试卷，{s['family_definition_count']} 个代码定义。", "",
           "|考法代码|名称|命中题数 / 现行核心题数|拟用工具|代表题|", "|---|---|---:|---|---|"]
    for f in [x for x in families if x["module"] == module]:
        r = f["representative"]
        md.append(f"|{module}:{f['code']}|{f['name']}|{f['record_count']} / {f['current_core_record_count']}|{'、'.join(f['tool_ids'])}|{r.get('question_id') or '无'}|")
md += ["", "## 工具索引", "", "|编号|名称|", "|---|---|"] + [f"|{k}|{v}|" for k, v in TOOLS.items()]
md += ["", "## 代表画像摘记", "", "以下是本地分类画像的教学摘要；不是本次重新给出的官方解答。", ""]
for f in families:
    if f["code"].endswith("00"):
        continue
    r = f["representative"]
    md += [f"### {f['module']}:{f['code']} {f['name']}", "",
           f"来源题号：{r.get('question_id')}；原证据：{r.get('evidence_level')}；范围：{r.get('syllabus_status')}。", "",
           str(r.get("question_summary_cn") or ""), "", "对应卡点：" + str(r.get("bottleneck_cn") or f["source_constraints"]), ""]
(OUT / "考法与功能映射.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print(json.dumps({m: {k: v for k, v in d.items() if k not in ["all_family_codes", "primary_topics"]} for m, d in summaries.items()}, ensure_ascii=False, indent=2))
print("Mapped", len(families), "family codes; manifested", len(manifest), "files")
