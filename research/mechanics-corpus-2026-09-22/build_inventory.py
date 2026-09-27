from pathlib import Path
import json, re, hashlib, collections, itertools
ROOT=Path(r'E:\国际学校数学\【】山实剑桥PPT\导学案')
OUT=Path(__file__).resolve().parent

def scene(id,name,mode,codes,process,requirements):
 return dict(id=id,name=name,mode=mode,codes=codes,process=process,requirements=requirements)
SCENES=[
scene('S01','共点力合成与分解','静态分析',{'M':['F01']},'指定作用方向 → 分解至选定轴 → 合成/求平衡未知量','二维矢量、可选择坐标轴；不要求物体必须运动'),
scene('S02','质点平衡与悬挂结点','静态平衡',{'M':['F02','F03']},'建立绳段/外力几何 → 联立平衡 → 检查张力非负','独立绳与同一穿环绳分开；结点和光滑滑环不同'),
scene('S03','静摩擦与临界滑动','静态/临界',{'M':['F04','F05','F06']},'平衡 → 计算所需摩擦 → 与μR比较 → 上/下两种临界趋势','静摩擦是范围；R受斜拉/斜推影响，不能一律mg cosθ'),
scene('S04','环/珠沿直杆或曲线导线','接触/导向',{},'确定导线法向约束 → 受力/能量 → 沿导线移动或保持平衡','穿在线上的珠允许反力换向，不能当作单面斜坡'),
scene('S05','单体直线动力学与平面滑动','平移运动',{'M':['N01','N02']},'启动/投射 → 沿面加减速 → 停止、反向或进入下一段','不同表面段有独立μ与方向；处理停止后能否继续运动'),
scene('S06','绳与滑轮连接体','多体约束',{'M':['N03']},'绷紧同动 → 求各绳张力 → 触地/断绳/卸载 → 新的独立运动','每根绳独立长度和张力；2/3粒子、多固定滑轮、落地松绳'),
scene('S07','车辆牵引与刚性拖杆','多体约束',{'M':['N04']},'整体平动 → 子系统求连接力 → 制动/换坡/撤力后重新求解','轻绳只能拉；轻刚杆可拉可推；车轮外观不自动启用转动'),
scene('S08','升降机与载物','给定/受力运动',{'M':['N05']},'加速上升/下降 → 匀速 → 制动 → 支持力和缆绳张力变化','载物与电梯分质量；图像规定运动时反求力'),
scene('S09','叠放块与相对滑动临界','多接触临界',{},'整体受推 → 上下界面提供静摩擦 → 达到相对滑动阈值','两个接触界面的μ独立；整体/子体切换分析'),
scene('S10','直线运动函数、分段图像与匀变速','给定运动',{},'输入s(t)/v(t)/a(t)或图像 → 连续接段 → 零速、转向与累计路程','此类可不含质量/力；分段时间原点与有向面积'),
scene('S11','竖直投射与落体','平移运动',{'M':['K04']},'上抛/释放 → 最高点 → 下落 → 指定高度或地面','允许非零起始高度、延迟发射；给定反弹后速度/能损'),
scene('S12','追及、会合与目标命中','多轨迹/事件',{'M':['K03'],'FM':['P04']},'多对象独立计时 → 比较位置/相对运动 → 首次相遇或判无相遇','多个时钟与延迟开始；同位不一定自动执行碰撞'),
scene('S13','动力、阻力与功率','受力/瞬态分析',{'M':['E05','E06']},'给功率/驱力 → 校准阻力 → 瞬时加速度/稳速 → 换坡或开关机','P=Fv与恒力不能混同；给端态总功不能擅造时间轨迹'),
scene('S14','功—能端态与组合路径','能量分析',{'M':['E01','E02','E03','E04','E07']},'路径端态 → 重力/外力/摩擦做功 → 速度、高差、停点或未知量','缺具体路径或阻力定律时只给能量端态，不伪造完整动画'),
scene('S15','直线粒子碰撞与粘合','瞬时事件',{'M':['M01','M02','M03','M05'],'FM':['M01']},'接近 → 沿碰撞线动量关系 → 给定碰后条件/恢复系数 → 分离或粘合','M题可直接给碰后速度关系；不强制所有题都输入e'),
scene('S16','二维抛体','平移运动',{'FM':['P01','P02','P03','P05'],'M2':['P01','P02','P03','P04']},'从指定位置发射 → 飞行与最高点 → 指定目标/障碍/斜面','X/Y分量、完整初态、上/下行分支、目标可达性'),
scene('S17','平面/墙壁正碰与斜碰','瞬时事件',{'FM':['M02']},'入射 → 分解法向/切向 → 法向恢复 → 新直线/抛体运动','光滑壁切向速度不变；不同壁可有不同e'),
scene('S18','两光滑球斜碰','多体瞬时事件',{'FM':['M03']},'建立连心线 → 法向动量+恢复 → 各球切向不变 → 合成末速度','两个速度矢量及碰撞法线；粒子模型需给连心几何，不能只有一个点'),
scene('S19','连续碰撞链','多事件组合',{'M':['M04'],'FM':['M04']},'首碰 → 自由/受力移动或撞墙 → 再碰 → 检查是否还有下一碰','事件队列、粘合后质量更新、按相对速度判断再碰'),
scene('S20','冲量与穿透/打桩','冲量/阻力过程',{'FM':['M06','M07']},'冲量改变动量或穿过阻碍 → 碰后/贯入段 → 停止/穿出','区分瞬时碰撞和有限时恒阻过程；冲量不作为有限力读数'),
scene('S21','杆/板等刚体平衡','刚体静态',{'FM':['R01','R02'],'M2':['R01','R02']},'放置支点、绳和载荷 → 力平衡+力矩平衡 → 接触/摩擦检查','力作用点、重心、铰链两分量、多个接触点'),
scene('S22','复合重心与挖孔','几何/质量分析',{'FM':['R03'],'M2':['R03']},'按长度/面积/体积/壳面积赋质量 → 组合或挖除 → 求重心','线、板、实心体、薄壳分别建模；孔用负贡献而非负物体'),
scene('S23','刚体自由悬挂','刚体静态',{'FM':['R06'],'M2':['R06']},'选悬点 → 重心在悬点下方 → 定姿态/逆求几何参数','刚体形状与重心；只求最终平衡不必模拟任意摆动'),
scene('S24','倾覆与先滑先倒','刚体临界',{'FM':['R04'],'M2':['R04']},'改变角/外力/几何 → 接触合力到边缘或μ界 → 比较临界条件','支承区域与边缘；临界倾覆不要求全过程翻滚动画'),
scene('S25','水平圆周与转台接触','圆周约束',{'FM':['C01'],'M2':['C01']},'指定r、v或ω → 竖直平衡+径向动力学 → 接触/摩擦可行范围','圆周半径、向心方向；可二维截面+俯视图，无须通用3D引擎'),
scene('S26','单/多绳圆锥摆','圆周约束',{'FM':['C02'],'M2':['C02']},'绳长几何 → 共同角速度 → 张力/反力 → 松绳或断裂边界','不同圆周半径可共享ω；绳穿环同张力与结点独立绳分开'),
scene('S27','竖直圆周与绕钉换圆','圆周/事件',{'FM':['C03']},'能量求速度 → 径向方程 → T/R条件 → 整圆、往返或换支点','轻绳、轻杆、导线、内/外曲面约束不同；遇钉改变有效半径'),
scene('S28','圆周脱离后抛体','混合过程',{'FM':['C04']},'圆周运动 → T或R达到零/绳断/轨道终点 → 继承切向速度飞行','脱离事件优先于形式能量止点；可能再碰地或曲面'),
scene('S29','角运动学与非匀速圆周','给定角运动',{'FM':['C05'],'M2':['C00']},'输入θ(t)/ω(t)/v(t) → 径向与切向加速度 → 合加速度','给定运动不是自由动力学；角量与线量转换'),
scene('S30','弹性平衡与参数标定','弹性静态',{'FM':['H01'],'M2':['H01']},'自然长与伸长 → 胡克定律 → 平衡 → 求模量/长度/载荷','区分弹绳只能拉与弹簧可压；预拉和静平衡位置'),
scene('S31','弹性直线运动与松紧切换','弹性演化',{'FM':['H02'],'M2':['H02']},'初始伸长/压缩/松弛 → 弹性运动 → 自然长松绳 → 自由段 → 再拉紧','势能只在有效伸长区；支点上下两侧方向切换'),
scene('S32','多弹绳/双段弹绳','弹性几何约束',{'FM':['H03'],'M2':['H03']},'各段独立自然长与几何 → 平衡或释放 → 有效段逐一切换','整根绳中点与两根不同绳不可混同；各段松弛判定'),
scene('S33','弹性圆周/圆锥摆','弹性+圆周',{'FM':['H04'],'M2':['H04']},'转动半径与伸长相互决定 → 弹力参与向心 → 可行角速范围','几何、胡克定律与向心方程联立'),
scene('S34','随t、v、x变化的直线力','变力演化',{'FM':['V01','V02','V03','V04','V05'],'M2':['V01','V02','V03','V04']},'明确力函数 → 选择dv/dt或v dv/dx → 停止/反向/终速/换力','受限函数输入及参数域；阻力方向随速度而变，转向时重新判断'),
scene('S35','简谐运动','历史振动',{'FM':['L01','L02']},'识别平衡位置与回复加速度 → 振幅/相位 → 首达时间/松绳切换','历史模块；不能把所有弹性运动和大摆角都当SHM'),
scene('S36','刚体定轴转动、惯量与转动能','历史刚体动力学',{'FM':['L03','L04','L05']},'确定转轴与惯量 → 力矩/转动能 → 角速度 → 脱落、牵引或转向','定轴转动；重物绕盘绳可耦合平移；无需通用自由刚体碰撞'),
scene('S37','复摆与小角振动','历史刚体振动',{'FM':['L06']},'求转轴惯量与重心距 → 小角回复力矩 → 周期与相位','明确小角近似与稳定平衡；有限角能量另算'),
scene('S38','铰接/接触的多刚体平衡','多刚体静态',{'FM':['L07']},'拆分各刚体 → 作用反作用与力矩 → 接触/摩擦界','不能只求整体平衡漏掉内部作用力'),
scene('S39','两转盘接触的无滑动传动','给定旋转约束',{},'接触处切向速度相等 → 转向相反或按几何确定 → 线/角加速度','无滑动接触传动；不据此推导必须做任意滚动碰撞沙盒'),
]
# Pattern evidence uses actual question text and authored summaries, never adaptation ideas.
OBJECTS=[
('P01','一般质点/未指定外形','particle','particle|质点|粒子'),
('P02','块、箱、载荷、雪橇','particle','block|box|crate|load|sledge|sled|物块|块|箱|载荷|雪橇|重物'),
('P03','球/小球','particle','\\bball\\b|\\bspheres?\\b|小球|悬球|两球|绳球|抛球|球体'),
('P04','环/珠/套环','particle','\\bbeads?\\b|\\bsmall (?:smooth )?rings?\\b|小环|滑环|光滑环|粗糙.*环|珠|环套'),
('P05','车辆/列车/拖车/自行车','particle','\\bcar\\b|lorry|truck|trailer|train|locomotive|carriage|bicycle|cyclist|汽车|货车|列车|拖车|挂车|骑手|骑车|机车|房车|摩托'),
('P06','人/运动员/行人','particle','runner|athlete|\\bman\\b|\\bgirl\\b|\\bboy\\b|child|walker|跑者|运动员|儿童|孩子|女孩|步行者|骑手'),
('P07','电梯/吊笼','particle','elevator|\\blift\\b|电梯|升降机|吊笼'),
('P08','飞机/火箭/降落伞运动者','particle','aeroplane|aircraft|rocket|parachut|飞机|火箭|降落伞|跳伞'),
('P09','子弹/锤/钉/桩','particle','bullet|hammer|\\bnail\\b|\\bpile\\b|子弹|锤|钉入|打桩|桩'),
('B01','杆/梁/梯','rigid','\\brods?\\b|\\bbeams?\\b|ladder|杆|梁|梯子'),
('B02','细线/圆环/线框','rigid','\\bwires?\\b|\\bframes?\\b|\\brings?\\b|circular arc|线弧|线框|圆环|相框|边条|辐条|弓架|圆弧'),
('B03','薄板/圆盘','rigid','lamina|laminae|\\bdis[ck]s?\\b|\\bplate\\b|薄板|圆盘|方板|三角板|玻璃|矩形板'),
('B04','实心几何体','rigid','\\bsolid\\b|\\bcone\\b|\\bcylinder\\b|\\bprism\\b|\\bcube\\b|sphere|cuboid|rectangular block|solid block|实心|圆锥|圆柱|棱柱|立方体|方锥|矩形块|柱孔块|方底柱'),
('B05','薄壳/空心体','rigid','shell|hollow|薄壳|球壳|空心|薄壁|开口盒|容器'),
('B06','直接给定惯量的飞轮/刚体','rigid','flywheel|飞轮'),
]
COMPONENTS=[
('C01','直平面/路面/地面','inclined plane|horizontal plane|horizontal surface|水平面|水平地|斜面|斜坡|粗糙坡|光滑坡|坡上|坡下|地面'),
('C02','墙/屏障/障碍碰面','\\bwall|barrier|obstacle|墙|屏障|挡板|障碍'),
('C03','球/柱/锥等曲面','spherical surface|hemispherical bowl|cylindrical surface|conical surface|球面|球壳内|球顶|半球碗|圆柱内|锥面|内球|外球'),
('C04','导线/杆/轨道/管','wire|track|rail|tube|导线|刚丝|钢丝|圆管|轨道|滑道|环套|珠.*杆|珠.*圆环'),
('C05','不可伸长绳/缆/细线','inextensible|light string|light cord|light cable|定长绳|轻绳|绳张力|断绳|绳断|两绳|三绳|同绳|缆绳'),
('C06','弹性绳/弹性线','elastic string|elastic cord|elastic band|弹绳|弹性绳|弹性环|弹性线'),
('C07','弹簧','spring|弹簧'),
('C08','理想固定滑轮','pulley|滑轮'),
('C09','钉/光滑环/孔的改向','peg|through.*ring|through.*hole|绳过|绕钉|遇.*钉|穿环|桌孔|两.*钉|fixed ring'),
('C10','铰链/固定转轴/枢轴','hinge|pivot|rotation.*axis|rotate.*axis|铰接|铰链|转轴|绕.*轴'),
('C11','轻刚杆/撑杆/拖杆','light rod|rigid rod|tow.bar|strut|轻杆|轻刚杆|拖杆|刚杆|斜撑|撑力|coupling'),
('C12','固定端/悬点/支点','fixed point|fixed end|suspend|悬点|支点|固定点|固定端|悬挂|悬重'),
('C13','转盘/转台/旋转支撑','turntable|rotating.*(?:table|drum|rod)|转盘|转台|旋转杆|圆筒壁转动'),
]
EVENTS=[
('E01','到达指定时刻/位置','时刻|经过|到达|reaches|passes|at time'),
('E02','停止/反向','停下|停车|瞬停|静止时刻|转向|返回|反向|comes to rest|instantaneous rest|revers'),
('E03','绳断/剪断/撤连接','断绳|绳断|剪断|断裂|string.*(?:breaks|cut)|string is cut|cord.*break'),
('E04','触地/触障碍','触地|落地|撞墙|撞壁|碰墙|碰地|hits.*(?:ground|wall)|reaches.*ground'),
('E05','绳松弛','松绳|松弛|string.*slack|cord.*slack'),
('E06','绳重新绷紧/进入伸长区','再绷紧|再次绷紧|重新绷紧|再拉紧|张紧|becomes taut|taut again'),
('E07','失去接触/离轨/离面','脱离|离轨|离地|离面|loses contact|leaves.*surface'),
('E08','碰撞/反弹','碰撞|相撞|撞|反弹|collision|collide|rebound|impact'),
('E09','粘合/合体','粘合|粘附|粘上|合体|coalesce|stick together|remain in contact'),
('E10','外力/功率切换','撤力|撤去|移去.*力|熄火|关机|开伞|断燃|功率突|功率改|改驱|switched off|engine is switched|force is removed'),
('E11','跨表面/介质','进入|入液|入水|地段|光滑.*粗糙|坡.*水平|enters|passes from'),
('E12','添加/移除质量','脱落|脱离.*质量|撤掉|附加|加2m|换2m|加2M|remove.*particle|particle.*detached'),
('E13','改变支点/半径','遇.*钉|绕.*钉|换圆|新圆|小圆|string.*peg'),
('E14','临界滑动/倾覆','临界|极限平衡|倾覆|just about|limiting equilibrium|toppl|sliding'),
]

