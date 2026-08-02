# Veil Gallery

现代时尚风格写真站，基于 [veil.ortlinde.com](https://veil.ortlinde.com) 公开 API，Next.js App Router，可直接部署到 Vercel。

## 功能

- 首页：品牌与站点规模 + 精选分类 / 标签 + 图集预览
- 图集列表：分类筛选 + **无限滚动**
- 图集详情：瀑布流图片，**点击打开灯箱 + 显示元数据**（尺寸、图集、标签）
- 标签列表 + 标签预览（同样支持灯箱）
- **暗色 / 亮色主题切换**（右上角按钮，记住偏好）
- 图片通过 `/api/image/[id]` 代理，走 **Vercel Edge + CDN 缓存**，首次 MISS 回源，后续 HIT 纯 CDN

## 本地运行

```bash
cd photo-veil
npm install
npm run dev
```

打开 http://localhost:3000

## 部署 Vercel

把本目录推到 GitHub → Vercel 导入 → 配置环境变量 → Deploy。

## 环境变量

```bash
# Upstash Redis (图片代理限流，必需)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# 如未配置 Upstash,图片代理会失效保护(允许所有请求并打印警告)
```

获取方式：
1. 访问 [Vercel Marketplace - Upstash Redis](https://vercel.com/marketplace/upstash)
2. 点击 "Add Integration"，选择你的项目
3. 创建 Redis 数据库（免费版：500K 命令/月，256MB 存储）
4. 环境变量会自动注入到 Vercel 部署

本地开发需手动复制到 `.env.local`：
```bash
cp .env.example .env.local
# 填入从 Upstash Console 复制的 URL 和 Token
```

## 技术要点

| 能力 | 实现 |
|------|------|
| 无限滚动 | `IntersectionObserver` + `/api/galleries` |
| 主题切换 | 自实现 ThemeProvider + localStorage + CSS 变量 |
| 图片灯箱 | 客户端 Lightbox，元数据走 `/api/image-meta/[id]` |
| 限流保护 | 图片走 Edge 代理 + Upstash Redis 按区域限流（100 次/5 分钟/区域） + CDN 永久缓存；JSON `revalidate` + API Route 缓存 |
| 瀑布流 | 纯 CSS `columns`，无额外依赖 |

## 目录结构

```
src/
  app/
    page.tsx                    # 首页（精选入口 + 图集预览）
    galleries/page.tsx          # 图集列表（筛选 + 无限滚动）
    gallery/[id]/page.tsx       # 图集详情 + 灯箱
    tags/page.tsx
    tag/[name]/page.tsx
    api/image/[id]/route.ts     # Edge 图片代理（Vercel CDN 缓存）
    api/galleries/route.ts      # 客户端分页代理
  components/
    InfiniteGalleries.tsx       # 无限滚动客户端组件
    GalleryImages.tsx           # 图集图片 + 灯箱
    RemoteImage.tsx             # 源站图片统一入口（骨架占位）
    Lightbox.tsx                # 灯箱 + 元数据面板
    ThemeProvider.tsx
    Header.tsx                  # 含主题切换
    FilterBar.tsx               # 平滑分类筛选
    ...
  lib/
    api.ts
    types.ts
```

## 注意事项

- API 限流约 100 次 / 5 分钟（IP 级）。服务端缓存请勿随意缩短。
- 图片走 **Edge 代理 + 按区域限流 + CDN**：
  - 服务端通过 Upstash Redis 按 Vercel 区域限流（100 次/5 分钟/区域）
  - 每个 Vercel Edge 区域有独立出口 IP 池,按区域限流可确保单个 IP 不超过源站限制（100/5min）
  - CDN MISS 时回源前先检查区域配额，超限返回 429
  - CDN HIT 时不经过限流检查，纯 CDN 响应
  - 免费版 Upstash 支持 ~166K 次图片请求/月（约 115 张/小时，多区域叠加）
- 部分图集封面可能 404（源站未上传完成），已做空状态处理。
- 内容含成人向写真，请遵守平台与当地法规。
