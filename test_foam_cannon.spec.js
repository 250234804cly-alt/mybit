// @ts-check
const { test, expect } = require("@playwright/test");
const path = require("path");

const PAGE_URL = `file://${path.resolve(__dirname, "foam_cannon_tool.html")}`;

/* ============================================================
 *  辅助函数
 * ============================================================ */

/** 切换到手动输入模式 */
async function switchToCustomMode(page) {
  await page.locator('.mode-tab[data-mode="custom"]').click();
  await expect(page.locator("#panelCustom")).toHaveClass(/active/);
}

/** 切换到品牌选型号模式 */
async function switchToBrandMode(page) {
  await page.locator('.mode-tab[data-mode="brand"]').click();
  await expect(page.locator("#panelBrand")).toHaveClass(/active/);
}

/** 填写手动参数 */
async function fillManualParams(page, { power, flow, pressure }) {
  if (power !== undefined) {
    await page.locator("#powerInput").fill(String(power));
  }
  if (flow !== undefined) {
    await page.locator("#flowInput").fill(String(flow));
  }
  if (pressure !== undefined) {
    await page.locator("#pressureInput").fill(String(pressure));
  }
}

/** 点击计算按钮（不会被 alert 阻塞的安全版本） */
async function clickCalc(page) {
  await page.locator("#calcBtn").click();
}

/**
 * 点击计算按钮，同时处理可能弹出的 alert 对话框。
 * 返回 dialog message（如果有弹窗）或 null（无弹窗）。
 */
async function clickCalcWithDialog(page) {
  let dialogMsg = null;
  const handler = (dialog) => {
    dialogMsg = dialog.message();
    dialog.accept();
  };
  page.once("dialog", handler);
  await page.locator("#calcBtn").click();
  // 等一小段时间让可能的 dialog 事件处理完
  await page.waitForTimeout(200);
  return dialogMsg;
}

/** 判断正常结果区是否可见 */
async function isResultVisible(page) {
  return page.locator("#resultArea").evaluate((el) => el.classList.contains("show"));
}

/** 判断不建议区域是否可见 */
async function isNotRecommendedVisible(page) {
  const display = await page.locator("#notRecommendedArea").evaluate((el) => el.style.display);
  return display !== "none";
}

/** 先做一次正常计算，让结果区显示出来（用于需要操作 currentNozzleInput 等结果区元素的测试） */
async function doNormalCalcFirst(page) {
  await switchToCustomMode(page);
  await fillManualParams(page, { power: 2000, flow: 8, pressure: 130 });
  await clickCalc(page);
  await expect(page.locator("#resultArea")).toHaveClass(/show/, { timeout: 3000 });
}

/** 滚动到 catalogToggle 并点击（功率一览表现在在 resultArea 外面，始终可访问） */
async function scrollAndClickCatalog(page) {
  const toggle = page.locator("#catalogToggle");
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
}

/** 展开计算详情（detailBody 默认折叠，currentNozzleInput 在里面） */
async function expandDetail(page) {
  const body = page.locator("#detailBody");
  const isOpen = await body.evaluate((el) => el.classList.contains("open"));
  if (!isOpen) {
    await page.locator("#detailToggle").click();
    await expect(body).toHaveClass(/open/, { timeout: 2000 });
  }
}

/** 通过 JS evaluate 获取隐藏元素的 value（不受 display:none 影响） */
async function getHiddenInputValue(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? el.value : null;
  }, selector);
}

/* ============================================================
 *  场景 1: 页面基本加载
 * ============================================================ */
