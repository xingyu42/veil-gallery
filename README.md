# Veil Gallery

现代时尚风格写真站，基于 [veil.ortlinde.com](https://veil.ortlinde.com) 公开 API，Next.js App Router，可直接部署到 Vercel。

## 功能

- 首页：精选分类 / 标签 + 分类筛选 + **无限滚动瀑布流**
- 图集列表：分类筛选（客户端平滑切换）+ **无限滚动**
- 图集详情：瀑布流图片，**点击打开灯箱 + 显示元数据**（尺寸、图集、标签）
- 标签列表 + 标签预览（同样支持灯箱）
- **暗色 / 亮色主题切换**（右上角按钮，记住偏好）
- 图片全部直连 CDN，JSON 走服务端强缓存，规避限流

## 本地运行

```bash
cd photo-veil
npm install
npm run dev
```

打开 http://localhost:3000

## 部署 Vercel

把本目录推到 GitHub → Vercel 导入 → 直接 Deploy（无需环境变量）。

## 技术要点

| 能力 | 实现 |
|------|------|
| 无限滚动 | `IntersectionObserver` + `/api/galleries` |
| 主题切换 | 自实现 ThemeProvider + localStorage + CSS 变量 |
| 图片灯箱 | 客户端 Lightbox，元数据走 `/api/image-meta/[id]` |
| 限流保护 | 图片访客 IP 直连；JSON `revalidate` + API Route 缓存 |
| 瀑布流 | 纯 CSS `columns`，无额外依赖 |

## 目录结构

```
src/
  app/
    page.tsx                    # 首页（无限滚动 + 筛选）
    galleries/page.tsx          # 图集列表
    gallery/[id]/page.tsx       # 图集详情 + 灯箱
    tags/page.tsx
    tag/[name]/page.tsx
    api/galleries/route.ts      # 客户端分页代理
    api/image-meta/[id]/route.ts
  components/
    InfiniteGalleries.tsx       # 无限滚动客户端组件
    GalleryImages.tsx           # 图集图片 + 灯箱
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
- 部分图集封面可能 404（源站未上传完成），已做空状态处理。
- 内容含成人向写真，请遵守平台与当地法规。
