/**
 * 从「UI 补稿设计图」画板里量出**屏幕内区**的裁剪框（判定逻辑；读盘与 sharp 在
 * `scripts/extract-supplement-reference.mjs`）。
 *
 * ## 为什么要有这个模块
 *
 * 这个脚本原先的裁剪表是**手填**的：每个画板一行 `{ left: 140, top: 300,
 * width: 2680, height: 1230 }`，`expect` 写 1340×615。三个数字全错——屏幕内区
 * 实际是 `{80, 372, 2880, 1800}` = 1440×900。后果不是"对比图略偏"，
 * 而是并排出来的参考图**左边多出 30px 的侧栏外空白、右边裁掉了 30px 内容**，
 * 缩放后**两边字号不一致**，人眼看到的差异全是裁剪误差造成的假象。
 *
 * 手填数字没有守卫，改一次画板就会静默错位，所以把"怎么量"写成代码。
 *
 * ## 判据
 *
 * 画板把每个屏幕画在一个 **2 设备像素宽的窗口边框**里，边框色恒为 `#d8d8de`。
 * 于是：
 *
 * 1. 找边框色的**竖线**（某列上该色像素数 ≥ 图高的 1/4）→ 得到左内缘候选；
 * 2. 从每个左内缘出发，按**已知视口宽**（2880 / 780 设备像素）推出右缘，
 *    再验证该处确实有一条竖框线。宽度是精确判据，不做容差。
 * 3. **顶边**用行覆盖率找（某行在屏宽范围内 8 成以上采样点是边框色），
 *    而不是中轴线上的单点——单点在手机画板上会失效（中段被状态栏内容盖住），
 *    在长画板上会被图例分隔线与下方缩略图带偏。
 * 4. **高度直接查表**，不去画板上量。
 *
 * ## 第 4 条最关键
 *
 * 画板上的屏经常比视口高（设计者按内容高度画长图：实测有 1440×1225、390×1001 的）。
 * 浏览器截图恒为 1440×900 / 390×844，所以"量出多高就裁多高"会得到与截图对不齐的
 * 参考图（并排图一边长一边短、缩放比例不同）。既然宽度已经唯一确定了视口，
 * 高度就没有第二种可能，查表即可——这一条把不确定的那一维彻底消掉。
 */

/** 窗口边框色（画板设计画布固定值，实测全体 D-xx / M-xx 一致）。 */
export const FRAME_BORDER = [216, 216, 222];

/** 边框色匹配容差。±1 足够：导出图没有压缩噪声，放宽反而会把投影并进来。 */
const TOLERANCE = 1;

/**
 * 已知视口：**CSS 宽 → 设备像素尺寸**（本轮要对比的两种）。
 *
 * 桌面 1440×900、移动 390×844（Pixel 5 口径，与 `playwright.config.ts` 一致）。
 */
export const VIEWPORT_DEVICE = {
  1440: { width: 2880, height: 1800 },
  390: { width: 780, height: 1688 },
};

/** 视口列表，按设备宽降序（先试宽的，避免把桌面的左内缘配成 780 宽）。 */
const VIEWPORTS = Object.entries(VIEWPORT_DEVICE)
  .map(([cssWidth, v]) => ({ cssWidth: Number(cssWidth), ...v }))
  .sort((a, b) => b.width - a.width);

/**
 * 画板上的**标注记号**颜色：设计画布用这套品红/紫罗兰画编号角标与引线
 * （实测 `#e01e80` 品红、`#b969e2` 紫罗兰两种）。
 *
 * 为什么要把它们抹掉：这些记号**压在屏幕内容上**（设计者用它们标"这是图例 3"），
 * 于是逐像素测量会把记号本身当成内容——例如「最近笔记」标题行实测墨迹从
 * y394 起，而 y394..395 那两行其实是品红角标，标题真正从 y409 才开始。
 * 拿带记号的参考图去比对，会得出"标题位置错了 15px"这种假结论。
 *
 * 判定分两档：
 *  - **笔画本体**：饱和的品红/紫罗兰，绿色分量明显低于红蓝；
 *  - **抗锯齿残影**：笔画边缘与白底混合后的浅粉（如 `#fef3f8`、`#fdf2f8`），
 *    亮度很高但**仍带红/蓝偏色**（`r > g` 且 `b >= g`）。
 *
 * 第二档必须处理：只抹第一档的话，残影会让"白卡"判定失败，
 * 实测后果是 5 格计数区的第 1 张卡被读成 179 宽（真值 190）——
 * 因为这些浅粉像素恰好落在卡与卡之间的边界上。
 */
export function isAnnotationMarker(rgb) {
  const [r, g, b] = rgb;
  // 中性灰/白：三通道几乎相等，绝不可能是记号
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  const saturated = g <= 150 && spread > 60;
  if (saturated && ((r > 180 && b > 100 && r - g > 70) || (r > 150 && b > 190 && b - g > 60))) {
    return true;
  }
  // 残影：偏粉/偏紫但很亮（r > g 且 b >= g，且整体够亮）
  const light = (r + g + b) / 3 > 200;
  return light && r - g > 4 && b - g >= 0 && spread > 4;
}

/**
 * 判定某个像素是不是窗口边框色。 */
export function isFrameBorder(rgb, tolerance = TOLERANCE) {
  return (
    Math.abs(rgb[0] - FRAME_BORDER[0]) <= tolerance &&
    Math.abs(rgb[1] - FRAME_BORDER[1]) <= tolerance &&
    Math.abs(rgb[2] - FRAME_BORDER[2]) <= tolerance
  );
}

/**
 * 把升序的坐标数组切成"连续段"，每段是 `[起, 止]`。
 *
 * 边框在 2 倍图里是 2 像素宽，所以它表现为连续两列/两行；
 * 靠这个把"线"与"线"分开，才能取到严格内侧。
 */
