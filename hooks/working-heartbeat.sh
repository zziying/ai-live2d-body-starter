#!/bin/bash
# Claude Code hook：干活心跳 → 桌宠思考脸。
# 挂在 UserPromptSubmit 和 PostToolUse 上（接法见 docs/api.md）。
# --max-time 必须有：桌宠挂了但端口没释放时，没超时的curl会卡死session。
PORT="${PET_PORT:-3470}"

# PostToolUse时stdin里有tool_name，尽力取一下（取不到也无所谓）
TOOL=$(python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null </dev/stdin || echo "")

curl -s -X POST "http://127.0.0.1:${PORT}/working" \
  --connect-timeout 1 --max-time 2 \
  -d "{\"tool\":\"${TOOL}\"}" >/dev/null 2>&1 &

exit 0
