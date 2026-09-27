export type ObjectCategory = "particle" | "rigid" | "constraint";
export type ObjectSpec = {
  id: string;
  category: ObjectCategory;
  name: string;
  english: string;
  variants: { id: string; name: string }[];
  note: string;
  visual: string;
  ports: [number, number][];
  center?: [number, number];
};
const v = (id: string, name: string) => ({ id, name });
export const objectCatalog: ObjectSpec[] = [
  {
    id: "P01",
    category: "particle",
    name: "质点",
    english: "PARTICLE",
    variants: [v("point", "点状")],
    note: "没有尺寸与转动。圆点表示位置，质量在属性中设置。",
    visual: "一个实心点，保持最小可选中尺寸。",
    ports: [[110, 70]],
    center: [110, 70],
  },
  {
    id: "P02",
    category: "particle",
    name: "物块与载荷",
    english: "BLOCK",
    variants: [v("block", "物块"), v("sledge", "雪橇")],
    note: "默认按质点平移分析。矩形外形不自动引入倾覆或转动。",
    visual: "圆角矩形与清晰底边；不画材质纹理。",
    ports: [
      [110, 44],
      [66, 70],
      [154, 70],
      [110, 98],
    ],
    center: [110, 71],
  },
  {
    id: "P03",
    category: "particle",
    name: "小球",
    english: "BALL",
    variants: [v("ball", "小球")],
    note: "质点运动可使用球形外观；涉及球球碰撞时另设接触半径。",
    visual: "单色圆面，无高光与立体阴影。",
    ports: [
      [110, 38],
      [78, 70],
      [142, 70],
      [110, 102],
    ],
    center: [110, 70],
  },
  {
    id: "P04",
    category: "particle",
    name: "滑环与珠",
    english: "BEAD / RING",
    variants: [v("bead", "滑环"), v("bead-small", "珠")],
    note: "环孔表达穿线特征。搭建时需另外指定所穿的杆、绳或导线。",
    visual: "粗细适中的环形轮廓，中心留空。",
    ports: [
      [110, 44],
      [110, 96],
    ],
    center: [110, 70],
  },
  {
    id: "P05",
    category: "particle",
    name: "车辆",
    english: "VEHICLE",
    variants: [v("car", "汽车"), v("train", "车厢"), v("bike", "自行车")],
    note: "按整体质点平移分析；车轮仅作外观，不自动启用滚动动力学。",
    visual: "简洁车身与两个轮廓轮；省去灯、格栅和车门。",
    ports: [
      [47, 78],
      [176, 78],
    ],
    center: [110, 76],
  },
  {
    id: "P06",
    category: "particle",
    name: "人及运动员",
    english: "PERSON",
    variants: [v("person", "站立"), v("runner", "运动员")],
    note: "表示人或人车整体的平移，不模拟肢体动力学。",
    visual: "圆形头部与少量圆端线条，不画五官。",
    ports: [[110, 67]],
    center: [110, 67],
  },
  {
    id: "P07",
    category: "particle",
    name: "升降机",
    english: "LIFT",
    variants: [v("lift", "吊笼")],
    note: "轿厢与载物分别建模；悬挂绳需作为独立连接添加。",
    visual: "开口框架、底板与顶端连接位。",
    ports: [
      [110, 30],
      [110, 108],
    ],
    center: [110, 76],
  },
  {
    id: "P08",
    category: "particle",
    name: "飞行物",
    english: "FLIGHT",
    variants: [
      v("plane", "飞机"),
      v("rocket", "火箭"),
      v("parachute", "降落伞"),
    ],
    note: "外观不附带空气动力学。推力与阻力需根据题设单独设置。",
    visual: "轮廓概括翼面、箭形机身或伞面。",
    ports: [[110, 70]],
    center: [110, 70],
  },
  {
    id: "P09",
    category: "particle",
    name: "冲击物",
    english: "IMPACT",
    variants: [v("bullet", "子弹"), v("hammer", "锤"), v("nail", "钉 / 桩")],
    note: "用于冲量、贯入和打桩情境，物理过程由碰撞或阻力规则决定。",
    visual: "简单头部和杆身，保留运动方向的辨识度。",
    ports: [
      [58, 70],
      [163, 70],
    ],
    center: [110, 70],
  },
  {
    id: "B01",
    category: "rigid",
    name: "杆、梁与梯",
    english: "ROD / BEAM",
    variants: [v("rod", "杆"), v("beam", "梁"), v("ladder", "梯")],
    note: "可设置质量、重心和力的作用点。与无质量轻杆约束区分。",
    visual: "有厚度的长条；梯子只增加必要横档。",
    ports: [
      [35, 70],
      [185, 70],
    ],
    center: [110, 70],
  },
  {
    id: "B02",
    category: "rigid",
    name: "细线与线框",
    english: "WIRE / FRAME",
    variants: [
      v("frame", "线框"),
      v("wire-ring", "圆环"),
      v("wire-arc", "半圆弧"),
    ],
    note: "质量沿线分布；与同轮廓的薄板区分。",
    visual: "只画轮廓，内部留空；各杆拼接点可见。",
    ports: [
      [55, 100],
      [165, 100],
      [110, 32],
    ],
    center: [110, 70],
  },
  {
    id: "B03",
    category: "rigid",
    name: "薄板与圆盘",
    english: "LAMINA",
    variants: [
      v("lamina", "矩形板"),
      v("triangle", "三角板"),
      v("disc", "圆盘"),
      v("cutout", "挖孔板"),
    ],
    note: "质量按面分布。孔表示被移除区域；重心位置由模型另行计算。",
    visual: "浅色实填面，清晰边界；挖孔露出背景。",
    ports: [
      [55, 34],
      [165, 34],
      [55, 106],
      [165, 106],
    ],
    center: [110, 70],
  },
  {
    id: "B04",
    category: "rigid",
    name: "实心几何体",
    english: "SOLID",
    variants: [
      v("cylinder", "圆柱"),
      v("cone", "圆锥"),
      v("solid-ball", "球"),
      v("cuboid", "棱柱"),
    ],
    note: "用于体积分布重心与平衡。立体外观不等于开放任意三维运动。",
    visual: "两种平涂色和少量投影边线；不使用渐变。",
    ports: [
      [110, 28],
      [110, 110],
    ],
    center: [110, 70],
  },
  {
    id: "B05",
    category: "rigid",
    name: "薄壳与空心体",
    english: "SHELL",
    variants: [v("shell", "半球壳"), v("hollow-cylinder", "空心圆柱")],
    note: "按壳面分布质量；开口、内边缘必须与实心体区分。",
    visual: "开口留白和双边缘；用轮廓表达壁厚。",
    ports: [
      [55, 59],
      [165, 59],
      [110, 106],
    ],
    center: [110, 78],
  },
  {
    id: "B06",
    category: "rigid",
    name: "飞轮",
    english: "FLYWHEEL",
    variants: [v("flywheel", "给定惯量")],
    note: "用于已知转轴与惯量的定轴转动。轴心、轮缘为不同连接位置。",
    visual: "外圈、轮毂和四根简化辐条。",
    ports: [
      [110, 70],
      [110, 28],
      [152, 70],
      [110, 112],
      [68, 70],
    ],
    center: [110, 70],
  },
  {
    id: "C01",
    category: "constraint",
    name: "平面",
    english: "PLANE",
    variants: [
      v("plane-smooth", "光滑"),
      v("plane-rough", "粗糙"),
      v("incline", "倾斜"),
    ],
    note: "单面接触，允许离面；倾角、长度和摩擦系数独立设置。",
    visual: "突出接触边。地基斜线与表面粗糙短纹使用不同位置。",
    ports: [
      [35, 80],
      [185, 80],
    ],
  },
  {
    id: "C02",
    category: "constraint",
    name: "墙与挡板",
    english: "WALL",
    variants: [v("wall", "墙面"), v("barrier", "有限挡板")],
    note: "表示固定碰撞面，需设置有效面方向与恢复规则。",
    visual: "一条明确边界和背面的淡色支承区。",
    ports: [
      [110, 27],
      [110, 113],
    ],
  },
  {
    id: "C03",
    category: "constraint",
    name: "曲面",
    english: "CURVED SURFACE",
    variants: [v("bowl", "内曲面"), v("dome", "外曲面")],
    note: "内侧与外侧接触必须明确，不能与穿线轨道混用。",
    visual: "单一弧形接触边，支承色带放在不可进入的一侧。",
    ports: [
      [40, 60],
      [180, 60],
    ],
  },
  {
    id: "C04",
    category: "constraint",
    name: "导线与轨道",
    english: "GUIDE",
    variants: [
      v("guide", "直导线"),
      v("circle-guide", "圆导线"),
      v("tube", "圆管"),
    ],
    note: "穿线导向可双向提供法向约束；沿管弹绳需要按真实路径计长。",
    visual: "导线用双边细轮廓，圆管用两条等距边界。",
    ports: [
      [35, 70],
      [185, 70],
    ],
  },
  {
    id: "C05",
    category: "constraint",
    name: "不可伸长绳",
    english: "STRING",
    variants: [v("string", "绷紧"), v("slack-string", "松弛")],
    note: "只能拉不能推。松弛和绷紧必须有不同状态。",
    visual: "连续赭黄细线；松弛用下垂弧线，端点形状一致。",
    ports: [
      [35, 55],
      [185, 55],
    ],
  },
  {
    id: "C06",
    category: "constraint",
    name: "弹性绳",
    english: "ELASTIC STRING",
    variants: [v("elastic", "弹性绳")],
    note: "自然长、模量独立设置。松弛时不产生压缩推力。",
    visual: "连续赭黄绳线加浅色弹性段与自然长标记。",
    ports: [
      [35, 70],
      [185, 70],
    ],
  },
  {
    id: "C07",
    category: "constraint",
    name: "弹簧",
    english: "SPRING",
    variants: [
      v("spring", "自然状态"),
      v("spring-long", "伸长"),
      v("spring-short", "压缩"),
    ],
    note: "可承受题设允许的拉伸与压缩，两个端点保持独立。",
    visual: "规则折线与直线端部；用节距变化区分伸长压缩。",
    ports: [
      [30, 70],
      [190, 70],
    ],
  },
  {
    id: "C08",
    category: "constraint",
    name: "固定滑轮",
    english: "PULLEY",
    variants: [v("pulley", "理想固定滑轮")],
    note: "轮轴固定，绳沿轮缘改向。绳需单独添加。",
    visual: "两圈轮缘与中心轴，不添加材质或复杂机械结构。",
    ports: [
      [110, 23],
      [110, 75],
      [76, 75],
      [144, 75],
    ],
  },
  {
    id: "C09",
    category: "constraint",
    name: "钉、穿绳环与孔",
    english: "PEG / EYELET",
    variants: [v("peg", "固定钉"), v("eyelet", "光滑环"), v("hole", "穿线孔")],
    note: "用于绕钉、穿环或穿孔。固定环与可运动滑环是不同对象。",
    visual: "小圆形改向部件配固定支承标记。",
    ports: [[110, 74]],
  },
  {
    id: "C10",
    category: "constraint",
    name: "铰链与转轴",
    english: "HINGE / AXIS",
    variants: [v("hinge", "铰链"), v("axis", "固定轴")],
    note: "固定点或轴允许相应转动；不同于把整个刚体固定。",
    visual: "圆轴心与三角支座，固定轴用中心十字定位。",
    ports: [[110, 60]],
  },
  {
    id: "C11",
    category: "constraint",
    name: "轻刚杆与撑杆",
    english: "RIGID LINK",
    variants: [v("link", "轻刚杆"), v("strut", "撑杆")],
    note: "连接长度固定。根据题设表达拉力或推力，自身不默认有质量。",
    visual: "中空双线杆与清晰端孔，与实填有质量杆区分。",
    ports: [
      [40, 70],
      [180, 70],
    ],
  },
  {
    id: "C12",
    category: "constraint",
    name: "固定端与悬点",
    english: "ANCHOR",
    variants: [v("anchor", "固定端")],
    note: "确定一根绳、弹簧或连接元件的固定端点。",
    visual: "短支承线、地基斜纹和小连接孔。",
    ports: [[110, 83]],
  },
  {
    id: "C13",
    category: "constraint",
    name: "转台",
    english: "TURNTABLE",
    variants: [v("turntable", "水平转台")],
    note: "用于共同角速度和向心约束；粒子与绳仍独立添加。",
    visual: "扁平椭圆台面与中心轴，轨迹辅助线默认隐藏。",
    ports: [[110, 65]],
  },
];
const path = (d: string, cls = "o-line", extra = "") =>
  `<path d="${d}" class="${cls}" ${extra}/>`;
