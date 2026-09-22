# Breathe City · 一座会呼吸的城市

**场景感知的城市特效相机 / 可运行 MVP 底座 / v0.1.0**

把镜头对准城市，让树冠、建筑与天空回应你的节奏。这个项目交付的是可以继续开发的前后端源码：本地取景、三套区域特效、长按交互、图片与视频导出、作品库，以及可配置的真实生成服务适配层。

**重要边界：它是基于画面区域的 2D VFX，不是空间 AR。无密钥时运行本地程序化效果，不伪装成实时 AI 生成。云服务代码已实现和做契约测试，但没有使用付费凭据联调。**

## 1. 立即启动

需要 **Node.js 22.16 或以上版本**，使用较新的 Chrome / Edge 体验。核心应用没有第三方 npm 依赖，不需要运行 `npm install`，也不需要任何模型密钥。

```bash
cd breathe-city
node --version
npm start
```

在浏览器打开 `http://localhost:3000`。关闭服务：在终端按 `Ctrl+C`。

macOS 也可以在终端执行 `bash start.sh`；`start.command` 是同一启动脚本，双击权限取决于系统设置。不要为了运行项目关闭系统安全机制。

### 只看效果，不启动服务器

打开 `dist/breathe-city-preview.html`。页面已内联原创场景、样例 GLB 与代码，能够体验三套效果、导入本地媒体、录制和导出。浏览器对 `file://` 的存储、相机和下载限制不同；有问题时用上述 `npm start` 方式。独立文件不提供真实服务、语义 Worker 或后端持久化任务。

## 2. 一分钟体验路径

1. 在创作台依次切换“街角绿意 / 楼宇微光 / 屋顶天空”。默认自动选择树、建筑、天空效果。
2. 长按“按住，唤醒城市”或空格键。光效会变强，松开后慢慢恢复。这里是艺术节奏，不是心率。
3. 按住“看原片”或 O 键比较；调整强度、周期或横竖画幅。
4. 点击相机按钮保存 PNG，或选择 6 秒后录制。弹窗中可播放、下载、改名、删除；作品在“城市回忆”中。
5. 进入“模型与资产”，加载样例 / 导入未压缩 GLB，然后“应用到画面”。它使用真实网格渲染，但只是合成到画面区域，并非现实空间锚点。
6. 创建 Tripo / World Labs **演示任务**，检查任务列表与来源标签。它们明确使用本地原创样例，不调用外部模型。

## 3. 已实现与明确未实现

| 模块 | 当前实现 | 边界 |
|---|---|---|
| 输入 | 摄像头、JPG/PNG/WebP、本地视频、3 个原创演示场景 | 真机相机权限、Safari 编码器需要单独验收；不采集麦克风 |
| 场景路由 | 自动或手选树 / 建筑 / 天空；稳定切换和未知场景退回原片 | 默认颜色规则，不是通用物体识别 |
| 真实语义扩展 | SegFormer + Transformers.js Worker，浏览器 WASM 推理 | 需主动开启和联网下载，当前环境未完成权重加载实测 |
| 本地视觉 | 树冠泡泡、建筑光膜、天空漂浮；强度、节奏、保护区蒙版 | 无真实深度、物理遮挡、SLAM 或永久地理锚点 |
| 录制 | Canvas 实际合成画面捕获、自动停止、PNG / WebM 或可用 MP4 | 无声；不是服务器视频编码器；不同浏览器输出格式不同 |
| 作品库 | IndexedDB 保存媒体；回看、改名、删除、下载 | 只在当前浏览器；不可用时明确降级到会话内存，刷新会丢失 |
| 3D 资产 | 本地 GLB 解析、旋转、渲染、应用；WebGL2 / 软件降级 | 静态未压缩 GLB ≤24 MB；无 Draco/meshopt/蒙皮；软件模式 ≤2 万面且不显示贴图 |
| 生成任务 | SQLite、幂等、有限轮询、重启恢复、人工核对 ID | 单用户开发工具，不是多租户生产平台 |
| Tripo | v3 文生静态模型 → 查询任务 → 下载 / 应用 GLB | 真实接口未付费联调；外部 GLB 的 CORS / 压缩格式需验收 |
| World Labs | 文字 → 异步世界 → 打开服务商返回的地址 | 不把街景照片自动上传；未实现图片到世界或实时重建 |
| Decart | 服务端临时令牌、客户端 SDK、WebRTC、自动断开 | 未做真实账号 / 网络 / 返回流延迟验收；应用不自动新建会话 |

没有伪造真实生成结果、真实心率、识别置信度或云端延迟。界面中的 FPS 和渲染耗时来自本机测量；覆盖率仅表示像素面积。

## 4. 目录