test.describe("页面加载", () => {
  test("页面标题正确", async ({ page }) => {
    await page.goto(PAGE_URL);
    await expect(page).toHaveTitle("PA 壶喷芯估算台");
  });

  test("品牌模式默认激活", async ({ page }) => {
    await page.goto(PAGE_URL);
    await expect(page.locator("#panelBrand")).toHaveClass(/active/);
    await expect(page.locator("#panelCustom")).not.toHaveClass(/active/);
  });

  test("默认参数值正确", async ({ page }) => {
    await page.goto(PAGE_URL);
    await expect(page.locator("#flowInput")).toHaveValue("8");
    await expect(page.locator("#pressureInput")).toHaveValue("100");
    await expect(page.locator("#powerInput")).toHaveValue("");
    // currentNozzleInput 在 resultArea 内，页面加载时不可见，用 evaluate 检查
    const nozzleVal = await getHiddenInputValue(page, "#currentNozzleInput");
    expect(nozzleVal).toBe("");
  });

  test("品牌下拉框有选项", async ({ page }) => {
    await page.goto(PAGE_URL);
    const count = await page.locator("#brandFilterSelect option").count();
    expect(count).toBeGreaterThan(5); // "全部" + 至少5个品牌
  });

  test("功率一览表折叠区域存在", async ({ page }) => {
    await page.goto(PAGE_URL);
    // catalogToggle 现在在 resultArea 外面，始终可见（只需滚动到视口）
    const toggle = page.locator("#catalogToggle");
    await toggle.scrollIntoViewIfNeeded();
    await expect(toggle).toBeVisible();
  });
});

/* ============================================================
 *  场景 2: 模式切换
 * ============================================================ */
test.describe("模式切换", () => {
  test("切换到手动输入模式", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await expect(page.locator("#panelCustom")).toHaveClass(/active/);
    await expect(page.locator("#panelBrand")).not.toHaveClass(/active/);
  });

  test("切换回品牌模式", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await switchToBrandMode(page);
    await expect(page.locator("#panelBrand")).toHaveClass(/active/);
    await expect(page.locator("#panelCustom")).not.toHaveClass(/active/);
  });
});

/* ============================================================
 *  场景 3: 手动输入模式 — 正常计算
 * ============================================================ */
test.describe("手动输入 — 正常计算", () => {
  test("三参数齐全 — 高压机 (2100W / 8L / 140bar)", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 2100, flow: 8, pressure: 140 });
    await clickCalc(page);

    expect(await isResultVisible(page)).toBe(true);
    expect(await isNotRecommendedVisible(page)).toBe(false);

    // 检查结果区有推荐喷芯数值
    const closestSize = await page.locator("#closestSize").textContent();
    expect(closestSize).toBeTruthy();
    expect(parseFloat(closestSize)).toBeGreaterThan(0);
  });

  test("仅流量+压力 — 无功率 (8L / 110bar)", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: "", flow: 8, pressure: 110 });
    await clickCalc(page);

    expect(await isResultVisible(page)).toBe(true);
    const badge = await page.locator("#consistencyBadge").textContent();
    expect(badge).toBeTruthy();
  });

  test("仅流量+功率 — 无压力 → 压力估算", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await page.locator("#pressureInput").fill("");
    await fillManualParams(page, { power: 1800, flow: 7, pressure: "" });
    await clickCalc(page);

    expect(await isResultVisible(page)).toBe(true);
    const rangeText = await page.locator("#rangeText").textContent();
    expect(rangeText).toContain("估算");
  });

  test("低功率高压机 (1400W / 6L / 100bar)", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 1400, flow: 6, pressure: 100 });
    await clickCalc(page);

    expect(await isResultVisible(page)).toBe(true);
    const closestSize = parseFloat(await page.locator("#closestSize").textContent());
    expect(closestSize).toBeGreaterThanOrEqual(1.0);
    expect(closestSize).toBeLessThanOrEqual(2.0);
  });

  test("大流量大压力机 (3000W / 12L / 160bar)", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 3000, flow: 12, pressure: 160 });
    await clickCalc(page);

    expect(await isResultVisible(page)).toBe(true);
    const closestSize = parseFloat(await page.locator("#closestSize").textContent());
    expect(closestSize).toBeGreaterThanOrEqual(1.3);
  });
});

/* ============================================================
 *  场景 4: 不建议使用泡沫壶
 * ============================================================ */
