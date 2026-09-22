# Breathe City · 呼吸城市 v0.2

让原本静止的物体有趣地动起来。当前主页是新版创作工具；原版 Tripo/VFX 实验室保留在 `/legacy.html`。

## 启动

```bash
npm ci
npm run verify
npm start
```

需要 Node.js 22.16+，打开 http://localhost:3000 。视频校验使用随依赖安装的 FFmpeg/FFprobe，首次安装需要联网。默认不开启付费调用。

## 已实现的代码

照片/视频导入、相机拍照、框选与多边形、裁剪、三个局部原图变形动作、强度/周期、原片比较、6/10秒导出、作品库与草稿持久化。视频分别提供选帧和固定机位原视频处理，输出静音；尚无移动镜头跟踪。

新版 `/api/v1` 包含邀请会话、私有图片上传、报价/预算、幂等生成、任务恢复、视频结果验证与入库。Runway 图生视频适配器默认关闭；本地契约测试通过不能当作真实云端验收。

## 验证

```bash
npm run verify
python3 tests/runtime_smoke.py
# 已安装 Playwright 的环境：
PLAYWRIGHT_MODULE=/absolute/path/to/playwright npm run test:browser
PLAYWRIGHT_MODULE=/absolute/path/to/playwright npm run test:video
PLAYWRIGHT_MODULE=/absolute/path/to/playwright npm run test:cloud
```

浏览器报告和导出样片在 `test-results/bc3/`，测试使用合成图片/视频、模拟相机与注入的供应商，不是真机、真实街景质量或实际云生成证明。

## 配置与边界

见 `.env.example`，云开关要求提供密钥、邀请哈希、价格版本、单次/会话/每日/总预算和可信结果域名。用户邀请凭据从页面输入；长期 API 密钥只在服务端。停止跟踪不会撤销供应商任务或退款。

产品需求与执行状态见项目根目录 `docs/`。旧版本说明归档于 [README-v0.1](docs/README-v0.1-archive.md)。

离线备份与恢复命令见根目录 `docs/08-运行发布与参赛.md`。同一 DATA_DIR 只允许一个服务写入。

## 双平台 App

手机界面：`/app.html`。`npm run native:sync` 构建本地资源并同步 iOS/Android 工程；`npm run native:ios` 或 `npm run native:android` 打开原生工程。

运行 `npm run test:app` 验证手机布局和编辑闭环。原生构建、签名、模拟器/真机区别详见项目根目录 `docs/10-App设计与交付.md`。