const circle = (x: number, y: number, r: number, cls = "o-body") =>
  `<circle cx="${x}" cy="${y}" r="${r}" class="${cls}"/>`;
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
  cls = "o-body",
  rx = 2,
) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" class="${cls}"/>`;
const ellipse = (
  x: number,
  y: number,
  rx: number,
  ry: number,
  cls = "o-body",
) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" class="${cls}"/>`;
const hatch = (x: number, y: number, count = 7) =>
  Array.from({ length: count }, (_, i) =>
    path(`M${x + i * 10} ${y}l-6 8`, "o-hatch"),
  ).join("");
function spring(width: number) {
  const start = 110 - width / 2,
    end = 110 + width / 2,
    inner = start + 20,
    step = (width - 40) / 12;
  return path(
    `M${start} 70h20 ` +
      Array.from(
        { length: 12 },
        (_, i) => `L${inner + step * (i + 0.5)} ${i % 2 === 0 ? 58 : 82}`,
      ).join(" ") +
      ` L${end - 20} 70H${end}`,
    "o-rope",
  );
}

export function glyphBody(variant: string): string {
  switch (variant) {
    case "point":
      return circle(110, 70, 22, "o-soft") + circle(110, 70, 8, "o-solid");
    case "block":
      return (
        rect(66, 44, 88, 54, "o-body", 4) + path("M72 98H148", "o-contact")
      );
    case "sledge":
      return (
        path("M62 49h85v39H62Z", "o-body") +
        path("M51 98h107q15 0 15-15", "o-outline") +
        path("M72 88v10M140 88v10")
      );
    case "ball":
    case "solid-ball":
      return (
        circle(110, 70, 32) +
        (variant === "solid-ball"
          ? path("M79 70a31 10 0 0 0 62 0", "o-hatch")
          : "")
      );
    case "bead":
      return `<path d="M136 70a26 26 0 1 1-52 0a26 26 0 1 1 52 0M125 70a15 15 0 1 0-30 0a15 15 0 1 0 30 0" fill-rule="evenodd" class="o-body"/>`;
    case "bead-small":
      return circle(110, 70, 20) + circle(110, 70, 7, "o-hole");
    case "car":
      return (
        path("M46 83V67l25-3 18-25h47l22 25 20 7v21H46Z", "o-body") +
        path("M83 61l12-16h34l15 16Z", "o-window") +
        circle(76, 92, 13, "o-wheel") +
        circle(148, 92, 13, "o-wheel")
      );
    case "train":
      return (
        rect(44, 39, 132, 53, "o-body", 4) +
        rect(58, 49, 27, 19, "o-window", 1) +
        rect(94, 49, 27, 19, "o-window", 1) +
        rect(130, 49, 27, 19, "o-window", 1) +
        circle(73, 94, 11, "o-wheel") +
        circle(148, 94, 11, "o-wheel")
      );
    case "bike":
      return (
        circle(65, 90, 25, "o-ring") +
        circle(155, 90, 25, "o-ring") +
        path(
          "M65 90l27-37 25 37H65m52 0 30-44 8 44M86 46h22M136 35h16l-5 11",
          "o-outline",
        )
      );
    case "person":
      return (
        circle(110, 31, 11, "o-solid") +
        path(
          "M110 49v35m0-25-25 18m25-18 25 18m-25 7-17 29m17-29 17 29",
          "o-person",
        )
      );
    case "runner":
      return (
        circle(124, 28, 10, "o-solid") +
        path(
          "M116 46l-17 32 29 9 10 22M99 78l-21 25H57M113 51l-23-9-15 17m37-5 17 17 23-12",
          "o-person",
        )
      );
    case "lift":
      return (
        path("M72 31h76v77H72Z", "o-body") +
        rect(79, 43, 62, 56, "o-window", 1) +
        path("M97 31v-9m26 9v-9M72 108h76", "o-outline")
      );
    case "plane":
      return path(
        "M38 76l62-11-14-34h16l31 30 38-2q14 0 18 9l-7 8-50 2-29 32H88l13-31-47 3-15-6Z",
        "o-body",
      );
    case "rocket":
      return (
        path(
          "M111 24Q85 49 94 91h33q10-42-16-67ZM94 68 77 94h17m33-26 17 26h-17",
          "o-body",
        ) +
        circle(111, 57, 9, "o-window") +
        path("M103 101v14m16-14v14", "o-hatch")
      );
    case "parachute":
      return (
        path(
          "M58 62a52 42 0 0 1 104 0Q145 51 128 62q-18-11-36 0-17-11-34 0Z",
          "o-body",
        ) +
        path("M58 62l52 49 52-49M92 62l18 49 18-49", "o-hatch") +
        circle(110, 114, 6, "o-solid")
      );
    case "bullet":
      return (
        path("M58 54h72q22 0 33 16-11 16-33 16H58Z", "o-body") +
        path("M76 55v30")
      );
    case "hammer":
      return (
        rect(101, 60, 17, 53, "o-body") + path("M74 31h69v29H74Z", "o-solid")
      );
    case "nail":
      return path("M88 29h44v10H88Zm18 10h8v57l-4 17-4-17Z", "o-body");
    case "rod":
      return rect(35, 63, 150, 14, "o-body", 3);
    case "beam":
      return (
        rect(35, 55, 150, 30, "o-body", 2) +
        path("M35 63h150M35 77h150", "o-hatch")
      );
    case "ladder":
      return path(
        "M35 52h150M35 88h150M52 52v36m23-36v36m23-36v36m23-36v36m23-36v36m23-36v36",
        "o-outline",
      );
    case "frame":
      return path("M55 34h110v72H55Z", "o-outline");
    case "wire-ring":
      return circle(110, 70, 38, "o-ring");
    case "wire-arc":
      return path("M60 97a50 55 0 0 1 100 0", "o-outline");
    case "lamina":
      return rect(55, 34, 110, 72, "o-body", 0);
    case "triangle":
      return path("M55 106 105 30 165 106Z", "o-body");
    case "disc":
      return circle(110, 70, 38);
    case "cutout":
      return path(
        "M55 34h110v72H55ZM92 63v24h31V63Z",
        "o-body",
        'fill-rule="evenodd"',
      );
    case "cylinder":
      return (
        path("M72 42v54a38 13 0 0 0 76 0V42", "o-body") +
        ellipse(110, 42, 38, 13) +
        path("M72 96a38 13 0 0 0 76 0", "o-hatch")
      );
    case "cone":
      return (
        path("M62 101 110 25 158 101a48 12 0 0 1-96 0Z", "o-body") +
        path("M62 101a48 12 0 0 0 96 0", "o-hatch")
      );
    case "cuboid":
      return (
        path("M62 48 99 29h59v61l-37 22H62Z", "o-body") +
        path("M62 48h59v64m0-64 37-19M121 48h0", "o-hatch")
      );
    case "shell":
      return (
        path("M55 57a55 50 0 0 0 110 0", "o-body") +
        ellipse(110, 57, 55, 14, "o-hole") +
        ellipse(110, 57, 45, 9, "o-ring")
      );
    case "hollow-cylinder":
      return (
        path("M70 43v55a40 12 0 0 0 80 0V43", "o-body") +
        ellipse(110, 43, 40, 13, "o-hole") +
        ellipse(110, 43, 31, 8, "o-ring")
      );
    case "flywheel":
      return (
        circle(110, 70, 42, "o-ring") +
        circle(110, 70, 34, "o-ring") +
        path("M110 36v68M76 70h68", "o-outline") +
        circle(110, 70, 11, "o-body")
      );
    case "plane-smooth":
    case "plane-rough":
      return (
        rect(35, 82, 150, 10, "o-support", 0) +
        path("M35 80H185", "o-surface") +
        hatch(45, 93, 14) +
        (variant === "plane-rough"
          ? Array.from({ length: 13 }, (_, i) =>
              path(`M${45 + i * 10} 80l3-4`, "o-hatch"),
            ).join("")
          : "")
      );
    case "incline":
      return (
        path("M42 104 177 42l4 9-135 62Z", "o-support") +
        path("M42 104 177 42", "o-surface")
      );
    case "wall":
      return (
        rect(110, 27, 13, 86, "o-support", 0) +
        path("M110 27V113", "o-surface") +
        Array.from({ length: 8 }, (_, i) =>
          path(`M125 ${29 + i * 10}l8-6`, "o-hatch"),
        ).join("")
      );
    case "barrier":
      return (
        rect(105, 26, 10, 83, "o-support", 1) +
        path("M105 26V109", "o-surface") +
        path("M90 110h40")
      );
    case "bowl":
      return (
        path("M40 50a70 57 0 0 0 140 0l9 0a79 67 0 0 1-158 0Z", "o-support") +
        path("M40 50a70 57 0 0 0 140 0", "o-surface")
      );
    case "dome":
      return (
        path("M40 103a70 65 0 0 1 140 0h-10a60 55 0 0 0-120 0Z", "o-support") +
        path("M40 103a70 65 0 0 1 140 0", "o-surface")
      );
    case "guide":
      return path("M35 66h150M35 74h150", "o-guide");
    case "circle-guide":
      return circle(110, 70, 40, "o-guide") + circle(110, 70, 36, "o-guide");
    case "tube":
      return circle(110, 70, 43, "o-guide") + circle(110, 70, 33, "o-guide");
    case "string":
      return path("M35 55H185", "o-rope");
    case "slack-string":
      return path("M35 55C60 125 160 125 185 55", "o-rope");
    case "elastic":
      return (
        path("M35 70H185", "o-rope") +
        rect(72, 66, 76, 8, "o-elastic", 3) +
        path("M77 91v5m0-2h66m0-3v5", "o-hatch")
      );
    case "spring":
      return spring(150);
    case "spring-long":
      return spring(178);
    case "spring-short":
      return spring(112);
    case "pulley":
      return (
        path("M85 23h50M110 23V75", "o-env") +
        hatch(91, 15, 5) +
        circle(110, 75, 34, "o-ring-env") +
        circle(110, 75, 28, "o-ring-env") +
        circle(110, 75, 6, "o-axis")
      );
    case "peg":
      return (
        path("M85 43h50", "o-env") +
        hatch(91, 35, 5) +
        path("M110 43v21", "o-env") +
        circle(110, 74, 10, "o-axis")
      );
    case "eyelet":
      return (
        path("M85 35h50M110 35v19", "o-env") +
        hatch(91, 27, 5) +
        circle(110, 74, 20, "o-ring-env")
      );
    case "hole":
      return (
        rect(67, 48, 86, 44, "o-support") + ellipse(110, 70, 21, 12, "o-hole")
      );
    case "hinge":
      return (
        path("M110 60 88 97h44Z", "o-support") +
        path("M78 101h64", "o-env") +
        hatch(84, 103, 6) +
        circle(110, 60, 9, "o-axis")
      );
    case "axis":
      return (
        circle(110, 70, 29, "o-ring-env") +
        path("M110 29v82M69 70h82", "o-hatch") +
        circle(110, 70, 6, "o-axis")
      );
    case "link":
      return (
        rect(40, 65, 140, 10, "o-hole", 5) +
        circle(40, 70, 6, "o-axis") +
        circle(180, 70, 6, "o-axis")
      );
    case "strut":
      return (
        path("M41 78 46 62 179 62 179 78Z", "o-hole") +
        path("M54 70h111", "o-hatch") +
        circle(43, 70, 6, "o-axis") +
        circle(180, 70, 6, "o-axis")
      );
    case "anchor":
      return (
        path("M70 43h80M110 43V75", "o-env") +
        hatch(78, 33, 8) +
        circle(110, 83, 8, "o-ring-env")
      );
    case "turntable":
      return (
        path("M44 67v13a66 20 0 0 0 132 0V67", "o-support") +
        ellipse(110, 67, 66, 20, "o-env-face") +
        path("M110 87v25M90 113h40", "o-env") +
        circle(110, 67, 4, "o-axis")
      );
    default:
      return "";
  }
}
export const glyphCSS = `
.o-body{fill:var(--accent-soft);stroke:var(--accent);stroke-width:2}.o-soft{fill:var(--accent-soft);stroke:none}.o-solid{fill:var(--accent);stroke:var(--accent);stroke-width:2}.o-line,.o-outline,.o-ring{fill:none;stroke:var(--accent);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.o-outline{stroke-width:3}.o-person{fill:none;stroke:var(--accent);stroke-width:7;stroke-linecap:round;stroke-linejoin:round}.o-window,.o-hole{fill:var(--canvas-bg);stroke:var(--accent);stroke-width:2}.o-wheel{fill:var(--canvas-bg);stroke:var(--accent);stroke-width:3}.o-contact{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round}.o-support{fill:var(--surface);stroke:var(--field-line);stroke-width:1}.o-hatch{fill:none;stroke:var(--field-line);stroke-width:1.4;stroke-linecap:round}.o-env,.o-surface,.o-guide,.o-ring-env{fill:none;stroke:var(--secondary-ink);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}.o-surface{stroke-width:3}.o-env-face{fill:var(--surface);stroke:var(--secondary-ink);stroke-width:2}.o-rope{fill:none;stroke:var(--object-rope);stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}.o-elastic{fill:var(--object-rope);stroke:none;opacity:.25}.o-axis{fill:var(--canvas-bg);stroke:var(--secondary-ink);stroke-width:2}.o-port{fill:var(--canvas-bg);stroke:var(--object-rope);stroke-width:1.8}.o-center{fill:var(--ink);stroke:var(--canvas-bg);stroke-width:1.5}.o-selection{fill:none;stroke:var(--accent);stroke-width:1.2;stroke-dasharray:4 4}.o-touch{fill:none;stroke:var(--success);stroke-width:4;stroke-linecap:round}.o-label{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:12px;fill:var(--secondary-ink)}
`;
export function variantPorts(
  spec: ObjectSpec,
  variant: string,
): [number, number][] {
  const ports: Record<string, [number, number][]> = {
    "bead-small": [
      [110, 50],
      [110, 90],
    ],
    ladder: [
      [35, 52],
      [35, 88],
      [185, 52],
      [185, 88],
    ],
    frame: [
      [55, 34],
      [165, 34],
      [55, 106],
      [165, 106],
    ],
    parachute: [[110, 114]],
    sledge: [
      [62, 68],
      [147, 68],
    ],
    bike: [
      [65, 90],
      [155, 90],
    ],
    hammer: [
      [110, 31],
      [110, 113],
    ],
    nail: [
      [110, 29],
      [110, 113],
    ],
    triangle: [
      [55, 106],
      [105, 30],
      [165, 106],
    ],
    disc: [
      [110, 32],
      [148, 70],
      [110, 108],
      [72, 70],
    ],
    "wire-ring": [
      [110, 32],
      [148, 70],
      [110, 108],
      [72, 70],
    ],
    "wire-arc": [
      [60, 97],
      [160, 97],
      [110, 42],
    ],
    cylinder: [
      [110, 29],
      [110, 109],
    ],
    cone: [
      [110, 25],
      [62, 101],
      [158, 101],
    ],
    "solid-ball": [
      [110, 38],
      [142, 70],
      [110, 102],
      [78, 70],
    ],
    cuboid: [
      [62, 48],
      [158, 29],
      [121, 112],
    ],
    "hollow-cylinder": [
      [70, 43],
      [150, 43],
      [110, 110],
    ],
    incline: [
      [42, 104],
      [177, 42],
    ],
    bowl: [
      [40, 50],
      [180, 50],
    ],
    dome: [
      [40, 103],
      [180, 103],
    ],
    "circle-guide": [
      [110, 32],
      [148, 70],
      [110, 108],
      [72, 70],
    ],
    tube: [
      [110, 32],
      [148, 70],
      [110, 108],
      [72, 70],
    ],
    spring: [
      [35, 70],
      [185, 70],
    ],
    "spring-long": [
      [21, 70],
      [199, 70],
    ],
    "spring-short": [
      [54, 70],
      [166, 70],
    ],
    hole: [[110, 70]],
    axis: [[110, 70]],
    turntable: [[110, 67]],
  };
  return ports[variant] ?? spec.ports;
}
export function springBetween(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1,
    dy = y2 - y1,
    length = Math.hypot(dx, dy),
    ux = dx / length,
    uy = dy / length;
  const point = (along: number, normal = 0) =>
    `${x1 + ux * along - uy * normal},${y1 + uy * along + ux * normal}`;
  return path(
    `M${point(0)}L${point(18)}` +
      Array.from(
        { length: 12 },
        (_, i) =>
          `L${point(18 + ((length - 36) * (i + 0.5)) / 12, i % 2 === 0 ? 6 : -6)}`,
      ).join("") +
      `L${point(length - 18)}L${point(length)}`,
    "o-rope",
  );
}
export type GlyphOptions = {
  anchors?: boolean;
  center?: boolean;
  selected?: boolean;
  contact?: boolean;
};
export function glyphMarkup(
  spec: ObjectSpec,
  variant = spec.variants[0].id,
  options: GlyphOptions = {},
) {
  // The variants are internal constants; unsupported input falls back to the object's own default.
  const safe = spec.variants.some((v) => v.id === variant)
    ? variant
    : spec.variants[0].id;
  const extras =
    (options.selected ? rect(14, 13, 192, 116, "o-selection", 4) : "") +
    (options.anchors
      ? variantPorts(spec, safe)
          .map(([x, y]) => circle(x, y, 4, "o-port"))
          .join("")
      : "") +
    (options.center && spec.center
      ? circle(...spec.center, 3, "o-center") +
        `<text x="${spec.center[0] + 7}" y="${spec.center[1] - 6}" class="o-label">O</text>`
      : "") +
    (options.contact && spec.id === "P02" && safe === "block"
      ? path("M70 98H150", "o-touch")
      : "");
  return glyphBody(safe) + extras;
}
export function svgGlyph(
  spec: ObjectSpec,
  variant = spec.variants[0].id,
  options: GlyphOptions = {},
) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 140"><style>${glyphCSS}</style>${glyphMarkup(spec, variant, options)}</svg>`;
}

