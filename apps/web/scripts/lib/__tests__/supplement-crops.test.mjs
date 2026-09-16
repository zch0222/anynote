import { describe, expect, it } from "vitest";
import {
  FRAME_BORDER,
  VIEWPORT_DEVICE,
  dedupeCrops,
  detectScreenCrops,
  isAnnotationMarker,
  isFrameBorder,
  splitRuns,
} from "../supplement-crops.mjs";

/**
 * 这个模块存在的理由是一条真出过的事故：裁剪表手填错了（写成
 * `{140,300,2680,1230}` / 期望 1340×615，实际应为 `{80,372,2880,1800}` / 1440×900），
 * 于是并排对比图里"两边的字号看起来不一样"，而真实原因是参考图被裁歪 + 缩放失真。
 *
 * 所以这里的用例重点不是"能算出数字"，而是**算歪了要能被拒绝**。
 * 后面几条（内部分隔线、长图截断、多台手机排序）都对应实现里真踩过的坑。
 */

/** 造一张假的 RGB 画布，便于精确控制边框位置。 */
function makeCanvas(width, height, paint) {
  const pixels = new Uint8Array(width * height * 3).fill(255);
  const set = (x, y, rgb) => {
    const i = (y * width + x) * 3;
    pixels[i] = rgb[0];
    pixels[i + 1] = rgb[1];
    pixels[i + 2] = rgb[2];
  };
  paint(set);
  return { pixels, width, height };
}

/**
 * 画一个 2 像素宽的窗口边框矩形（模拟画板）。
 *
 * 画板上的边框是**圆角**的，四角那一小段不是边框色——这正是"靠连通性找框"
 * 会失败的原因，所以这里也照实画出圆角，让用例能覆盖到。
 */
function drawFrame(set, { left, top, width, height }, radius = 6) {
  const inside = (x, y) => {
    if (x < left + radius && y < top + radius) {
      const dx = left + radius - x;
      const dy = top + radius - y;
      return dx * dx + dy * dy <= radius * radius;
    }
    return true;
  };
  for (let t = 0; t < 2; t++) {
    for (let x = left; x < left + width; x++) {
      if (inside(x, top + t)) set(x, top + t, FRAME_BORDER);
      if (inside(x, top + height - 1 - t)) set(x, top + height - 1 - t, FRAME_BORDER);
    }
    for (let y = top; y < top + height; y++) {
      if (inside(left + t, y)) set(left + t, y, FRAME_BORDER);
      if (inside(left + width - 1 - t, y)) set(left + width - 1 - t, y, FRAME_BORDER);
    }
  }
}

describe("isAnnotationMarker", () => {
  it("认饱和的品红与紫罗兰笔画", () => {
    // 实测值：编号角标的品红、图例引线的紫罗兰
    expect(isAnnotationMarker([224, 30, 128])).toBe(true);
    expect(isAnnotationMarker([185, 105, 226])).toBe(true);
  });

  it("认抗锯齿的浅粉残影（只抹笔画会让卡片边界读错）", () => {
    // 实测值：记号边缘落在 5 格计数卡片之间，导致第 1 张卡被读成 179 宽
    expect(isAnnotationMarker([254, 243, 248])).toBe(true);
    expect(isAnnotationMarker([253, 242, 248])).toBe(true);
    expect(isAnnotationMarker([252, 243, 248])).toBe(true);
  });

  it("不误伤设计里的正常颜色", () => {
    // 白卡、页面底色、分隔线、窗口边框
    expect(isAnnotationMarker([255, 255, 255])).toBe(false);
    expect(isAnnotationMarker([242, 242, 247])).toBe(false);
    expect(isAnnotationMarker([229, 229, 234])).toBe(false);
    expect(isAnnotationMarker(FRAME_BORDER)).toBe(false);
    // 语义色：accent 蓝、success 绿、warning 橙、organization 紫都是内容的一部分
    expect(isAnnotationMarker([0, 113, 227])).toBe(false);
    expect(isAnnotationMarker([52, 199, 89])).toBe(false);
    expect(isAnnotationMarker([255, 149, 0])).toBe(false);
    // 正文黑与次级灰
    expect(isAnnotationMarker([29, 29, 31])).toBe(false);
    expect(isAnnotationMarker([110, 110, 115])).toBe(false);
  });

  it("画板上抹掉记号后不影响边框识别", () => {
    const canvas = makeCanvas(3200, 2400, (set) => {
      drawFrame(set, { left: 78, top: 370, width: 2884, height: 1804 });
      // 在卡片之间压一个品红角标
      for (let y = 285; y < 383; y++) for (let x = 547; x < 566; x++) set(x, y, [224, 30, 128]);
    });
    const crops = detectScreenCrops(canvas);

    expect(crops).toHaveLength(1);
    expect(crops[0]).toMatchObject({ left: 80, top: 372, width: 2880, height: 1800 });
  });
});

describe("isFrameBorder", () => {
  it("认画板固定的边框色", () => {
    expect(isFrameBorder([216, 216, 222])).toBe(true);
  });

  it("拒绝相近但不同的灰（投影会从这里漏进来）", () => {
    // 边框下方那条阴影实测从 #e2e2e4 起步、逐渐变亮；容差放宽到 ±16 就会整条并进来
    expect(isFrameBorder([226, 226, 228])).toBe(false);
    expect(isFrameBorder([242, 242, 247])).toBe(false);
  });
});