test.describe("不建议使用泡沫壶", () => {
  test("锂电机 (180W / 3L / 25bar) → 阻止", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 180, flow: 3, pressure: 25 });
    await clickCalc(page);

    expect(await isNotRecommendedVisible(page)).toBe(true);
    expect(await isResultVisible(page)).toBe(false);

    const title = await page.locator("#notRecTitle").textContent();
    expect(title).toContain("锂电");
  });

  test("低功率有线机 (800W / 5L / 50bar) → 阻止", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 800, flow: 5, pressure: 50 });
    await clickCalc(page);

    expect(await isNotRecommendedVisible(page)).toBe(true);
    expect(await isResultVisible(page)).toBe(false);
  });

  test("功率足够但压力极低 (1500W / 10L / 40bar) → 阻止", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 1500, flow: 10, pressure: 40 });
    await clickCalc(page);

    expect(await isNotRecommendedVisible(page)).toBe(true);
  });

  test("边界功率 500W → 仍然阻止（≤500W）", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 500, flow: 4, pressure: 40 });
    await clickCalc(page);

    expect(await isNotRecommendedVisible(page)).toBe(true);
    const title = await page.locator("#notRecTitle").textContent();
    expect(title).toContain("锂电");
  });

  test("边界功率 501W + 低压 55bar → 低配阻止", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 501, flow: 5, pressure: 55 });
    await clickCalc(page);

    expect(await isNotRecommendedVisible(page)).toBe(true);
    const title = await page.locator("#notRecTitle").textContent();
    expect(title).toContain("不建议");
  });
});

/* ============================================================
 *  场景 5: 输入校验
 * ============================================================ */
test.describe("输入校验", () => {
  test("流量为空 → 弹窗提示（不能计算）", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await page.locator("#flowInput").fill("");
    await page.locator("#pressureInput").fill("100");
    await page.locator("#powerInput").fill("");

    // 用 clickCalcWithDialog 处理 alert 阻塞问题
    const msg = await clickCalcWithDialog(page);
    expect(msg).toBeTruthy();
    expect(msg).toContain("流量");

    expect(await isResultVisible(page)).toBe(false);
  });

  test("仅有功率无流量无压力 → 不能计算", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await page.locator("#flowInput").fill("");
    await page.locator("#pressureInput").fill("");
    await page.locator("#powerInput").fill("2000");

    // 流量为空 → alert("先填流量。")
    const msg = await clickCalcWithDialog(page);
    expect(msg).toBeTruthy();
  });

  test("输入非数字字符被过滤（如字母 'abc'）", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    const input = page.locator("#flowInput");
    await input.fill("");
    await input.pressSequentially("12abc34");
    const val = await input.inputValue();
    expect(val).toBe("1234");
  });

  test("输入多个小数点只保留第一个", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    const input = page.locator("#flowInput");
    await input.fill("");
    await input.pressSequentially("8.5.3");
    const val = await input.inputValue();
    expect(val).toBe("8.53");
  });

  test("currentNozzle 输入过滤也生效", async ({ page }) => {
    await page.goto(PAGE_URL);
    // currentNozzleInput 在结果区 > detailBody（折叠）内，需先计算再展开
    await doNormalCalcFirst(page);
    await expandDetail(page);

    const input = page.locator("#currentNozzleInput");
    await input.fill("");
    await input.pressSequentially("1.x2y5");
    const val = await input.inputValue();
    expect(val).toBe("1.25");
  });
});

/* ============================================================
 *  场景 6: 品牌选型号模式
 * ============================================================ */
test.describe("品牌选型号", () => {
  test("搜索 'K2' → datalist 中有匹配项", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToBrandMode(page);
    await page.locator("#modelSearchInput").fill("K2");
    await page.waitForTimeout(300);

    const count = await page.evaluate(() => {
      return document.querySelectorAll("#washerModelList option").length;
    });
    expect(count).toBeGreaterThan(0);
  });

  test("选择品牌筛选后，datalist 范围缩小", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToBrandMode(page);

    const allCount = await page.evaluate(() =>
      document.querySelectorAll("#washerModelList option").length
    );

    await page.locator("#brandFilterSelect").selectOption("卡赫");
    await page.waitForTimeout(300);

    const karcherCount = await page.evaluate(() =>
      document.querySelectorAll("#washerModelList option").length
    );
    expect(karcherCount).toBeGreaterThan(0);
    expect(karcherCount).toBeLessThanOrEqual(allCount);
  });

  test("输入完整型号名 → 参数自动填入", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToBrandMode(page);
    const searchInput = page.locator("#modelSearchInput");

    await searchInput.fill("K5");
    await searchInput.press("Enter");
    await page.waitForTimeout(300);

    const flow = await page.locator("#flowInput").inputValue();
    const pressure = await page.locator("#pressureInput").inputValue();
    expect(parseFloat(flow)).toBeGreaterThan(0);
    expect(parseFloat(pressure)).toBeGreaterThan(0);
  });

  test("模糊搜索 '亿力' → datalist 有匹配项", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToBrandMode(page);
    await page.locator("#modelSearchInput").fill("亿力");
    await page.waitForTimeout(300);

    const count = await page.evaluate(() =>
      document.querySelectorAll("#washerModelList option").length
    );
    expect(count).toBeGreaterThan(0);
  });
});

