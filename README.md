# Breathing · 呼吸城市

Breathing（原 Breathe City）是一款让日常静物动起来的创作工具。

通过镜头和视频，让现实中原本静止的东西有趣地动起来，让熟悉的日常重新值得被看见。

- [产品叙事](docs/00-产品叙事.md)：为什么做、为谁做、希望改变什么。
- [MVP 开发总计划](MVP开发计划.md)
- [完整开发文档](docs/README.md)
- [现有源码说明](Breathe-City-All-In-One/01-project/breathe-city/README.md)

2026-09-22 v3 已按用户澄清修正：“故事”指产品叙事，不是每段内容的剧情。产品核心是拍摄/导入、选择原物体、赋予动作、预览与保存。新版本地创作闭环与云任务基础代码已实现；开发状态和证据见 [进度记录](docs/09-开发进度与证据.md)。Tripo 是可选技术，不是首版依赖。

## 运行新版创作工具

```bash
cd Breathe-City-All-In-One/01-project/breathe-city
npm ci
npm start
```

Node.js 22.16+，本机访问 http://localhost:3000 。默认无需 API 密钥，手机相机测试需可访问的 HTTPS 环境。

本地照片/固定机位视频的输入、选区、动作、导出和作品库已做桌面浏览器验证。云适配器默认关闭，真实服务费用、真机与真实素材质量尚未验收。旧版实验室保留在 `/legacy.html`。

## iOS 与 Android App

用户已确认双平台安装版。手机界面预览为 `/app.html`，工程与构建说明见 [App 交付文档](docs/10-App设计与交付.md)，设计参考与组件来源见 [DESIGN.md](DESIGN.md)。原生包内置本地资源，照片动画无需电脑服务；云生成需要另行部署 HTTPS 服务。
