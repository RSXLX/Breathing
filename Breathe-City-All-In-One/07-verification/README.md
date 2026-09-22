# 本次打包核验

日期：2026-09-21。实际环境：Linux、Node.js v22.16.0。

已执行：

```bash
npm run check
npm test
python tests/runtime_smoke.py
```

语法检查通过；43 项 Node 测试通过；7 项本地 CLI/HTTP/SQLite/演示 worker 检查通过，付费调用为 0。详见 `recheck-2026-09-21.log`。

`source-preservation.json`：原 ZIP 中的 83 个文件，与解压后的项目逐字节相同。

`sample-asset-check.json`：对随包样例 GLB 的文件头和 JSON 元数据进行结构检查，不代替真机渲染或实际 Tripo 调用。

未重新执行：浏览器全套交互、相机权限、手机 Safari 编码、IndexedDB 真机持久化、真实语义模型下载、付费云 API、硬件、Windows 启动、macOS 双击权限、Docker。Mac 启动脚本只做语法检查和 Linux Bash 启动链路复核；不能说本次在 Mac/Windows 真机运行通过。

原先的浏览器等测试记录随原项目保留于 `01-project/breathe-city/docs/qa/`；不要把历史记录和本次记录混在一起。

总包 `SHA256SUMS.txt` 列出除其自身外每个文件的摘要，`FILE_MANIFEST.json` 是除清单自身与 SHA 表以外的文件索引。
