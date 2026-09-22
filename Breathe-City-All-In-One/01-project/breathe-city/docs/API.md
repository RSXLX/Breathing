# 本地 API · v0.1

默认同源 `http://localhost:3000`。所有请求 / 响应使用 JSON；错误为 `{ "error": "可显示信息", "requestId": "UUID" }`。

## 请求保护

写请求要求 `Content-Type: application/json` 和 `X-Breathe-Request: 1`。配置了 ADMIN_TOKEN 后，任务读写与令牌接口要求 `Authorization: Bearer <ADMIN_TOKEN>`。浏览器 Origin 必须命中 PUBLIC_ORIGIN 或本地别名。没有跨域开放 CORS。默认每 IP 每分钟最多 40 次写操作，请求体上限 16 KB。

`GET /api/health` 返回 ok/version。`GET /api/config` 返回版本、提供商可用标志、是否启用付费、管理令牌要求、实时上限和公开 SDK 地址，不返回长效密钥。

## 生成任务

`POST /api/jobs`：

```json
{
  "kind": "tripo",
  "mode": "demo",
  "prompt": "A quiet organic seed pod",
  "idempotencyKey": "a-client-generated-unique-key",
  "confirmed": false
}
```

kind 为 tripo/world；mode 为 demo/real；prompt 3–1000 字符；幂等键 8–100 个字母数字、下划线或连字符。真实模式要求开关、对应 Key、管理令牌和 confirmed=true。

成功 HTTP 202，返回 `{ "job": { ... }, "reused": false }`。客户端收到的是本地任务，不是已完成的模型。`GET /api/jobs` 返回最近 100 条，按创建时间倒序。

job 字段：id、kind、mode、prompt、state、providerId、result、error、progress、polls、createdAt、updatedAt、nextPollAt、pollStartedAt。时间为 Unix 毫秒。progress 可能为空，不制造假的服务商进度。

结果示例：

```json
{"modelUrl":"https://provider-returned-location/model.glb","thumbnailUrl":null,"provenance":"tripo-api"}
```

Demo 会返回 `procedural-demo-not-tripo` 或 `procedural-demo-not-worldlabs`，不能当作真实模型结果。World Labs 的 result 使用 worldUrl。

## 停止、恢复和人工核对

`POST /api/jobs/:id/stop`，body `{}`：排队任务取消；已经提交的任务只停止本地监控。提交中的任务返回 409。

`POST /api/jobs/:id/resume`，body `{}`：只对 needs_review / monitoring_stopped 生效。真实任务必须已有 providerId。重置轮询窗口，绝不再次创建生成。

`POST /api/jobs/:id/attach`，body `{ "providerId": "已在服务商控制台核对的ID" }`：人工关联已有任务并开始查询。若填写了别的任务 ID，返回的资产自然来自该 ID；系统没有替你验证业务归属。公开多用户产品需要额外权限检查。

## 实时令牌

`POST /api/realtime/token`，body `{ "confirmed": true }`，成功返回短期 apiKey / expiresAt。浏览器只拿到短期 Key。后端先占用本日令牌额度再请求服务商，网络不确定失败也占额度，避免无界重试。

令牌绑定模型、Origin 和最大实时会话时长。客户端 TTL 默认 60 秒，不代表已建立的会话会在 60 秒自动停止；另有 maxSessionDuration 和本地自动断开。服务商真实执行结果需要联调验证。

## 错误语义

400 参数 / 同意状态无效；401 管理令牌错误；403 来源 / 付费授权不足；409 模式未配置 / 状态冲突 / 幂等冲突；413 过大；415 非 JSON；429 额度 / 频率限制；502 上游失败或网络问题。不把长效 Key、连接串或原始服务商响应输出给用户。
