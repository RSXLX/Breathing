#!/bin/bash
set -eu
BASE="$(cd "$(dirname "$0")" && pwd)"
cd "$BASE/01-project/breathe-city"
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js was not found. Prepare Node.js >= 22.16.0 and run this script again.'
  exit 1
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<16)){console.error("Node.js >= 22.16.0 is required.");process.exit(1);}'
printf '\nBreathe City: http://localhost:3000 (default configuration)\nStop: Ctrl+C\n\n'
exec node server/index.mjs
