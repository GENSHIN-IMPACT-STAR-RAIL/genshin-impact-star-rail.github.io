import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  objectCatalog,
  glyphMarkup,
  glyphCSS,
  glyphBody,
  compositionMarkup,
} from "../../src/mechanics-objects/art.ts";
const require = createRequire(import.meta.url);
const sharp = require("C:/Users/17157/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp");
const out = path.dirname(fileURLToPath(import.meta.url));
const theme = fs.readFileSync(
  new URL("../../src/theme-tokens.css", import.meta.url),
  "utf8",
);
const light = Object.fromEntries(
  [
    ...theme
      .match(/:root\s*\{([^}]+)\}/)[1]
      .matchAll(/(--[\w-]+):\s*([^;]+);/g),
  ].map((m) => [m[1], m[2].trim()]),
);
const dark = {
  ...light,
  ...Object.fromEntries(
    [
      ...theme
        .match(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/)[1]
        .matchAll(/(--[\w-]+):\s*([^;]+);/g),
    ].map((m) => [m[1], m[2].trim()]),
  ),
};
const escape = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
const resolve = (s, p) =>
  s.replace(/var\((--[\w-]+)\)/g, (_, name) => {
    if (!p[name]) throw Error("Missing token " + name);
    return p[name];
  });
const text = (x, y, s, size = 13, color = "var(--ink)") =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-family="Microsoft YaHei,Segoe UI,sans-serif">${escape(s)}</text>`;
const shell = (content, w, h, p) =>
  resolve(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><style>${glyphCSS}</style><rect width="${w}" height="${h}" fill="var(--paper)"/>${content}</svg>`,
    p,
  );
const variants = objectCatalog.flatMap((o) =>
  o.variants.map((v) => ({
    spec: o,
    variant: v.id,
    label: o.name + " · " + v.name,
  })),
);
const findings = [];
for (const themeName of ["light", "dark"]) {
  const palette = {
    ...(themeName === "light" ? light : dark),
    "--object-rope": themeName === "light" ? "#b08442" : "#d7b477",
  };
  const directory = path.join(out, themeName);
  fs.mkdirSync(directory, { recursive: true });
  for (const { spec, variant } of variants) {
    const markup = glyphMarkup(spec, variant);
    if (!glyphBody(variant)) throw Error("Empty glyph " + variant);
    const svg = shell(markup, 220, 140, palette);
    await sharp(Buffer.from(svg)).metadata();
    fs.writeFileSync(path.join(directory, `${spec.id}-${variant}.svg`), svg);
  }
  const board = async (name, entries, cols = 4, options = {}) => {
    const w = 1080,
      cellW = 246,
      cellH = 190,
      pad = 28,
      gap = 12,
      rows = Math.ceil(entries.length / cols),
      h = 105 + rows * (cellH + gap) + 25;
    let content =
      text(pad, 38, "Mathroom / 力学物体外形", 24) +
      text(
        pad,
        68,
        `${name}  ·  ${themeName === "light" ? "浅色" : "深色"}  ·  简洁轮廓与平涂色`,
        12,
        "var(--secondary-ink)",
      );
    entries.forEach((entry, i) => {
      const x = pad + (i % cols) * (cellW + gap),
        y = 100 + Math.floor(i / cols) * (cellH + gap);
      content +=
        `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="4" fill="var(--canvas-bg)" stroke="var(--line)"/><g transform="translate(${x + 13},${y + 8})">${glyphMarkup(entry.spec, entry.variant, options)}</g>` +
        text(x + 17, y + 164, entry.label, 12) +
        text(x + 17, y + 181, entry.spec.english, 8, "var(--secondary-ink)");
    });
    const svg = shell(content, w, h, palette);
    fs.writeFileSync(path.join(out, `${name}-${themeName}.svg`), svg);
    await sharp(Buffer.from(svg))
      .png()
      .toFile(path.join(out, `${name}-${themeName}.png`));
  };
  await board(
    "基础外形",
    objectCatalog.map((o) => ({
      spec: o,
      variant: o.variants[0].id,
      label: o.name,
    })),
  );
  await board("全部变体", variants);
  await board("连接点与选中状态", variants, 4, {
    anchors: true,
    center: true,
    selected: true,
  });
  const compositionSVG = shell(
    text(28, 38, "Mathroom / 组合外观示意", 24) +
      ["slope", "pulley", "rod"]
        .map(
          (kind, i) =>
            `<rect x="${28 + i * 350}" y="70" width="334" height="300" rx="5" fill="var(--canvas-bg)" stroke="var(--line)"/><g transform="translate(${55 + i * 350},82)">${compositionMarkup(kind)}</g>` +
            text(
              48 + i * 350,
              346,
              ["物块与平面", "双悬重与滑轮", "铰接杆与弹性连接"][i],
              14,
            ),
        )
        .join(""),
    1080,
    400,
    palette,
  );
  fs.writeFileSync(path.join(out, `组合示意-${themeName}.svg`), compositionSVG);
  await sharp(Buffer.from(compositionSVG))
    .png()
    .toFile(path.join(out, `组合示意-${themeName}.png`));
  findings.push({
    theme: themeName,
    objects: objectCatalog.length,
    variants: variants.length,
    rendered: true,
  });
}
fs.writeFileSync(
  path.join(out, "render-checks.json"),
  JSON.stringify(
    {
      groups: Object.fromEntries(
        ["particle", "rigid", "constraint"].map((c) => [
          c,
          objectCatalog.filter((o) => o.category === c).length,
        ]),
      ),
      results: findings,
      note: "SVG rasterization and structural coverage; not browser interaction validation.",
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(findings));
