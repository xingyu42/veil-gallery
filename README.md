# Veil Gallery

现代时尚风格写真站，基于 [veil.ortlinde.com](https://veil.ortlinde.com) 公开 API，Next.js App Router，可直接部署到 Vercel。

## 功能

- 首页：品牌与站点规模 + 精选分类 / 标签 + 图集预览
- 图集列表：分类筛选 + **无限滚动**
- 图集详情：最短列瀑布流图片，**点击打开灯箱 + 显示元数据**（尺寸、图集、标签）
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
# Upstash Redis（图片限流 + 图集尾长边界共享）
# Vercel Marketplace「Upstash」集成会自动注入，一般无需手填：
UPSTASH_REDIS_REST_URL=https://....upstash.io
UPSTASH_REDIS_REST_TOKEN=...

# 兼容旧 Vercel KV 命名（集成有时只注入这一对）：
# KV_REST_API_URL=...
# KV_REST_API_TOKEN=...

# 手工恢复端点随机密钥（/api/calibrate-offset?key=...；未配置时端点拒绝访问）
# CRON_SECRET=replace-with-a-long-random-secret

# 可选：Redis 不可用且自动初始化失败时使用的未验证起点。
# 正常运行会把 total 与稠密尾长写入 Redis，并由 startOffset = total - denseCount 推导。
# GALLERY_START_OFFSET=<fallback-startOffset>

# 可选：首页随机池（稠密尾内随机 offset 一次 list 拉窗，Redis 共享，TTL 到期懒重建）
# HOME_RANDOM_POOL_SIZE=96           # 单次 list 窗口大小（池内条数）
# HOME_RANDOM_POOL_TTL_SECONDS=1800  # 池新鲜期；默认配额成本 = 1 发/30min/区域

# 如未配置 Redis：限流失效保护（放行）；边界仅进程内存，跨实例不共享
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
| 图片灯箱 | [yet-another-react-lightbox](https://github.com/igordanchenko/yet-another-react-lightbox)（`AppLightbox`）+ 自定义元数据侧栏，元数据走 `/api/image/[id]/meta` |
| 限流保护 | 共享桶 100/5min/区域 + tag-preview 专属 60/5min/区域；图片 CDN 永久缓存；JSON `revalidate` / Route 缓存 |
| 图集热度 | 详情页 beacon → Redis ZSET `gallery:pv`（无图片预热）；导航「热门」→ `/popular` RSC Top-N |
| 图集边界 | 首次/容灾窗口二分；正常运行用稠密尾长游标 + 100 条局部窗口校正 |
| 图集列表 / 随机预览 | CSS Grid（1–4 列） |
| 图集详情瀑布流 | 最短列算法（`ShortestColumnMasonry`），保持 1→2→3→4 阅读顺序 |

## 目录结构

```
src/
  app/
    page.tsx                    # 首页（精选入口 + 图集预览）
    galleries/page.tsx          # 图集列表（筛选 + 无限滚动）
    popular/page.tsx            # 热门图集（Redis PV Top-N）
    gallery/[id]/page.tsx       # 图集详情 + 灯箱
    tags/page.tsx
    tag/[name]/page.tsx
    api/image/[id]/route.ts     # Edge 图片代理（Vercel CDN 缓存）
    api/galleries/route.ts      # 客户端分页代理
  components/
    InfiniteGalleries.tsx       # 无限滚动客户端组件（Grid）
    GalleryImages.tsx           # 图集图片瀑布流 + 灯箱
    ShortestColumnMasonry.tsx   # 最短列瀑布流
    RemoteImage.tsx             # 源站图片统一入口（骨架占位）
    AppLightbox.tsx             # yet-another-react-lightbox 封装 + 元数据面板
    ThemeProvider.tsx
    Header.tsx                  # 含主题切换
    FilterBar.tsx               # 平滑分类筛选
    ...
  lib/
    api.ts
    types.ts
```

## 注意事项

- 上游限流约 100 次 / 5 分钟（IP 级）。服务端缓存请勿随意缩短。
- **共享上游配额**（图片 MISS + 通用 JSON）：
  - Upstash：100 次 / 5 分钟 / Vercel 区域（`rl:upstream`）
  - 扣费点：`apiFetch`、随机图集、图集边界初始化/校正、图片代理 MISS
  - 策略：回源前扣费（保守）；Next data-cache 命中时也可能已扣 1 次
  - 图片 CDN HIT / Route 级 CDN HIT：不进函数，不扣费
  - 超限：HTTP 429 + `Retry-After` / `X-RateLimit-*`
  - Redis 未配置或故障：fail-open（放行）
- **tag-preview 专属**（`/v1/tag/.../preview`，对齐上游 60/5min，**不镜像上游 ban**）：
  - 独立桶 `rl:tag-preview`：60 次 / 5 分钟 / 区域
  - 扣费：`getTagPreview` + `/api/tag-preview`（先专属桶，再共享桶）
  - 「换一批」客户端冷却 5s，降低误触
  - 免费档约 ~166K 次限流检查/月（两桶合计命令消耗更高）
- 部分图集封面可能 404（源站未上传完成），已做空状态处理。
- 内容含成人向写真，请遵守平台与当地法规。
