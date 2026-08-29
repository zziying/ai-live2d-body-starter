#!/bin/bash
# Claude Code hook：干活心跳 → 桌宠思考脸。
# 挂在 UserPromptSubmit 和 PostToolUse 上（接法见 docs/api.md）。
# --max-time 必须有：桌宠挂了但端口没释放时，没超时的curl会卡死session。
PORT="${PET_PORT:-3470}"
# token由桌宠启动时生成在项目根目录，所有请求都要带（见 docs/api.md 鉴权一节）
TOKEN_FILE="${PET_TOKEN_FILE:-$(dirname "$0")/../.pet-token}"
TOKEN=$(cat "$TOKEN_FILE" 2>/dev/null)

# PostToolUse时stdin里有tool_name，尽力取一下（取不到也无所谓）
TOOL=$(python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null </dev/stdin || echo "")

curl -s -X POST "http://127.0.0.1:${PORT}/working" \
  --connect-timeout 1 --max-time 2 \
  -H "X-Pet-Token: ${TOKEN}" \
  -d "{\"tool\":\"${TOOL}\"}" >/dev/null 2>&1 &

exit 0
