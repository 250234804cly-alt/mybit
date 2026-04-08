/**
 * Foam Cannon Feedback Proxy Worker
 *
 * 极简代理：接收前端反馈 → 分类标注 → 调用 GitHub repository_dispatch → 触发 Actions 创建 Issue
 * Token 存在 Cloudflare 环境变量（Secret）中，前端永远不会接触到。
 */

// 反馈分类 → GitHub labels 映射
const CATEGORY_LABELS = {
  // errata 类
  "wrong-data":      { label: "数据有误",   emoji: "❌", ghLabels: ["feedback", "errata", "wrong-data"] },
  "missing-model":   { label: "缺少机型",   emoji: "➕", ghLabels: ["feedback", "errata", "new-model"] },
  "discontinued":    { label: "停产换代",   emoji: "🔄", ghLabels: ["feedback", "errata", "discontinued"] },
  // suggestion 类
  "feature":         { label: "功能需求",   emoji: "🚀", ghLabels: ["feedback", "suggestion", "feature"] },
  "ui":              { label: "界面体验",   emoji: "🎨", ghLabels: ["feedback", "suggestion", "ui"] },
  "calculation":     { label: "计算逻辑",   emoji: "🔢", ghLabels: ["feedback", "suggestion", "calculation"] },
  "data":            { label: "数据相关",   emoji: "📊", ghLabels: ["feedback", "suggestion", "data-request"] },
  "other":           { label: "其他",       emoji: "💬", ghLabels: ["feedback", "other"] },
};

function classifyFeedback(feedback) {
  if (feedback.type === "errata") {
    const key = feedback.errataType || "other";
    const meta = CATEGORY_LABELS[key] || CATEGORY_LABELS["other"];
    return { category: key, ...meta };
  } else {
    const key = feedback.category || "other";
    const meta = CATEGORY_LABELS[key] || CATEGORY_LABELS["other"];
    return { category: key, ...meta };
  }
}

export default {
  async fetch(request, env) {
    // CORS 预检
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(env.ALLOWED_ORIGIN || "*"),
      });
    }

    // 只接受 POST /api/feedback
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/api/feedback") {
      return jsonResponse(404, { error: "Not Found" }, env.ALLOWED_ORIGIN);
    }

    try {
      const body = await request.json();

      // 基本校验
      if (!body.type || !["errata", "suggestion"].includes(body.type)) {
        return jsonResponse(400, { error: "Invalid feedback type" }, env.ALLOWED_ORIGIN);
      }

      // 分类标注
      const classification = classifyFeedback(body);

      // 调用 GitHub repository_dispatch
      const ghRes = await fetch(
        `https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "foam-feedback-worker",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({
            event_type: "user-feedback",
            client_payload: {
              feedback: body,
              classification: classification,
              submitted_at: new Date().toISOString(),
            },
          }),
        }
      );

      if (ghRes.status === 204) {
        return jsonResponse(200, { ok: true, message: "反馈已提交，感谢！" }, env.ALLOWED_ORIGIN);
      }

      const ghErr = await ghRes.text();
      console.error("GitHub API error:", ghRes.status, ghErr);
      return jsonResponse(502, { error: "提交失败，请稍后重试" }, env.ALLOWED_ORIGIN);
    } catch (e) {
      console.error("Worker error:", e);
      return jsonResponse(500, { error: "服务器内部错误" }, env.ALLOWED_ORIGIN);
    }
  },
};

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(status, data, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}
