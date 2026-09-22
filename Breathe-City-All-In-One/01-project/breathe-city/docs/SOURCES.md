# 代码依据、素材来源与授权

核对日期：2026-09-20。以下资料用于编写适配器，不代表已用真实凭据联调。

- Tripo 文生 3D v3： https://developers.tripo3d.ai/en/docs/generation-text-to-model/standard
- Tripo 查询： https://developers.tripo3d.ai/en/docs/task-query
- World Labs World API： https://docs.worldlabs.ai/api
- Decart 快速开始： https://docs.platform.decart.ai/getting-started/quickstart
- Decart 客户端令牌： https://docs.platform.decart.ai/getting-started/client-tokens
- Decart 令牌接口： https://docs.platform.decart.ai/api-reference/create-client-token
- Decart JavaScript 实时： https://docs.platform.decart.ai/sdks/javascript-realtime
- SegFormer 模型卡： https://huggingface.co/Xenova/segformer-b0-finetuned-ade-512-512

项目不包含模型权重、第三方字体、第三方街景照片或其他人的 3D 模型。park / blocks / rooftop 是 `tools/make-demo-assets.py` 创建的原创矢量插画；对应蒙版来自同一绘制坐标。seedpod.glb 是同一脚本创建的原创程序化静态网格，不是 Tripo 生成结果。world.html 是原创 Canvas 程序化演示，不是 World Labs 生成结果。

MIT 许可证只覆盖本项目原创代码与素材，不授予 Decart、Tripo、World Labs、Transformers.js 或相关模型的商业权利。请在正式发布前核对其实际许可证、API 条款、转售 / 输出使用 / 数据保留规定。没有使用未经许可的厂商品牌 Logo，仅使用文字标识。
