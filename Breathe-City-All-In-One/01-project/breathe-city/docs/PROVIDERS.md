# 真实服务接入与联调顺序

**核对日期：2026-09-20。当前代码有适配器和请求 / 响应契约测试，没有真实付费账号端到端验收。** 服务商 API、模型名、权限、限流和成本仍以账号当前可用能力为准。不要根据本地演示成功推断厂商已打通。

## 安全开通

先复制 .env.example，不上传或提交 .env。用密码管理器生成 ADMIN_TOKEN（至少 24 字符）。只打开一个服务，`MAX_REAL_JOBS_PER_DAY=1`、`MAX_REALTIME_TOKENS_PER_DAY=1` 起步；真实费用以服务商账单为准，本地计数不等于账单限额。

## Tripo

配置 TRIPO_API_KEY，默认 TRIPO_MODEL=v3.1-20260211。后端通过 Bearer Key 提交 `/v3/generation/text-to-model`，prompt、face_limit=12000、texture=true、pbr=true；持久化 data.task_id，然后 GET `/v3/tasks/{id}`。

成功读取 output.model_url，可通过浏览器下载 / 预览 / 应用。模型 URL 的有效期、CORS、实际压缩方式、贴图尺寸和模型面数都需要用真实输出验收。当前 viewer 不支持 Draco / meshopt / KTX2，遇到这些格式需导出普通 GLB 或改为成熟 glTF 引擎；不要只改提示词假设输出必然兼容。

测试顺序：一次真实提交 → 重复相同幂等键 → 查看仅一个 provider ID → 等待结果 → 下载存档 → 实际导入 → 主画面应用 → 重启后仍能查看该任务。

## World Labs

配置 WORLDLABS_API_KEY，默认 marble-1.1。用 `WLT-Api-Key` 调用 `/marble/v1/worlds:generate`，world_prompt={type:'text',text_prompt:...}；保存 operation_id，轮询 `/marble/v1/operations/{id}`，必要时查询 worlds 详情。

这是文字生成世界。没有把相机照片、GPS、视频或场景几何暗中发送给 World Labs，也没有 Atlas 私有能力依赖。World URL 由服务端响应提供，前端不自行拼造“成功世界”。

## Decart Lucy

配置 DECART_API_KEY；默认模型 lucy-2.5。服务器 POST `/v1/client/tokens`，传 expiresIn、allowedModels、allowedOrigins，以及 constraints.realtime.maxSessionDuration。长效 Key 只在该服务器请求里。

前端动态加载 `@decartai/sdk`，使用 createDecartClient / models.realtime / client.realtime.connect，通过返回的连接更新提示词与断开。SDK 由 esm.sh 解析，当前默认地址未锁版本；**公开部署前必须固定你已经验收的 SDK 版本到 DECART_SDK_URL**。未使用私有预览的 HTTP signaling 接口。

用户必须勾选传输同意并再次确认。默认 raw canvas 视频流不含麦克风音轨；模型返回的流渲染到画面，可使用相同录制功能。连接只运行限时会话、手动断开或页面隐藏时断开，应用不自动新建会话。SDK 本身有内部重连机制，代码订阅 connectionChange，在 reconnecting / disconnected 事件立即停止输入并调用 disconnect；事件时序和服务商侧费用必须真机验证，不能把这一处理说成已证实的账单保护。清晰度受 SDK 模型定义与输入尺寸影响，不保证输出同等分辨率。

实时验收：浏览器权限 → 临时令牌字段 → SDK import / CSP → 建连事件 → 首个返回视频帧 → 提示词切换 → 30 秒停止（客户端和服务商侧）→ 页面隐藏断开 → 断开后无继续扣费。测真实端到端延迟，不用 FPS 代替。

## 真实语义模型

前端“识别与诊断”主动开启。Worker 加载 Transformers.js 3.7.2 和 Xenova/segformer-b0-finetuned-ade-512-512；WASM、量化 q8。输入是本地采样帧，输出统一到树 / 建筑 / 天空 / 保护 / 其他标签。score 为 null 的分割结果不能当置信度数值。

这条路径需要首次下载代码和模型权重。本次受限网络环境未完成模型下载、推理速度和设备兼容性实测。若 CDN 或模型不支持当前配置，界面会报错并保留规则模式，不谎称模型已加载。部署前应自托管已核验权重与依赖，核查模型授权，并测夜景 / 快速移动 / 标签映射。

模型可能误判。人物、标牌保护区不等于匿名化，也不保证交通标志不被改变；使用时不要遮挡安全信息或宣称可代替肉眼判断。
