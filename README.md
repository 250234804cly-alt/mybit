# PA 壶喷芯估算台 ⚡

> 选洗车机型号或手动填参数，一键算出推荐喷芯大小。  
> 在线体验 → **[junyuchen.cn](https://junyuchen.cn)**

---

## ✨ 功能亮点

### 🧮 核心计算
- **双模式输入** — 品牌型号选择 / 手动填写参数，随意切换
- **30+ 机型数据库** — 覆盖凯驰、亿力、指南车、绿田、莱姆、Ryobi 等 10 个品牌
- **科学计算引擎** — 基于伯努利 + 孔口流量模型 `Q = Cd × A × √(2ΔP / ρ)`
- **候选喷芯列表** — 给出最接近的喷芯型号，标注偏差百分比
- **MJJC 3.0 甜区基线** — 以 MJJC 3.0 最佳出泡区间为参照给出实用建议

### 🔍 智能检测
- **不推荐机型识别** — 自动拦截功率不足 / 电池便携机型，给出明确提示而非误导计算
- **反向喷芯建议** — 已有喷芯？反过来帮你找匹配的洗车机参数
- **高压力警告** — 压力偏高时提示可能对泡沫壶不友好

### 💬 用户反馈
- **数据勘误** — 发现参数不对？直接提交修正
- **新机型提报** — 数据库没有你的机器？一键提交收录
- **功能建议** — 任何改进想法都可以提
- 所有反馈自动创建 GitHub Issue，带标签分类

### 📱 体验细节
- 完美适配手机 — 触摸优化 + 安全区域 + 底部固定计算按钮
- 暗色毛玻璃主题 — Glassmorphism 设计语言
- 响应式三断点 — 768px / 600px / 380px
- SEO 优化 — Structured Data、Open Graph、canonical URL

---

## 🏗 架构

```
┌──────────────────────────┐
│  index.html (单文件 SPA) │  ← GitHub Pages
│  - 机型数据库            │     junyuchen.cn
│  - 计算引擎              │
│  - 反馈表单              │
└──────────┬───────────────┘
           │ POST /feedback
           ▼
┌──────────────────────────┐
│  Cloudflare Worker       │  ← foam-feedback.xxx.workers.dev
│  feedback-worker.js      │
│  - CORS 校验             │
│  - 请求路由 (勘误/建议)  │
│  - GitHub Issue 创建     │
└──────────┬───────────────┘
           │ GitHub API
           ▼
┌──────────────────────────┐
│  GitHub Issues           │  ← 250234804cly-alt/mybit
│  - errata / new-model    │
│  - suggestion            │
│  - feedback              │
└──────────────────────────┘
```

## 🛠 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | HTML5 + CSS3 + 原生 JS | 单文件零依赖（仅 Google Fonts CDN） |
| 后端 | Cloudflare Workers | 反馈代理，转发到 GitHub API |
| 托管 | GitHub Pages | 自定义域名 `junyuchen.cn` |
| 反馈存储 | GitHub Issues | 自动标签分类 |

---

## 🚀 部署指南

### 前端（GitHub Pages）

```bash
# 推送到 GitHub
git add .
git commit -m "deploy"
git push origin main

# 仓库 Settings → Pages → Source: main branch → Save
# 自定义域名: 添加 CNAME 文件 + DNS 配置
```

### 反馈后端（Cloudflare Worker）

```bash
cd worker

# 安装 wrangler CLI（如果还没装）
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 配置 GitHub Token（密钥，不写进代码）
wrangler secret put GITHUB_TOKEN
# 粘贴你的 GitHub Fine-grained PAT

# 部署
wrangler deploy
```

Worker 配置文件 `worker/wrangler.toml`：
- `GITHUB_REPO` — 反馈 Issue 目标仓库
- `ALLOWED_ORIGIN` — 允许跨域的前端域名
- `GITHUB_TOKEN` — 通过 `wrangler secret` 管理，**绝不写入代码**

### 部署后检查清单

- [x] `CNAME` 文件指向 `junyuchen.cn`
- [x] DNS 记录配置正确（GitHub Pages IP）
- [x] `index.html` 中 `canonical`、`og:url` 指向真实地址
- [x] Worker 已部署且 `GITHUB_TOKEN` secret 已设置
- [x] 前端反馈 API 地址指向部署后的 Worker URL

---

## 📁 项目结构

```
.
├── index.html                  # 主应用（单文件 SPA）
├── CNAME                       # GitHub Pages 自定义域名
├── robots.txt                  # 搜索引擎抓取规则
├── sitemap.xml                 # 站点地图
├── foam_cannon_calculator.py   # Python 版计算脚本（独立工具）
├── foam_cannon_tool.html       # 工具版本（独立页面）
├── worker/
│   ├── feedback-worker.js      # Cloudflare Worker 反馈代理
│   ├── wrangler.toml           # Worker 配置
│   └── README.md               # Worker 说明
└── README.md                   # 本文件
```

## 📐 计算原理

基于孔口流量方程：

```
Q = Cd × A × √(2ΔP / ρ)
```

| 符号 | 含义 | 典型值 |
|------|------|--------|
| Q | 体积流量 (m³/s) | — |
| Cd | 流量系数 | 0.6–0.65 |
| A | 喷芯截面积 (m²) | 由喷芯号决定 |
| ΔP | 压差 (Pa) | 洗车机输出压力 |
| ρ | 流体密度 (kg/m³) | ~1000 (水) |

以 MJJC 3.0 PA 壶在 1.0–1.3 孔径范围内的最佳出泡效果为基线，结合用户机器参数反推最匹配的喷芯。

---

## License

MIT