describe("splitRuns", () => {
  it("切成连续段", () => {
    expect(splitRuns([1, 2, 3, 7, 8, 20])).toEqual([
      [1, 3],
      [7, 8],
      [20, 20],
    ]);
  });

  it("空数组得到空结果", () => {
    expect(splitRuns([])).toEqual([]);
  });
});

describe("detectScreenCrops", () => {
  it("量出桌面屏内区：边框 2 像素，内侧正好是 1440x900", () => {
    const canvas = makeCanvas(3200, 2400, (set) =>
      drawFrame(set, { left: 78, top: 370, width: 2884, height: 1804 }),
    );
    const crops = detectScreenCrops(canvas);

    expect(crops).toHaveLength(1);
    expect(crops[0]).toMatchObject({
      left: 80,
      top: 372,
      width: 2880,
      height: 1800,
      css: { width: 1440, height: 900 },
    });
  });

  it("量出手机屏内区：780x1688 设备像素 = 390x844 CSS", () => {
    const canvas = makeCanvas(1000, 2200, (set) =>
      drawFrame(set, { left: 78, top: 370, width: 784, height: 1692 }),
    );
    const crops = detectScreenCrops(canvas);

    expect(crops).toHaveLength(1);
    expect(crops[0]).toMatchObject({
      left: 80,
      top: 372,
      width: 780,
      height: 1688,
      css: { width: 390, height: 844 },
    });
  });

  /**
   * 画板上的屏经常比视口高：实测有 1440×1225、390×1001 的。
   * 浏览器截图恒为 900 / 844 高，所以高度必须查表而不是"量出多高裁多高"，
   * 否则并排图一边长一边短、缩放比例不同，看起来像"整页都错位了"。
   */
  it("屏比视口高时只取顶部视口高度", () => {
    const canvas = makeCanvas(1000, 2600, (set) =>
      drawFrame(set, { left: 78, top: 370, width: 784, height: 4000 }),
    );
    const crops = detectScreenCrops(canvas);

    expect(crops[0]).toMatchObject({ height: 1688, css: { width: 390, height: 844 } });
    // 而不是画板上量到的内容高度
    expect(crops[0].height).not.toBe(3996);
  });

  it("宽度不在已知视口上时整块丢弃，而不是产出错位的参考图", () => {
    // 这正是事故里的数字：内区只有 2680 设备像素 = 1340 CSS
    const canvas = makeCanvas(3000, 1400, (set) =>
      drawFrame(set, { left: 140, top: 300, width: 2684, height: 1234 }),
    );

    expect(detectScreenCrops(canvas)).toEqual([]);
    expect(Object.keys(VIEWPORT_DEVICE)).not.toContain("1340");
  });

  it("并排多台手机时逐台量出，左上角各归各的", () => {
    const canvas = makeCanvas(1800, 2200, (set) => {
      drawFrame(set, { left: 78, top: 370, width: 784, height: 1692 });
      drawFrame(set, { left: 938, top: 418, width: 784, height: 1692 });
    });
    const crops = detectScreenCrops(canvas);

    expect(crops.map((c) => [c.left, c.top])).toEqual([
      [80, 372],
      [940, 420],
    ]);
    for (const c of crops) expect(c.css).toEqual({ width: 390, height: 844 });
  });

  /**
   * 这条来自真实画板：D-05 / D-07 / D-10 / D-13 在屏幕**中间**还有一条竖直分隔线
   * （同一块屏上下展示"空态 / 有数据"两种状态）。只把"相邻两条竖线之间"当屏的实现
   * 会算出 1454 宽的内区，不命中任何视口，于是整块屏被丢掉、脚本报"量不出屏幕内区"。
   */
  it("屏幕中间有竖直分隔线时仍然量得出", () => {
    const canvas = makeCanvas(3200, 2400, (set) => {
      drawFrame(set, { left: 78, top: 370, width: 2884, height: 1804 });
      for (let t = 0; t < 2; t++)
        for (let y = 370; y < 370 + 1804; y++) set(1534 + t, y, FRAME_BORDER);
    });
    const crops = detectScreenCrops(canvas);

    expect(crops).toHaveLength(1);
    expect(crops[0]).toMatchObject({ left: 80, top: 372, width: 2880, height: 1800 });
  });

  it("结果按左上角排序：第一块屏恒为最靠左上那块", () => {
    const canvas = makeCanvas(1800, 2200, (set) => {
      drawFrame(set, { left: 938, top: 418, width: 784, height: 1692 });
      drawFrame(set, { left: 78, top: 370, width: 784, height: 1692 });
    });
    const crops = detectScreenCrops(canvas);

    expect(crops[0]).toMatchObject({ left: 80, top: 372 });
  });

  it("只放文字没有边框时返回空", () => {
    const canvas = makeCanvas(600, 600, () => {});
    expect(detectScreenCrops(canvas)).toEqual([]);
  });
});

describe("dedupeCrops", () => {
  it("按左上角就近去重，保留先出现的", () => {
    const crops = [
      { left: 80, top: 372 },
      { left: 82, top: 374 },
      { left: 942, top: 422 },
    ];
    expect(dedupeCrops(crops)).toEqual([
      { left: 80, top: 372 },
      { left: 942, top: 422 },
    ]);
  });
});