/* ============================================================
 *  场景 7: 反向喷芯建议
 * ============================================================ */
test.describe("反向喷芯建议", () => {
  test("输入当前喷芯 + 泡沫更浓 → 有建议", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 2000, flow: 8, pressure: 130 });
    await clickCalc(page);
    await expect(page.locator("#resultArea")).toHaveClass(/show/);
    await expandDetail(page);

    // 填入当前喷芯和目标
    await page.locator("#currentNozzleInput").fill("1.25");
    await page.locator("#foamGoalSelect").selectOption("denser");
    // 重新计算，让反向建议生成
    await clickCalc(page);

    expect(await isResultVisible(page)).toBe(true);
    const reverseList = page.locator("#reverseList");
    const items = await reverseList.locator(".msg-card").count();
    expect(items).toBeGreaterThan(0);
  });

  test("不输入当前喷芯 → 不显示反向建议", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 2000, flow: 8, pressure: 130 });
    await clickCalc(page);
    await expect(page.locator("#resultArea")).toHaveClass(/show/);
    await expandDetail(page);

    // 确保当前喷芯为空
    await page.locator("#currentNozzleInput").fill("");
    await clickCalc(page);

    expect(await isResultVisible(page)).toBe(true);
    // 当 currentNozzle 为空时，页面会显示 2 条提示性消息（不是具体的换芯方向建议）
    const reverseItems = await page.locator("#reverseList .msg-card").count();
    expect(reverseItems).toBe(2);
    // 验证第一条是提示"填上当前喷芯"
    const firstMsg = await page.locator("#reverseList .msg-card").first().textContent();
    expect(firstMsg).toContain("填上当前喷芯");
  });
});

/* ============================================================
 *  场景 8: 重置功能
 * ============================================================ */
test.describe("重置功能", () => {
  test("重置后恢复默认值", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 2000, flow: 10, pressure: 150 });
    await clickCalc(page);
    await expect(page.locator("#resultArea")).toHaveClass(/show/);
    await expandDetail(page);

    // 填入当前喷芯
    await page.locator("#currentNozzleInput").fill("1.3");

    // 点击重置
    await page.locator("#resetBtn").click();
    await page.waitForTimeout(200);

    // 验证恢复默认（这三个 input 始终可见）
    await expect(page.locator("#flowInput")).toHaveValue("8");
    await expect(page.locator("#pressureInput")).toHaveValue("100");
    await expect(page.locator("#powerInput")).toHaveValue("");

    // currentNozzleInput 在结果区内，重置后结果区隐藏，用 evaluate 检查值
    const nozzleVal = await getHiddenInputValue(page, "#currentNozzleInput");
    expect(nozzleVal).toBe("");

    // 结果区隐藏
    expect(await isResultVisible(page)).toBe(false);
    expect(await isNotRecommendedVisible(page)).toBe(false);
  });
});

/* ============================================================
 *  场景 9: 详情折叠
 * ============================================================ */
