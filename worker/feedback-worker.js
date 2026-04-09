/**
 * Foam Cannon Calculator — Feedback & Analytics Worker
 *
 * 路由:
 *   POST /api/feedback  — 用户反馈 → GitHub Issue
 *   POST /api/track     — 前端埋点事件 → KV 聚合存储
 *   GET  /api/stats     — 统计数据查询（需 ?key=STATS_SECRET）
 *
 * 环境变量 / Secrets:
 *   GITHUB_REPO    — "owner/repo"
 *   ALLOWED_ORIGIN — 前端域名
 *   GITHUB_TOKEN   — (secret) GitHub PAT
 *   STATS_SECRET   — (secret) 统计接口访问密钥
 *
 * KV Namespace Binding:
 *   ANALYTICS      — KV namespace，用于存储聚合计数
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---- CORS 预检 ----
    if (request.method === "OPTIONS") {
      return handleCORS(env);
    }

    // ---- 路由分发 ----
    if (path === "/api/feedback" && request.method === "POST") {
      return handleFeedback(request, env);
    }

    if (path === "/api/track" && request.method === "POST") {
      return handleTrack(request, env);
    }

    if (path === "/api/stats" && request.method === "GET") {
      return handleStats(url, env);
    }

    return jsonResp({ error: "Not found" }, 404, env);
  },
};

// ==================== 反馈模块（原有逻辑） ====================

async function handleFeedback(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (env.ALLOWED_ORIGIN && !origin.startsWith(env.ALLOWED_ORIGIN)) {
    return jsonResp({ error: "Forbidden origin" }, 403, env);
  }

  try {
    const body = await request.json();
    const { type } = body;

    if (type === "errata") {
      return await handleErrata(body, env);
    } else if (type === "suggestion") {
      return await handleSuggestion(body, env);
    } else {
      return jsonResp({ error: 'Invalid type, expected "errata" or "suggestion"' }, 400, env);
    }
  } catch (err) {
    return jsonResp({ error: "Bad request: " + err.message }, 400, env);
  }
}

async function handleErrata(body, env) {
  const { brand, model, power, flow, pressure, nozzleType, notes, subType } = body;

  if (!brand && !model && !notes) {
    return jsonResp({ error: "At least brand/model or notes required" }, 400, env);
  }

  const label = subType === "new" ? "new-model" : "errata";
  const emoji = subType === "new" ? "🆕" : "🔧";
  const title = `${emoji} [${label}] ${brand || "?"} ${model || "?"}`;

  const lines = [
    `### ${subType === "new" ? "新机型提交" : "数据勘误"}`,
    "",
    `| 字段 | 值 |`,
    `|------|------|`,
    `| 品牌 | ${brand || "-"} |`,
    `| 型号 | ${model || "-"} |`,
    `| 功率 (W) | ${power || "-"} |`,
    `| 流量 (L/min) | ${flow || "-"} |`,
    `| 压力 (MPa) | ${pressure || "-"} |`,
    `| 喷嘴类型 | ${nozzleType || "-"} |`,
    "",
    `**备注:** ${notes || "无"}`,
  ];

  return await createIssue(title, lines.join("\n"), [label, "feedback"], env);
}

async function handleSuggestion(body, env) {
  const { content } = body;
  if (!content || !content.trim()) {
    return jsonResp({ error: "Content is required" }, 400, env);
  }

  const title = `💡 [suggestion] ${content.slice(0, 60)}${content.length > 60 ? "..." : ""}`;
  const mdBody = `### 用户建议\n\n${content}`;

  return await createIssue(title, mdBody, ["suggestion", "feedback"], env);
}

async function createIssue(title, body, labels, env) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/issues`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "foam-feedback-worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body, labels }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    console.error("GitHub API error:", resp.status, detail);
    return jsonResp({ error: "Failed to create issue", status: resp.status }, 502, env);
  }

  const issue = await resp.json();
  return jsonResp({ ok: true, issue_url: issue.html_url, issue_number: issue.number }, 201, env);
}

// ==================== 埋点模块 ====================

/**
 * 事件格式:
 * {
 *   "event": "calculate" | "select_model" | "feedback_submit" | "page_view" | "detail_toggle" | "share",
 *   "props": { "brand": "绿田", "model": "G5", ... }  // 可选
 *   "page": "index" | "tool"                            // 来源页面
 * }
 *
 * KV 存储设计（聚合计数，不存明细）:
 *   key 格式:  {event}:{date}           → 当日总计数
 *              {event}:{date}:{prop}    → 分维度计数
 *   例如:
 *     calculate:2026-04-08              → 42
 *     select_model:2026-04-08:绿田_G5   → 7
 *     page_view:2026-04-08:index        → 120
 */