export function compositionMarkup(kind: "slope" | "pulley" | "rod") {
  const data =
    kind === "slope"
      ? `<path d="M40 161L245 78" class="o-surface"/><path d="M40 169l205-83" class="o-hatch"/><g transform="translate(122 127.8) rotate(-22) translate(-110 -98)">${glyphMarkup(objectCatalog[1], "block", { contact: true })}</g><path d="M40 161h60M68 161a28 28 0 0 0-2-10" class="o-hatch"/><text x="79" y="158" class="o-label">θ</text>`
      : kind === "pulley"
        ? `<path d="M80 36h120M140 36v46" class="o-env"/><circle cx="140" cy="82" r="25" class="o-ring-env"/><circle cx="140" cy="82" r="5" class="o-axis"/><path d="M113 143V82a27 27 0 0 1 54 0v83" class="o-rope"/><rect x="90" y="143" width="46" height="37" rx="3" class="o-body"/><rect x="144" y="165" width="46" height="42" rx="3" class="o-body"/><text x="108" y="167" class="o-label">A</text><text x="161" y="191" class="o-label">B</text>`
        : `<path d="M60 45V186M54 47v135" class="o-env"/><path d="M65 158L224 118L227 126L67 166Z" class="o-body"/><circle cx="66" cy="162" r="6" class="o-axis"/>${springBetween(66, 55, 225, 122)}<circle cx="66" cy="55" r="4" class="o-axis"/>`;

  return data;
}
