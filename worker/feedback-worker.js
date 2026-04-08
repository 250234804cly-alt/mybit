/**
 * Foam Cannon Calculator — Feedback Worker
 *
 * 接收前端反馈 POST 请求，通过 GitHub API 创建 Issue。
 * 环境变量:
 *   GITHUB_REPO    — "owner/repo" 格式
 *   ALLOWED_ORIGIN — 允许跨域的前端域名
 *   GITHUB_TOKEN   — (secret) GitHub Fine-grained PAT
 */

export default {
  async fetch(request, env) {
    // ---- CORS 预检 ----
    if (request.method === "OPTIONS") {
      return handleCORS(env);
    }

    // 只接受 POST
    if (request.method !== "POST") {
      return jsonResp({ error: "Method not allowed" }, 405, env);
    }

    // ---- 校验 Origin ----
    const origin = request.headers.get("Origin") || "";
    if (env.ALLOWED_ORIGIN && !origin.startsWith(env.ALLOWED_ORIGIN)) {
      return jsonResp({ error: "Forbidden origin" }, 403, env);
    }

    try {
      const body = await request.json();
      const { type } = body; // "errata" | "suggestion"

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
  },
};

// ========== 处理勘误 / 新机型 ==========
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

// ========== 处理建议 ==========
async function handleSuggestion(body, env) {
  const { content } = body;
  if (!content || !content.trim()) {
    return jsonResp({ error: "Content is required" }, 400, env);
  }

  const title = `💡 [suggestion] ${content.slice(0, 60)}${content.length > 60 ? "..." : ""}`;
  const mdBody = `### 用户建议\n\n${content}`;

  return await createIssue(title, mdBody, ["suggestion", "feedback"], env);
}

// ========== 调用 GitHub API 创建 Issue ==========
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

// ========== 工具函数 ==========
function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
