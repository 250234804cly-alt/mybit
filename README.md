# PA 壶喷芯估算台 ⚡

> 选洗车机型号或手动填参数，一键算出推荐喷芯大小。

## 功能

- 📊 **双模式输入** — 品牌型号选择 / 手动填写参数
- 🔍 **30+ 机型数据库** — 覆盖凯驰、亿力、指南车、绿田等主流品牌
- 🧮 **科学计算** — 基于伯努利 + 孔口流量模型 (Q = Cd × A × √(2ΔP / ρ))
- 📱 **完美适配手机** — 触摸优化 + 安全区域 + 底部固定按钮
- 🎨 **暗色主题** — 毛玻璃质感设计

## 技术栈

单文件 HTML 应用，零依赖（仅 Google Fonts CDN）。

- HTML5 + CSS3（CSS Grid / Custom Properties / Glassmorphism）
- 原生 JavaScript（无框架）
- 响应式三断点：768px / 600px / 380px

## 部署

这是一个纯静态单页应用，部署到任何静态托管服务即可：

### GitHub Pages

```bash
# 1. 创建 GitHub 仓库
# 2. 推送代码
git init
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:your-username/foam-cannon-calc.git
git push -u origin main

# 3. 在仓库 Settings → Pages → 选择 main 分支 → Save
```

### Cloudflare Pages / Vercel / Netlify

直接连接 GitHub 仓库，零配置自动部署。

### 部署后别忘了

1. 域名已配置为 `junyuchen.cn`，如需更换请全局搜索替换
2. 把 `canonical`、`og:url`、`og:image` 的 URL 改成真实地址
3. （可选）制作一张 1200×630 的 OG 分享图，替换 `og:image`
4. （可选）制作 192×192 和 512×512 的 PNG 图标替换内联 SVG favicon

## License

MIT