export function splitRuns(values) {
  const runs = [];
  let start = null;
  let prev = null;
  for (const v of values) {
    if (start === null) start = v;
    else if (v !== prev + 1) {
      runs.push([start, prev]);
      start = v;
    }
    prev = v;
  }
  if (start !== null) runs.push([start, prev]);
  return runs;
}

/**
 * 从一张图的原始像素里量出所有屏幕内区的裁剪框。
 *
 * `pixels` 是逐行排列的 RGB 三元组（长度 = width * height * 3），
 * `width` / `height` 是设备像素尺寸。返回 `{ left, top, width, height, css }`，
 * 其中 `css` 是折算到 CSS 像素后的视口尺寸。
 *
 * 纯函数：不读盘、不依赖 sharp，所以能直接单测。
 */
export function detectScreenCrops({ pixels, width, height, channels = 3 }) {
  const at = (x, y) => {
    const i = (y * width + x) * channels;
    return [pixels[i], pixels[i + 1], pixels[i + 2]];
  };
  const isBorder = (x, y) => isFrameBorder(at(x, y));

  /*
   * 先抹掉标注记号：它们压在屏幕内容上，会污染顶边检测与后续的逐像素测量。
   * 抹成白色（卡片底色），不影响边框识别——记号不是边框色。
   */
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (isAnnotationMarker([pixels[i], pixels[i + 1], pixels[i + 2]])) {
        pixels[i] = 255;
        pixels[i + 1] = 255;
        pixels[i + 2] = 255;
      }
    }
  }

  /*
   * 竖线：某列上边框色像素数 ≥ 图高的 1/4。
   * 用比例而不是绝对值，是因为画板高度从 2160 到 4600 不等；
   * 阈值太高会漏掉"屏幕只占画板上半部分"的画板，太低会把文字里的灰像素串成线。
   */
  const minColumnHits = Math.round(height * 0.25);
  const borderColumns = [];
  for (let x = 0; x < width; x++) {
    let hits = 0;
    for (let y = 0; y < height; y++) if (isBorder(x, y)) hits++;
    if (hits >= minColumnHits) borderColumns.push(x);
  }

  /*
   * 每个"竖线段"都当一次左内缘的候选（取段的**最右列 + 1**，即严格内侧）。
   *
   * 不要求左右框线相邻：`D-05` / `D-07` / `D-10` / `D-13` 在屏幕**中间**还有一条
   * 竖直分隔线（同一块屏上下展示两种状态），列段会变成
   * `[[78,79],[1534,1535],[2960,2961]]`。只知道"相邻两条线之间是屏"的实现
   * 在这里会算出 1454 宽的内区（不命中任何视口）而整块丢弃。
   */
  const crops = [];
  for (const run of splitRuns(borderColumns)) {
    const left = run[1] + 1;

    for (const viewport of VIEWPORTS) {
      // 右内缘 = left + width - 1，右框线在 left + width
      const rightBorder = left + viewport.width;
      if (rightBorder + 1 >= width) continue;

      // 右框线必须真的存在：该列（或相邻列）上有足够多的边框色像素
      let hits = 0;
      for (let y = 0; y < height; y++) {
        if (isBorder(rightBorder, y) || isBorder(rightBorder + 1, y)) hits++;
      }
      if (hits < minColumnHits) continue;

      const top = locateScreenTop({ isBorder, left, width: viewport.width, height });
      if (top === null) continue;
      if (top + viewport.height > height) continue;

      crops.push({
        left,
        top,
        width: viewport.width,
        height: viewport.height,
        css: { width: viewport.cssWidth, height: viewport.height / 2 },
      });
      break; // 一个左内缘只对应一块屏
    }
  }

  // 按左上角排序：调用方要的"第一块屏"是画板里最靠左上那块
  return crops.sort((a, b) => a.left - b.left || a.top - b.top);
}

/**
 * 在屏宽范围内找出**顶边**（返回内区第一行的 y）。
 *
 * 判据是"某一行在该范围内有足够多的边框色像素"——不是中轴线上的单点。
 * 单点判据在两种真实情形下会失效：
 *  - 手机画板的顶边中段被状态栏内容盖住，中轴线上根本不是边框色；
 *  - 长画板的中轴线上还会穿过图例分隔线与下方缩略图。
 *
 * 用**行覆盖率**（每 4 列采样一次，命中 8 成以上才算边框行）就都稳了。
 */
function locateScreenTop({ isBorder, left, width, height }) {
  const samples = [];
  for (let x = left; x < left + width; x += 4) samples.push(x);
  const needed = Math.round(samples.length * 0.8);

  for (let y = 0; y < height; y++) {
    let hits = 0;
    for (const x of samples) if (isBorder(x, y)) hits++;
    if (hits < needed) continue;
    /*
     * 边框是 2 设备像素宽，命中行有两行（y、y+1）。取内区要跳过整条边框，
     * 即从 `y + 2` 开始——用 `y + 1` 会把第二条边框像素带进裁剪图，
     * 表现为并排图顶部多出一条 1px 灰线（这是被测试抓到的 off-by-one）。
     */
    return y + 2;
  }
  return null;
}

/**
 * 同一块屏可能被重复检出（相邻竖线段都可能是同一块屏的左缘）。
 * 按左上角就近去重，保留先出现的那块。
 */
export function dedupeCrops(crops, threshold = 20) {
  const out = [];
  for (const c of crops) {
    if (
      out.some((o) => Math.abs(o.left - c.left) < threshold && Math.abs(o.top - c.top) < threshold)
    )
      continue;
    out.push(c);
  }
  return out;
}
