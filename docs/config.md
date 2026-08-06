# pet.config.json 字段详解

改完重启 `pnpm dev` 生效。缺的字段自动用默认值，整段删掉也不会崩。

```jsonc
{
  "model": {
    "path": "model/your-model/xxx.model3.json",  // 相对 src/renderer/public/
    "heightRatio": 1.0,  // 模型画布高 = 窗口高 × 这个数（人物小就调大，2~4常见）
    "x": 0.5,            // 模型中心横向位置（窗口宽度比例）
    "y": 0.5             // 纵向位置（可以>1，heightRatio大了人物会沉下去，用y抬回来）
  },

  "window": {
    "width": 420,
    "height": 640,
    "transparent": true,   // 透明背景桌宠悬浮（顶部中间有隐形拖动条，hover可见）
    "alwaysOnTop": true,   // 置顶
    "fullscreen": false,   // true=铺满整个屏幕（配副屏用，macOS会盖住菜单栏）
    "display": "primary"   // "secondary"=有副屏时去副屏
  },

  "port": 3470,            // 身体API端口
  "name": "Pet",           // 说话字幕框的名牌

  "inject": {
    "mode": "none",             // "none" | "tmux" | "command"（详见 docs/api.md）
    "tmuxTarget": "claude:0.0", // tmux模式的目标 session:窗口.面板
    "command": null,            // command模式：["cmd","arg1",...]，{message}占位符
    "messages": {               // 各触摸事件注入的文案
      "stroke": "[pet-touch] 你被摸摸了！",
      "double": "[pet-touch] 你被戳了一下！",
      "dizzy": "[pet-touch] 你被晃晕了！"
    }
  },

  "tts": {
    "command": null,            // ["edge-tts","--text","{text}",...]，{text}占位符
    "output": "audio/speak.mp3" // 命令跑完后音频落在这里（相对项目根，.wav/.mp3都行）
  },

  "defaultFace": {},   // 平时的默认脸（建议给一点微笑，见 docs/model-adaptation.md）
  "expressions": {},   // 按表情覆盖参数表（给哪个表情就整个替换哪个）
  "dizzyExtras": {}    // 晃晕特效附加参数（脸青/冒汗等，值=最大强度）
}
```
