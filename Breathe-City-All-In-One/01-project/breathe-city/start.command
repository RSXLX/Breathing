#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  printf '\n需要先安装 Node.js 22.16 或更新版本。安装后重新运行此脚本。\n'
  exit 1
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<16)){console.error("需要 Node.js >=22.16，当前 "+process.version);process.exit(1)}'
node -e 'try{require.resolve("sharp");require.resolve("ffmpeg-static")}catch{console.error("请先在项目目录执行 npm ci 安装依赖");process.exit(1)}'
printf '\nBreathe City: 打开 http://localhost:3000（自定义 PORT 时以服务输出为准）\nCtrl+C 结束。无需密钥即可使用本地演示。\n\n'
exec node server/index.mjs
