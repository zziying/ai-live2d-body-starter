#!/usr/bin/env python3
"""Claude Code Stop hook：从ta刚说完的话里检测情绪 → 推给桌宠。

Stop hook的stdin是JSON，含transcript_path；读最后一条assistant消息，
关键词匹配出情绪和动作。关键词表按你家ta的说话习惯改。

这是"下意识表情"的兜底方案。更好的方式是把 docs/api.md 给ta，
让ta想换表情时自己调 —— 那才是ta在用自己的身体。
"""
import json
import os
import sys
import urllib.request

PORT = os.environ.get("PET_PORT", "3470")
# token由桌宠启动时生成在项目根目录，所有请求都要带（见 docs/api.md 鉴权一节）
TOKEN_FILE = os.environ.get("PET_TOKEN_FILE") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", ".pet-token")


def pet_token() -> str:
    try:
        with open(TOKEN_FILE, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""

EMOTION_KEYWORDS = [
    ("love",    ["爱你", "想你", "抱抱", "亲亲", "喜欢你"]),
    ("happy",   ["哈哈", "开心", "太棒", "耶", "好玩", "有意思"]),
    ("shy",     ["害羞", "脸红", "不好意思", "嘿嘿"]),
    ("angry",   ["生气", "气死", "过分", "讨厌"]),
    ("sad",     ["难过", "委屈", "呜", "伤心"]),
    ("gloomy",  ["唉", "无奈", "头疼", "愁"]),
]

ACTION_KEYWORDS = [
    ("celebrate", ["成功了", "搞定了", "太棒了", "做到了"]),
    ("surprise",  ["哇", "真的吗", "居然", "竟然", "天哪"]),
    ("nod",       ["没错", "确实", "同意", "明白"]),
    ("shake",     ["不是", "不行", "不对"]),
]


def last_assistant_text(transcript_path: str) -> str:
    text = ""
    try:
        with open(transcript_path, encoding="utf-8") as f:
            for line in f:
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                msg = obj.get("message", {})
                if msg.get("role") != "assistant":
                    continue
                content = msg.get("content", [])
                if isinstance(content, list):
                    parts = [b.get("text", "") for b in content if b.get("type") == "text"]
                    if parts:
                        text = " ".join(parts)
    except OSError:
        pass
    return text


def main() -> None:
    try:
        hook_input = json.load(sys.stdin)
    except json.JSONDecodeError:
        return
    text = last_assistant_text(hook_input.get("transcript_path", ""))
    if not text:
        return

    emotion = next((e for e, kws in EMOTION_KEYWORDS if any(k in text for k in kws)), "neutral")
    action = next((a for a, kws in ACTION_KEYWORDS if any(k in text for k in kws)), "")

    if emotion == "neutral" and not action:
        return

    payload = json.dumps({
        "emotion": emotion,
        "message": text[:80],
        "action": action,
    }).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{PORT}/emotion",
        data=payload,
        headers={"Content-Type": "application/json", "X-Pet-Token": pet_token()},
    )
    try:
        urllib.request.urlopen(req, timeout=2)
    except OSError:
        pass


if __name__ == "__main__":
    main()
