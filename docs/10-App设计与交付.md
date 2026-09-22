# 10 App 设计与交付

用户最新要求：开发 App，先从设计网站与成熟组件寻找基础，避免从零搭界面。设计依据见根目录 DESIGN.md。

## 本次选择

参考 Genix 摄影编辑 App 的画面/底部工具/作品组织；以 Ionic 官方 JavaScript 方案与 Capacitor 复用已验证的本地核心。新增 app.html 为手机 App 界面，原 index.html 保留工作台验证入口。原生包使用本地打包资源，不依赖电脑网页运行。

目标流程为发现 → 拍摄/导入 → 选中原物体 → 调整动作 → 导出/分享。无剧情步骤，无强制 Tripo。后续连续相机跟踪仍为独立能力。

## 验证分层

1. App 界面：浏览器窄屏与实际视觉检查。
2. 原生工程：iOS/Android 工程生成及本地构建。
3. 模拟器：启动、离线资源、示例创作和可用编解码。
4. 真机：拍照权限、系统素材选择、导出与分享、后台恢复、发热。
5. 分发：真实签名、TestFlight/安装包、评审 HTTPS 云服务与参赛入口。

每层单独记录结果，不把工程生成视为打包完成，不把模拟器视为真机。

## 已确认的交付形式

用户已确认 iOS + Android 安装版。采用 Capacitor 8 工程，Ionic 9 的官方组件，应用 ID 暂为 `app.breathecity.camera`，版本 0.2.0。本地处理资源打入安装包，工作台 `/index.html` 与手机预览 `/app.html` 共用动画引擎。

系统相机通过 Camera 插件返回照片；文件导出先写入 App 缓存，再打开系统分享面板。系统分享可以提供保存视频/存储文件等目的地，具体由设备决定。分享缓存保留至后续启动时清理超过 24 小时的文件，避免接收 App 尚未读取就删除。App 退后台会中止正在进行的录制并释放相机；恢复后可重新导出。

原生包内云生成功能暂关闭；不得把 `localhost` 服务当成已部署云服务。作品/草稿留在设备，卸载可能清除；Android 自动备份关闭。

## 构建

在 `Breathe-City-All-In-One/01-project/breathe-city`：

```sh
npm ci
npm run verify
npm run native:sync
# 可选：重新生成本项目原创图标和启动图
node tools/brand-native.mjs
# 通过 IDE 配置目标设备/签名
npm run native:ios
npm run native:android
```

环境：Node 22.16+，Xcode 26+，Android JDK 21、SDK platform 36。具体版本以锁文件及原生工程配置为准。本次未改用户默认 Java，构建使用独立 JDK 21。

命令行示例：

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/breathecity-ios-build CODE_SIGNING_ALLOWED=NO build
# JAVA_HOME 指向本机 JDK 21；ANDROID_HOME 指向已安装 SDK
cd android
./gradlew assembleDebug
```

iOS `.app` 模拟器构建不能直接安装到 iPhone。iPhone 开发安装/TestFlight 需要用户的 Apple 开发者团队与证书配置。Android Debug APK 可侧载测试，不是商店正式包。

## 原生权限与资源

- iOS 已添加相机/照片访问用途描述及 Filesystem 所需 FileTimestamp 隐私清单，随资源构建；上线前随实际启用的数据处理再次审核声明。
- Android 使用系统相机与文件选择器；不请求整个存储空间访问。当前不使用定位、麦克风或推送。
- 应用图标、启动图由项目原创矢量标志生成；示例画面是原有原创 SVG。
- Ionic、Capacitor、Ionicons 为安装的开源依赖，许可记录见 `docs/references/app-dependencies-LICENSES.txt`。设计网站只参考布局，不含购买/复制未授权的设计源文件。

## 本次交付结果（2026-09-22）

| 项目 | 当前证据 |
|---|---|
| Android 安装包 | `dist/releases/breathe-city-0.2.0-debug.apk`，约 8.2 MB；Debug 签名验证通过 |
| Android 工程 | JDK 21 / SDK 36，Gradle `:app:assembleDebug` 成功；Pixel 7 API 34 模拟器安装、启动及本地资源加载成功 |
| Android 交互 | 当前界面工具无法绑定该模拟器窗口，未完成选区/录制/分享的原生交互验收；不能由启动日志推断全部功能可用 |
| iOS 工程 | Xcode 26.6，iOS 26.5 模拟器 Debug 构建成功；已安装并实际操作首页、创作、结果回放、系统分享/保存面板 |
| iOS 视频 | WKWebView 导出实际 H.264 MP4：720×1280、6.03 秒；FFmpeg 完整解码通过，样片在 `test-results/bc3/ios-simulator-export.mp4` |
| iOS 模拟器包 | `dist/releases/breathe-city-0.2.0-ios-simulator.zip`，约 2.2 MB；不是 iPhone IPA，不代表真机签名交付 |
| 手机界面测试 | Chromium 390×844 的 10 项 App 流程检查通过；62 项本地单元/服务测试通过 |

完整日志：`test-results/bc3/ios-build.log`、`android-build.log`、`android-startup.log`、`ios-media-report.json`。包校验和：`test-results/bc3/native-packages.sha256`。

Android 启动时遇到旧 WebView 安全区域 CSS 注入早于 document 创建的报错；按固定依赖 8.5.2 的 SystemBars 原生处理实现，配置 `insetsHandling: native`，保留系统边距处理。重建后启动日志不再有该异常。此配置随 Capacitor 升级复核；[官方 SystemBars 文档](https://capacitorjs.com/docs/apis/system-bars)解释 WebView 安全区域兼容性背景。

包 SHA-256：

```text
Android Debug APK: 0cc0b7bf794775e65321f3b07d67fe2879a521d01bb98386e1616739f5b0b3e5
iOS Simulator ZIP: 728f32115cafbf6e2bc0f2b23cda7f0dadfdbfda8c2caf0eaec85e764582b6af
```

下一次验收：Android 原生编辑与系统导出、两个平台真实手机、iOS 开发者签名。云 API 和比赛提交保持独立验收项。
