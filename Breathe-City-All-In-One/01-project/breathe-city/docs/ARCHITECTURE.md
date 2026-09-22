# 架构与实现边界

## 产品闭环

输入 → 画面区域分析 → 场景选择 → VFX 合成 → 用户节奏控制 → Canvas 录制 → 浏览器作品库 → 下载。

原始取景单独绘制到 raw canvas；VFX 写入 stage canvas，MediaRecorder 捕获 stage。开启 Decart 时发送 raw，不把原本的本地特效反复送给云模型；返回视频用于最终画面。文本场景提示只在特效变化时更新，不逐帧提交模型请求。

## 浏览器

`MediaInput` 持有唯一输入流及资源，切换时关闭轨道、暂停旧视频、释放对象 URL。版本号用于淘汰旧请求，避免慢加载把新输入覆盖。

`CityRenderer` 统一画幅与坐标，原图按 contain 映射，保持比例。语义蒙版使用同一画布坐标。像素类为 other=0 / sky=1 / building=2 / tree=3 / protected=4。按区域生成稳定的候选位置，再在区域内合成效果。未知场景不强行变换。没有相机位姿、深度图或世界坐标。

`SceneRouter` 使用连续判断抑制效果频繁切换。预设直接使用已知场景，实拍使用颜色规则或主动开启的语义模型。语义 Worker 单次任务运行期间不重复投递；老帧返回通过序号和 source invalidation 丢弃，过期蒙版逐渐衰减。

`LocalGallery` 将 Blob、缩略图、文件格式、尺寸、来源、渲染模式保存到 IndexedDB。清理浏览器数据会删除作品。私密 / 受限上下文中降级到内存并显示临时提示；不假装写入成功。不提供跨设备同步。

`GlbViewer` 使用真正三角形几何，重建法线、应用节点变换。可用 WebGL2 时支持基础颜色贴图；不可用时提供无贴图的 CPU 软件预览。它不是通用 glTF 查看器，也不支持 Draco、meshopt、蒙皮、动画或完整 PBR。应用到主画面时作为区域内合成元素，不会变成现实锚点。

## 服务端

单个 Node HTTP 进程 + 单个任务运行器 + SQLite WAL。没有强行拆成多服务；在线 API 接收任务、同步持久化后返回，运行器处理异步外部调用。SQLite 任务保存和后台职责分开，但仍属于同一个可部署单元。

生成任务不保存视频文件。浏览器作品与 SQLite 任务完全分开，避免误以为服务器有备份。

### 任务状态

```text
queued → submitting → polling → succeeded
           │              ├── failed
           │              ├── needs_review
           ├── failed     └── monitoring_stopped
           └── needs_review
queued → cancelled
needs_review + 确认已有 provider ID → polling
monitoring_stopped → polling
```

Demo 任务直接使用原创本地样例，结果中包含非 AI provenance。真实模式永不静默退回演示。

### 避免重复计费

幂等键唯一，指纹包含 kind、mode、prompt。重用相同键返回相同任务；相同键配不同参数返回 409。前端在网络结果不确定时保留原键以供重试。**刷新页面会丢失前端尚未收到确认的待提交键**；因此遇到不确定结果时，应先查看持久化任务列表与服务商控制台，不要刷新后反复新建任务。

`submitting` 状态重启后变为 `needs_review`。不确定的 POST 不自动重提；人工关联已有 provider ID 只恢复查询。查询错误可指数退避，最大间隔一分钟，正常窗口 45 分钟。恢复查询重设查询窗口，不更改创建时间，也不创建新的付费生成。

停止跟踪不会取消已提交的服务商任务，不会退款。不支持用删除任务来撤销费用。

### 限制

后台运行器顺序处理任务，提交网络调用可能占用其工作时段，适合 MVP 而非高吞吐。多实例并发启动不受支持：如果扩展，应增加数据库租约 / 队列，不可直接把多个实例挂到同一个 SQLite 文件并宣称安全。

## 扩展接口

替换真实生成提供商优先编辑 `server/providers.mjs`，保留 submit / poll / token 的应用侧契约。替换本地识别优先编辑 segmentation 客户端与 Worker，输出同一个五类蒙版。新增视觉效果编辑 domain 定义与 engine 合成。不要把所有扩展塞到 app.js。

下一阶段可以把 domain / providers 迁移为 TypeScript，并接入版本固定的依赖构建链；当前项目不伪称已有类型检查、完整 CI/CD、生产监控或用户认证体系。