```text
public/                 原生 ES Modules 前端与原创素材
  js/app.js             页面与交互编排
  js/engine.js          画面合成、蒙版、三套 VFX
  js/domain.js          特效定义、规则识别、路由、坐标工具
  js/media.js           相机 / 媒体输入、MediaRecorder 导出
  js/storage.js         IndexedDB 与显式临时存储降级
  js/segmentation*.js   可选语义模型 Worker
  js/glb.js             静态 GLB 解析与 WebGL2 / 软件预览
  js/realtime.js        Decart 实时会话适配
server/
  index.mjs             同源 HTTP 服务与退出清理
  config.mjs            配置校验、密钥与付费开关
  http.mjs              API、来源校验、限流、静态文件边界
  store.mjs             SQLite 任务和令牌额度
  worker.mjs            单个后台任务运行器
  providers.mjs         Tripo / World Labs / Decart 适配
  ...
tests/                  Node 单测、HTTP 测试、浏览器冒烟脚本
tools/                  源码检查、离线构建、原创资产生成器
docs/                   架构、API、服务接入、安全、验收说明
dist/                   可分发独立 HTML 与静态前端副本
data/                   首次运行自动创建的 SQLite，不随交付打包
```

选择原生 JS 和 Node 内置 SQLite，是为了让这个底座无需依赖安装即可跑通。业务逻辑已拆模块，可以后续迁移到 TypeScript / React；不要在验证视觉体验之前先重写框架。

## 5. 配置真实服务

```bash
cp .env.example .env
# 用编辑器填写；不要提交 .env 到 Git
npm start
```

默认 `ALLOW_PAID_APIS=false`。启用真实接口需同时满足：

- 服务端设置至少 24 字符的随机 `ADMIN_TOKEN`、对应厂商 Key，以及 `ALLOW_PAID_APIS=true`。
- 在“模型与资产”输入 **ADMIN_TOKEN**。模型 Key 不填到浏览器里。
- 明确选“真实 API”并确认计费 / 画面传输。

只配置使用的提供商，不必三家都开。首次真实联调建议将 `MAX_REAL_JOBS_PER_DAY=1`、`MAX_REALTIME_TOKENS_PER_DAY=1`，逐项验收。实时会话默认 30 秒；令牌过期与会话结束是两件事，代码同时设置服务商会话上限与本地断开计时器。

详见 [服务接入](docs/PROVIDERS.md)。不要把本地演示任务截图当成真实 API 调用证据。

## 6. 手机与部署

本机桌面直接访问 localhost 最省事。手机访问电脑的普通 `http://局域网IP:3000` 不保证能使用摄像头；应使用受信任 HTTPS 和准确的 `PUBLIC_ORIGIN`。相机权限不通过时仍可导入照片 / 视频。

默认只监听 `127.0.0.1`。改为 `HOST=0.0.0.0` 必须设置管理令牌。项目没有多用户认证、对象存储、持久化空间锚点或账单级限额；**不要仅改 HOST 就把它当公开生产服务**。

提供可选 Dockerfile，但本次未构建容器镜像。容器需要可写的 `/app/data` 持久卷、运行时管理令牌、反向代理 HTTPS；不应把 `.env` 或真实 Key 烘焙进镜像。

## 7. 测试与构建

```bash
npm run check           # 所有 JS / MJS 语法检查
npm test                # 纯函数、SQLite、Worker、提供商契约、真实 HTTP 测试
npm run build           # 重新生成独立预览 HTML 与 dist/web
npm run verify          # 依次执行上述检查
```

另有零第三方依赖的 CLI 集成测试：`python tests/runtime_smoke.py`，会启动临时服务与数据库，完成演示任务并验证重启；不调用外部模型。

浏览器测试是可选开发依赖；核心运行不需要 Python：

```bash
python -m pip install playwright
python -m playwright install chromium
# 使用本机实际 Chromium/Chrome 路径替换下面路径
python tests/browser_smoke.py --browser /path/to/chromium --url http://localhost:3000
```

`--render-only` 只在独立 HTML 注入页面的模式验证交互，不应当作相机、持久存储或 HTTP 浏览器全链路验收。正式上线前请执行 [验收清单](docs/ACCEPTANCE.md)。本次实际测试证据放在 `docs/qa/`。

## 8. 交付后的优先级

**第一阶段：拿你的真实街景视频测试。** 白天、蓝调时刻、夜景、快速转场各取若干样本，测默认规则和真实语义模型的分割、延迟与漂移；低置信度 / 未知场景应保留原片。当前没有宣称“随处拍都精准”。

**第二阶段：逐个开通真实服务。** 先 Tripo 生成一件资产并应用，再验收 Decart 收发流和硬性断开，最后测试 World Labs 的异步返回与成本。保留任务 ID、源文件、录屏与失败样本。

**第三阶段：再决定是否升级空间 AR。** 需要绕物体观察、真实遮挡和回到原位置时，再增加 ARKit / ARCore 和深度能力。不要把当前 2D 合成命名成已经完成的空间 AR。

## 9. 界面和实际输出

- [创作台截图](docs/qa/desktop.png)
- [移动端截图](docs/qa/mobile.png)
- [模型接入页](docs/qa/connections.png)
- [实际录制样片（由 WebM 转为 MP4）](docs/qa/demo.mp4)

## 10. 数据与授权

本地摄像头 / 导入媒体默认不上传；开启真实 Decart 后才把取景视频发送给它。Tripo 和 World Labs 当前仅发送输入的文字。模型下载会访问外部 CDN / Hugging Face，但不应发送原始帧。作品在浏览器，任务及提示词在本地 SQLite；这两部分都没有自动云备份。

本项目源码、程序化插画和 seedpod 样例模型采用 MIT。外部模型、SDK 与 API 受各自授权和条款约束，未包含在项目 MIT 许可内。详情见 [来源与授权](docs/SOURCES.md)。