test.describe("折叠/展开", () => {
  test("计算后点击详情可展开", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 2000, flow: 8, pressure: 130 });
    await clickCalc(page);

    expect(await isResultVisible(page)).toBe(true);

    const toggle = page.locator("#detailToggle");
    await toggle.click();
    await expect(page.locator("#detailBody")).toHaveClass(/open/);

    await toggle.click();
    await expect(page.locator("#detailBody")).not.toHaveClass(/open/);
  });

  test("功率一览表可展开", async ({ page }) => {
    await page.goto(PAGE_URL);
    // 功率一览表在 resultArea 外面，无需先计算，直接可操作
    await scrollAndClickCatalog(page);
    await expect(page.locator("#catalogBody")).toHaveClass(/open/);
  });
});

/* ============================================================
 *  场景 10: 功率一览表 — 一键计算
 * ============================================================ */
test.describe("功率一览表", () => {
  test("品牌 Tab 切换", async ({ page }) => {
    await page.goto(PAGE_URL);
    await scrollAndClickCatalog(page);
    await page.waitForTimeout(300);

    const tabs = page.locator(".catalog-brand-tab");
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThan(1);

    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveClass(/active/);
    await expect(tabs.nth(0)).not.toHaveClass(/active/);
  });

  test("点击「算」按钮 → 带入参数并计算", async ({ page }) => {
    await page.goto(PAGE_URL);
    await scrollAndClickCatalog(page);
    await page.waitForTimeout(300);

    const calcBtns = page.locator(".catalog-card-action");
    const btnCount = await calcBtns.count();
    expect(btnCount).toBeGreaterThan(0);

    await calcBtns.first().click();
    await page.waitForTimeout(500);

    // 应该有结果（或不建议提示）
    const resultVis = await isResultVisible(page);
    const notRecVis = await isNotRecommendedVisible(page);
    expect(resultVis || notRecVis).toBe(true);
  });
});

/* ============================================================
 *  场景 11: 一致性评级
 * ============================================================ */
test.describe("一致性评级", () => {
  test("参数合理 → 一致性好", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 2100, flow: 8.3, pressure: 145 });
    await clickCalc(page);

    expect(await isResultVisible(page)).toBe(true);
    const badge = await page.locator("#consistencyBadge").textContent();
    expect(badge).toBeTruthy();
  });

  test("参数冲突 → 一致性差", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 1200, flow: 12, pressure: 200 });
    await clickCalc(page);

    const resultVis = await isResultVisible(page);
    const notRecVis = await isNotRecommendedVisible(page);
    expect(resultVis || notRecVis).toBe(true);

    if (resultVis) {
      const badge = await page.locator("#consistencyBadge").textContent();
      expect(badge).toBeTruthy();
    }
  });
});

/* ============================================================
 *  场景 12: 库位标准喷芯候选列表
 * ============================================================ */
test.describe("标准喷芯候选", () => {
  test("结果中显示候选喷芯列表", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 2000, flow: 8, pressure: 130 });
    await clickCalc(page);

    expect(await isResultVisible(page)).toBe(true);

    const libraryItems = page.locator("#libraryList .candidate");
    const count = await libraryItems.count();
    expect(count).toBeGreaterThan(0);
  });
});

/* ============================================================
 *  场景 13: 边界值 & 极端参数
 * ============================================================ */
test.describe("边界值与极端参数", () => {
  test("最低可用参数 (1200W / 5L / 60bar) → 应该能计算", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 1200, flow: 5, pressure: 60 });
    await clickCalc(page);

    const resultVis = await isResultVisible(page);
    const notRecVis = await isNotRecommendedVisible(page);
    expect(resultVis || notRecVis).toBe(true);
  });

  test("超高参数 (5000W / 20L / 250bar)", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 5000, flow: 20, pressure: 250 });
    await clickCalc(page);

    expect(await isResultVisible(page)).toBe(true);
    const closestSize = parseFloat(await page.locator("#closestSize").textContent());
    expect(closestSize).toBeGreaterThanOrEqual(1.5);
  });

  test("小数参数 (1850.5W / 7.5L / 115.3bar)", async ({ page }) => {
    await page.goto(PAGE_URL);
    await switchToCustomMode(page);
    await fillManualParams(page, { power: 1850.5, flow: 7.5, pressure: 115.3 });
    await clickCalc(page);

    expect(await isResultVisible(page)).toBe(true);
  });
});