def match(p,t):return re.search(p,t,re.I|re.S)
def snippet(p,t):
 m=match(p,t)
 return t[max(0,m.start()-35):m.end()+55].replace('\n',' ') if m else ''
def dump(name,obj): (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8')
def read():
 rows=[];manifest=[]
 for module in ['M','FM','M2']:
  p=ROOT/(module+'题目分类考点-data')/'question_bank.jsonl';data=p.read_bytes();raw=[json.loads(l) for l in data.decode('utf-8-sig').splitlines() if l.strip()]
  manifest.append({'module':module,'path':str(p),'sha256':hashlib.sha256(data).hexdigest(),'records':len(raw),'papers':len({r['paper_id'] for r in raw}),'source_text_candidate_groups':len({r['text_equivalence_group'] for r in raw})})
  for r in raw:r['_module']=module;rows.append(r)
 return rows,manifest

def classify(r):
 module=r['_module']; methods=set(r['method_family_codes']);summary=r['question_summary_cn'];text=summary+'\n'+r['question_text']; hits={}
 for s in SCENES:
  matching=methods.intersection(s['codes'].get(module,[]))
  if matching:hits[s['id']]={'basis':'source_method','evidence':','.join(sorted(matching))}
 def add(s,pattern,condition=True):
  if condition and match(pattern,text):hits[s]={'basis':'question_phrase','evidence':snippet(pattern,text)}
 add('S04','threaded on|threaded through|环套|滑环|珠.*(?:导线|直杆|钢丝|圆环)|环.*(?:杆上|刚丝|圆形|导线)')
 add('S08','elevator|\\blift\\b|电梯|升降机')
 add('S09','箱叠|叠于|on top of|stack',module=='M')
 if module=='M' and (r['primary_topic']=='M.2 KIN' or methods.intersection({'K05','K06','K07'})):hits['S10']={'basis':'source_method','evidence':','.join(sorted(methods))}
 add('S20','bullet|hammer|\\bnail\\b|子弹|锤|桩')
 add('S39','no slipping|without slipping|无滑动接触',module=='FM' and 'C05' in methods)
 add('S17','撞|碰|rebound|impact',module=='M2' and bool(methods.intersection({'P03','P04'})))
 if module=='FM' and 'P04' in methods:hits.setdefault('S16',{'basis':'source_method','evidence':'P04'})
 # Cross-topic physical processes found by reading the authored question summaries.
 for code,pattern in [('S17','撞.{0,12}墙|碰壁|撞壁|撞地|碰地|落地.{0,20}(?:反弹|回弹)|地面.{0,20}反弹|斜撞.{0,8}(?:墙|平面|斜面|屏障)'),('S12','追上|追及|相遇|会合|再次相撞|再次相碰|两抛体'),('S19','再撞|连续.{0,8}碰|两次碰|三次碰|串碰|再次相撞|再次相碰')]:
  if match(pattern,summary):hits.setdefault(code,{'basis':'authored_summary_cross_topic','evidence':snippet(pattern,summary)})
 if module=='M2' and match('粘合',summary) and not any(c.startswith('R') for c in methods):hits.setdefault('S15',{'basis':'authored_summary_cross_topic','evidence':summary})
 # Any questions not mapped are explicit review failures, never silently assigned to a generic family.
 rigid=any(x.startswith('R') for x in methods) and module!='M' or module=='FM' and bool(methods.intersection({'L03','L04','L05','L06','L07'}))
 particle=not rigid or bool(match('particle|bead|质点|粒子|附点|附重|载物|端载|悬重',text))
 obj={}
 for code,name,kind,pat in OBJECTS:
  if (kind=='rigid' and rigid or kind=='particle' and particle) and match(pat,text):obj[code]=snippet(pat,text)
 if 'B04' in obj and match('hollow|shell|薄壳|空心|薄壁',text) and not match('solid|实心',text):obj.pop('B04')
 if 'B01' in obj and match('light rod|轻杆',text) and not match('uniform rod|uniform straight rod|非均匀杆|均匀杆',text):obj.pop('B01')
 if particle and not any(x.startswith('P') for x in obj):obj['P01']='题目以平移/质点运动建模；外观未命中具体标签。'
 comp={code:snippet(pat,text) for code,name,pat in COMPONENTS if match(pat,text) and not (code=='C04' and rigid and 'S04' not in hits)}
 if module!='M' and not rigid and match('pulley|滑轮',text):hits.setdefault('S06',{'basis':'question_phrase','evidence':snippet('pulley|滑轮',text)})
 ev={code:snippet(pat,text) for code,name,pat in EVENTS if match(pat,summary+'\n'+r['question_text'])}
 # A scene signature describes co-occurring tasks, not automatically sequential motions.
 alternatives=bool(match('比较|另情形|替代|分别|两种|改为|改光滑|another occasion|instead|in a second',summary+'\n'+r['question_text']))
 risk=[]
 if r.get('source_issue_status','NONE')!='NONE':risk.append(r['source_issue_status'])
 if r.get('source_risk','NO_KNOWN_MODEL_CONFLICT')!='NO_KNOWN_MODEL_CONFLICT':risk.append(r['source_risk'])
 if r.get('ms_coverage') in ['MISSING','MISMATCH']:risk.append('MS_'+r['ms_coverage'])
 if r.get('selection_lock')=='ADAPT_ONLY':risk.append('ADAPT_ONLY')
 return {'module':module,'question_id':r['question_id'],'reference':r.get('reference',r.get('official_source_id',r['question_id'])),'paper_id':r['paper_id'],'year':r['year'],'marks':r.get('marks',r['marks_detected']),
 'source_scope_status':r.get('syllabus_status',r.get('historical_component_status')),'text_candidate_group':r['text_equivalence_group'],'source_evidence_level':r['evidence_level'],
 'qp_path':r['qp_path'],'qp_pages':[r['qp_pdf_page_start'],r['qp_pdf_page_end']],'ms_path':r.get('ms_path'),
 'question_summary_cn':summary,'source_solution_route_cn':r['solution_route_cn'],'source_stage_or_model_cn':r.get('stage_structure_cn',r.get('stages_cn',r.get('model_context_cn'))),
 'method_family_codes':sorted(methods),'scenes':sorted(hits),'scene_evidence':hits,'object_labels':sorted(obj),'object_evidence':obj,'components':sorted(comp),'component_evidence':comp,'event_mentions':sorted(ev),'event_evidence':ev,
 'contains_alternative_cases':alternatives,'source_risks':sorted(set(risk)),'tagging_status':'DETERMINISTIC_SOURCE_METHOD_AND_PHRASE_MAPPING__SCHEMA_V1','scope_note':r.get('scope_note_cn',r.get('alignment_status','')),
 'process_note':'情境共现不等于事件先后；原题摘要/路线保留真实题目联系，详细状态机见情境词典。'}

if __name__=='__main__':
 raw,manifest=read();rows=[classify(r) for r in raw]
 dump('source-manifest.json',manifest);dump('taxonomy.json',{'scenes':SCENES,'objects':[dict(id=c,name=n,role=k,pattern=p) for c,n,k,p in OBJECTS],'components':[dict(id=c,name=n,pattern=p) for c,n,p in COMPONENTS],'event_mentions':[dict(id=c,name=n,pattern=p) for c,n,p in EVENTS]})
 (OUT/'question-model-map.jsonl').write_text('\n'.join(json.dumps(r,ensure_ascii=False) for r in rows)+'\n',encoding='utf-8')
 def count(key,codes):
  return {code:{'name':name,**{m:sum(code in r[key] for r in rows if r['module']==m) for m in ['M','FM','M2']},'total':sum(code in r[key] for r in rows),'examples':[r['module']+':'+r['question_id'] for r in rows if code in r[key]][:5]} for code,name in codes}
 stats={'records':len(rows),'papers':len({(r['module'],r['paper_id']) for r in rows}),'modules':manifest,'scenes':count('scenes',[(s['id'],s['name']) for s in SCENES]),'objects':count('object_labels',[(c,n) for c,n,k,p in OBJECTS]),'components':count('components',[(c,n) for c,n,p in COMPONENTS]),'event_mentions':count('event_mentions',[(c,n) for c,n,p in EVENTS]),'scope':dict(collections.Counter(r['module']+':'+str(r['source_scope_status']) for r in rows)),'unmapped':[r['question_id'] for r in rows if not r['scenes']],'scene_signatures':len({tuple(r['scenes']) for r in rows}),'alternative_case_records':sum(r['contains_alternative_cases'] for r in rows),'source_risk_records':[{'module':r['module'],'id':r['question_id'],'risks':r['source_risks']} for r in rows if r['source_risks']]}
 dump('statistics.json',stats)
 combos=collections.defaultdict(list)
 for r in rows:combos[tuple(r['scenes'])].append(r['module']+':'+r['question_id'])
 dump('observed-combinations.json',[{'scene_ids':list(k),'count':len(v),'questions':v} for k,v in sorted(combos.items(),key=lambda kv:-len(kv[1]))])
 validation={'unique_keys':len({(r['module'],r['question_id']) for r in rows})==len(rows),'all_records_mapped':not stats['unmapped'],'all_qp_paths_exist':all(Path(r['qp_path']).exists() for r in rows),'source_hashes_unchanged':all(hashlib.sha256(Path(m['path']).read_bytes()).hexdigest()==m['sha256'] for m in manifest),'valid_scene_references':all(set(r['scenes'])<={s['id'] for s in SCENES} for r in rows),'record_counts':{m:sum(r['module']==m for r in rows) for m in ['M','FM','M2']},'scope':'Catalogue mapping and source integrity only, not independent mathematical or PDF-visual certification'}
 dump('validation.json',validation)
 print(json.dumps({'stats':{k:v for k,v in stats.items() if k not in ['scenes','objects','components','event_mentions','source_risk_records']},'scene_counts':{k:v['total'] for k,v in stats['scenes'].items()},'object_counts':{k:v['total'] for k,v in stats['objects'].items()},'validation':validation},ensure_ascii=False,indent=2))