const ALLOWED_EVENTS = new Set([
  "calculate",       // 点击计算
  "select_model",    // 选择机型
  "feedback_submit", // 提交反馈
  "page_view",       // 页面加载
  "detail_toggle",   // 展开计算详情
  "share",           // 分享结果
  "catalog_use",     // 使用型号库"算"按钮
  "advanced_param",  // 使用高级参数
]);

async function handleTrack(request, env) {
  // 宽松 origin 校验（埋点允许合法来源）
  const origin = request.headers.get("Origin") || "";
  if (env.ALLOWED_ORIGIN && !origin.startsWith(env.ALLOWED_ORIGIN)) {
    return jsonResp({ error: "Forbidden" }, 403, env);
  }

  if (!env.ANALYTICS) {
    return jsonResp({ error: "Analytics KV not configured" }, 500, env);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResp({ error: "Invalid JSON" }, 400, env);
  }

  const { event, props, page } = body;

  if (!event || !ALLOWED_EVENTS.has(event)) {
    return jsonResp({ error: `Unknown event: ${event}` }, 400, env);
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // 1) 总计数 +1
  const totalKey = `${event}:${today}`;
  await kvIncrement(env.ANALYTICS, totalKey);

  // 2) 按来源页面 +1
  if (page) {
    const pageKey = `${event}:${today}:page:${page}`;
    await kvIncrement(env.ANALYTICS, pageKey);
  }

  // 3) 按属性维度 +1（前 3 个 prop）
  if (props && typeof props === "object") {
    const entries = Object.entries(props).slice(0, 3);
    for (const [k, v] of entries) {
      if (v !== undefined && v !== null && v !== "") {
        const propKey = `${event}:${today}:${k}:${String(v).slice(0, 50)}`;
        await kvIncrement(env.ANALYTICS, propKey);
      }
    }
  }

  // 4) 全局累计（不按日期）
  const globalKey = `total:${event}`;
  await kvIncrement(env.ANALYTICS, globalKey);

  return jsonResp({ ok: true }, 200, env);
}

async function kvIncrement(kv, key) {
  const val = await kv.get(key);
  const count = (parseInt(val, 10) || 0) + 1;
  await kv.put(key, String(count));
}

// ==================== 统计查询模块 ====================

async function handleStats(url, env) {
  // 简单密钥验证
  const key = url.searchParams.get("key");
  if (!env.STATS_SECRET || key !== env.STATS_SECRET) {
    return jsonResp({ error: "Unauthorized" }, 401, env);
  }

  if (!env.ANALYTICS) {
    return jsonResp({ error: "Analytics KV not configured" }, 500, env);
  }

  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const eventFilter = url.searchParams.get("event"); // 可选：只查某事件

  // 拉取全局累计
  const globalStats = {};
  for (const evt of ALLOWED_EVENTS) {
    const val = await env.ANALYTICS.get(`total:${evt}`);
    if (val) globalStats[evt] = parseInt(val, 10);
  }

  // 拉取指定日期的事件计数
  const dailyStats = {};
  const events = eventFilter ? [eventFilter] : [...ALLOWED_EVENTS];

  for (const evt of events) {
    const totalKey = `${evt}:${date}`;
    const val = await env.ANALYTICS.get(totalKey);
    if (val) dailyStats[evt] = parseInt(val, 10);
  }

  // 拉取维度明细（list prefix）
  const dimensions = {};
  if (eventFilter) {
    const prefix = `${eventFilter}:${date}:`;
    const list = await env.ANALYTICS.list({ prefix, limit: 100 });
    for (const key of list.keys) {
      const val = await env.ANALYTICS.get(key.name);
      const suffix = key.name.slice(prefix.length);
      dimensions[suffix] = parseInt(val, 10);
    }
  }

  return jsonResp({
    date,
    global_totals: globalStats,
    daily: dailyStats,
    dimensions: Object.keys(dimensions).length > 0 ? dimensions : undefined,
  }, 200, env);
}

// ==================== 工具函数 ====================

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function handleCORS(env) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

function jsonResp(data, status, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(env),
    },
  });
}
