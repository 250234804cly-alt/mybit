# Foam Feedback Worker — 部署指南

## 架构概览

```
用户浏览器 (前端)
    │
    ▼  POST /api/feedback
Cloudflare Worker (代理)      ← Token 安全存储在这里
    │
    ▼  POST /repos/{owner}/{repo}/dispatches
GitHub API
    │
    ▼  触发 repository_dispatch 事件
GitHub Actions Workflow
    │
    ▼  自动创建 Issue
仓库 Issues 面板
```

**为什么需要 Worker？** `repository_dispatch` API 必须携带 GitHub Token 认证。如果前端直接调用，Token 会暴露在浏览器中（任何人都能看到）。Worker 做了一层安全代理——Token 存在 Cloudflare 服务端环境变量里，前端只和 Worker 通信。

---

## 你需要做的事（3 步）

### 第 1 步：创建 GitHub Fine-grained PAT

1. 打开 https://github.com/settings/tokens?type=beta
2. 点 **"Generate new token"**
3. 设置：
   - **Token name**：`foam-feedback-worker`
   - **Expiration**：90 天或更长
   - **Repository access**：选择 **Only select repositories** → 勾选 `250234804cly-alt/mybit`
   - **Permissions**：
     - ✅ **Contents** → Read and write（用于触发 `repository_dispatch`）
4. 点 **Generate token**
5. **复制保存好这个 Token**（只显示一次！）

### 第 2 步：部署 Cloudflare Worker

```bash
# 1. 安装 wrangler（如果还没装的话）
npm install -g wrangler

# 2. 登录 Cloudflare（会打开浏览器授权）
wrangler login

# 3. 进入 worker 目录
cd worker/

# 4. 部署 Worker
wrangler deploy

# 5. 设置 GitHub Token（会提示你粘贴，输入不会显示在屏幕上）
wrangler secret put GITHUB_TOKEN
# → 粘贴第 1 步创建的 Token，回车
```

部署成功后，你会看到类似这样的输出：
```
Published foam-feedback (1.2 sec)
  https://foam-feedback.chenjunyu.workers.dev
```

### 第 3 步：确认 Worker 地址

部署后检查 `foam_cannon_tool.html` 中的 `FEEDBACK_API` 地址：

```javascript
const FEEDBACK_API = "https://foam-feedback.chenjunyu.workers.dev/api/feedback";
```

如果你的 workers.dev 子域名不是 `chenjunyu`，需要改成实际地址。可以在 Cloudflare Dashboard → Workers & Pages → foam-feedback 里看到。

### 第 4 步：提交代码让 Actions 生效

```bash
git add .github/workflows/handle-feedback.yml worker/
git commit -m "feat: add feedback system (Worker proxy + GitHub Actions)"
git push
```

⚠️ **workflow 文件必须推到 `main` 分支后才能响应 `repository_dispatch` 事件。**

---

## 验证

部署完成后，打开 https://junyuchen.cn/foam_cannon_tool.html ，在底部"建议 & 勘误"区域提交一条测试反馈。

如果一切正常，你会在仓库的 **Issues** 面板看到一个自动创建的 Issue，带有 `feedback` 标签。

---

## 文件说明

| 文件 | 作用 |
|------|------|
| `worker/feedback-worker.js` | Cloudflare Worker 代理（~80 行），接收反馈、调用 GitHub API |
| `worker/wrangler.toml` | Worker 配置文件 |
| `.github/workflows/handle-feedback.yml` | GitHub Actions workflow，将反馈自动创建为 Issue |

## 费用

- **Cloudflare Workers Free Plan**：每天 10 万次请求，对反馈量来说完全够用
- **GitHub Actions**：公共仓库免费，私有仓库每月 2000 分钟

---

## 调试

如果提交反馈后没有生成 Issue：

1. **检查 Worker 日志**：`wrangler tail`（实时查看 Worker 日志）
2. **检查 Actions 运行**：仓库 → Actions 标签页 → 看看有没有 "Handle User Feedback" 的运行记录
3. **常见问题**：
   - Token 过期 → 重新创建并 `wrangler secret put GITHUB_TOKEN`
   - Token 权限不够 → 确保有 Contents read/write
   - CORS 报错 → 检查 `wrangler.toml` 中的 `ALLOWED_ORIGIN`
