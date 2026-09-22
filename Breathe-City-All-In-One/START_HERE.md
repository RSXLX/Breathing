# Breathe City · 一座会呼吸的城市
## 项目、演示、硬件与素材总交付包

打包日期：2026-09-21。源码版本：v0.1.0。本次主要补齐交付资料和汇总文件，未修改原 MVP 的业务代码，也未打开付费接口。

**先解压整个 ZIP。看效果用 `02-demo/Breathe-City-Preview.html`；继续开发用 `01-project/breathe-city/`。**

## 1. 立即体验

无需启动后端：用浏览器打开 `02-demo/Breathe-City-Preview.html`。可以先体验原创演示场景、区域特效、长按交互、导入与导出。独立 HTML 的相机、存储和下载仍受浏览器环境限制；它没有后端真实任务服务。

完整本地服务：准备 Node.js 22.16 或以上版本，然后从本包根目录执行：

```bash
cd 01-project/breathe-city
npm start
```

打开 `http://localhost:3000`。核心运行没有第三方 npm 依赖，不要求 `npm install`，不需要 API 密钥。停止服务按 `Ctrl+C`。

macOS 可从总包目录执行 `bash Start-Mac.command`。Windows 可以运行 `Start-Windows.cmd`。脚本仅启动服务，不下载运行时、不修改安全设置、不填写密钥、不自动开启付费调用。

## 2. 目录索引

| 目录 | 内容 | 从哪一个文件开始 |
|---|---|---|
| `01-project/breathe-city/` | 完整原始前后端、原创资产、测试、配置模板和开发文档 | `README.md`、`docs/HANDOFF.md` |
| `02-demo/` | 独立 HTML、实际录制 MP4、桌面/手机/模型页/作品库截图 | `Breathe-City-Preview.html` |
| `03-hardware/` | 必需设备、可选呼吸灯 BOM、装配与联调任务 | `HARDWARE_BOM.md` |
| `04-assets/` | 已有样例资产、待做 3D 清单、建模提示词、实拍素材规划 | `ASSET_LIST.md` |
| `05-guides/` | 产品定位、启动部署、服务接入、验收表和交付边界 | `DELIVERY_SCOPE.md` |
| `06-originals/` | 原始 MVP ZIP、原 README、此前版本的界面截图 | 原始文件保留用于核对与恢复 |
| `07-verification/` | 本次重新执行的测试日志、源码保留核对与打包清单 | `README.md` |

`FILE_MANIFEST.json` 是文件大小与 SHA-256 索引。`SHA256SUMS.txt` 用于检查解压后的文件完整性。

## 3. 先准备什么

现有开发电脑 + 一部手机即可开始真实街景验证。支架、充电宝与展示屏按需准备。实体呼吸灯是后续扩展，不是软件运行的前置条件；先不采购 LiDAR、AR 眼镜、无人机或 GPU 工作站。

## 4. 不要混淆的边界

- 当前是基于画面区域的 2D VFX，不是已经实现空间定位/深度遮挡/永久锚点的 AR。
- 演示场景、程序化 seedpod 模型和演示世界均不是外部 AI 生成的真实结果。
- Tripo、World Labs、Decart 有适配代码，但本包没有真实密钥，也没有真实付费端到端验证。
- `03-hardware` 是采购、装配与后续联调文档；本包不包含已验收灯板固件、PCB、电气原理图或可制造的完整结构件。
- 随包只有 1 个程序化样例 GLB；三类正式城市生命体和灯罩/底座 STL/STEP 尚待制作。
- 原项目已有浏览器测试记录；本次重新运行的是语法检查、43 项 Node 测试和 7 项本地 CLI/HTTP/SQLite 集成检查，没有重新进行真机、云模型或硬件测试。

## 5. 推荐推进顺序

先看演示并启动本地服务 → 导入自己拍的树/建筑/天空素材 → 验收手机权限和录制 → 逐一联调真实语义与云模型 → 替换正式 3D 资产 → 最后决定是否加实体灯和空间 AR。

项目原创代码与样例素材许可证位于 `01-project/breathe-city/LICENSE`。第三方模型、SDK、API 的授权范围不由该 MIT 许可证覆盖。
