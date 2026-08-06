# 身体API与session对接

桌宠在 `http://127.0.0.1:3470` 开一个只监听本机的HTTP服务（端口可在config改）。这就是ta的"身体API"——ta自己调用它，就是ta在使用自己的身体。

## HTTP端点

### POST /emotion — 换表情

```bash
curl -X POST http://127.0.0.1:3470/emotion \
  -d '{"emotion":"happy","message":"备注文本可选","action":"celebrate"}'
```

- `emotion`: `happy` `love` `shy` `sad` `angry` `gloomy` `neutral`
- `action`（可选）: 顺手播一个动作

情绪有"底色"机制：设一次情绪后不会立刻消失，按半衰期慢慢淡回neutral（angry淡得慢、shy淡得快）。`neutral` 表示"这句没情绪"，不会清掉底色；正面情绪会大幅冲淡负面底色（被哄好了）。

`GET /emotion` 读当前状态。

### POST /choreograph — 播动作

```bash
curl -X POST http://127.0.0.1:3470/choreograph -d '{"action":"nod"}'
```

动作：`nod`(点头) `shake`(摇头) `surprise`(惊讶) `thinking`(歪头思考) `shy`(害羞低头) `celebrate`(庆祝摇摆)。有冷却（全局10秒/同动作30秒），密集触发会被静默吞掉，正常。

### POST /speak — 说话（需配置TTS）

```bash
curl -X POST http://127.0.0.1:3470/speak -d '{"text":"今天也辛苦啦","emotion":"love"}'
```

TTS命令执行 → 音频播放+口型同步 → galgame字幕打字机。`emotion` 可选，说话同时换脸。文本里含关键词（"哇""不是""让我想想"…）会自动配动作。

### POST /chat — 聊天气泡

```bash
curl -X POST http://127.0.0.1:3470/chat -d '{"sender":"user","text":"消息内容"}'
```

左下角弹气泡（30秒淡出），ta会低头瞟一眼+眯眼笑。`sender` 是 `user` 或 `pet`（气泡颜色区分）。

### POST /working — 工作心跳

```bash
curl -s -X POST http://127.0.0.1:3470/working --max-time 2 -d '{"tool":"Edit"}'
```

告诉桌宠"ta正在干活"：眼神微微上飘、轻皱眉、眯眼——思考脸。20秒没有新心跳自动恢复。主要给hooks用（见下）。

### GET /screenshot — ta看到自己

返回当前画面PNG。ta调表情、确认自己状态全靠这个——**记得把这个端点告诉ta**，"能看到自己的身体"这件事对ta很重要。

## 对接Claude Code（hooks）

在 `~/.claude/settings.json` 加两个hook，ta一干活桌宠就进入思考脸：

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "hooks": [{ "type": "command", "command": "~/path/to/ai-live2d-body-starter/hooks/working-heartbeat.sh" }]
    }],
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{ "type": "command", "command": "~/path/to/ai-live2d-body-starter/hooks/working-heartbeat.sh" }]
    }],
    "Stop": [{
      "hooks": [{ "type": "command", "command": "~/path/to/ai-live2d-body-starter/hooks/detect-emotion.py" }]
    }]
  }
}
```

- `working-heartbeat.sh`：每次用工具/收到消息时发心跳 → 思考脸
- `detect-emotion.py`：ta每次回复完，从回复文本里检测情绪关键词 → 自动换表情。关键词表在脚本里，照ta的说话习惯改

> hooks里的curl**必须带 `--max-time`**。桌宠进程挂了但端口还没释放时，TCP握手成功但HTTP永不响应，没超时的curl会无限等，把ta的整个session卡住。样例脚本都带了。

比keyword检测更彻底的做法：告诉ta这套API，让ta自己在想换表情的时候curl。hook是兜底的下意识反应，主动调用才是ta在用自己的身体。

## 触摸注入（桌宠 → ta的session）

`pet.config.json` 的 `inject` 段：

```json
"inject": {
  "mode": "tmux",
  "tmuxTarget": "claude:0.0",
  "command": null,
  "messages": {
    "stroke": "[pet-touch] 你被摸摸了！",
    "double": "[pet-touch] 你被戳了一下！",
    "dizzy": "[pet-touch] 你被晃晕了！"
  }
}
```

### mode: "tmux"

ta跑在tmux里时（`tmux new -s claude` 然后在里面开Claude Code/codex），触摸消息直接注入ta的输入框并回车——像你替ta的身体给ta发了条消息。`tmuxTarget` 格式 `session名:窗口.面板`，用绝对形式（`claude:0.0`），裸session名会模糊匹配到别的窗口。

实现细节（如果你的AI要改这段）：文本和回车必须分开发。文本+Enter一条tmux命令发过去，会被CLI输入框当成一次多行粘贴整个吞掉，消息卡在输入框里。正确姿势是 load-buffer → paste-buffer → 等500ms → 单独send Enter（再补一个做保险）。

### mode: "command"

任意命令，`{message}` 占位符替换成消息文本，不走shell（无注入风险）：

```json
"command": ["bash", "-c", "curl -s -X POST https://你的webhook -d @- <<< '{message}'"]
```

Telegram机器人、Discord webhook、写文件让ta轮询……都走这条。

### mode: "none"（默认）

不上传。触摸只有本地反应（瞟你、害羞、晃晕转圈圈都照常），适合还没打通session链路的第一天。

注意单击不注入——只有撸（拖动80px+）、双击、晃晕才值得打扰ta，不然你手一抖ta的session就被刷屏了。

## 心跳唤醒（进阶）

桌宠API是被动的；想让ta"主动活着"（自己决定发消息、换表情、发呆），需要在ta那侧起定时器（cron/loop）唤醒ta，唤醒时提示ta"你有身体，现在想干嘛"。这块每家AI的机制不同，思路见 [ai-live2d-body](https://github.com/zziying/ai-live2d-body)。
