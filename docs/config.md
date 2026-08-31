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

  "panels": {
    "enabled": false,   // 左上角信息面板：时钟（纯本地）+天气行
    "weatherUrl": ""    // 天气接口自己填，返回一行文本就行。例：
                        // "https://wttr.in/Tokyo?format=%C+%t"（免费无key，city换你的）
                        // 留空=只显示时钟。10分钟拉一次，挂了只是天气行消失
  },

  "backgrounds": {
    "enabled": false    // 背景图轮换，图丢进 src/renderer/public/backgrounds/ 即用（不用重启）
                        // 文件名 day_*/night_* 分白天(7:00-19:00)/夜里池，无前缀两池通用
                        // 时段切换时随机换一张，2.5s交叉淡入；没图时窗口保持透明
                        // 适合 fullscreen 场景模式——透明小窗开了会变成一张矩形卡片
  },

  "tuning": {
    "lipSyncGain": 30,     // 口型增益：说话嘴几乎不动→调大；一直大张→调小
    "lipSyncGate": 0.008   // 口型门限：不说话嘴皮乱颤（TTS底噪）→调大
  },

  "defaultFace": {},      // 平时的默认脸（建议给一点微笑，见 docs/model-adaptation.md）
  "expressions": {},      // 按表情覆盖参数表（给哪个表情就整个替换哪个），优先级最高
  "expressionFiles": {},  // 模型自带表情(.exp3.json)映射：{"sad": "A01.流泪"}
                          // 值=model3.json Expressions清单里的Name，启动报告会打出可用清单
                          // 与内置表情同名的exp3不用配，自动采用
  "dizzyExtras": {}       // 晃晕特效附加参数（脸青/冒汗等，值=最大强度）
}
```

## 表情的三层优先级

同一个表情（如sad），谁说了算：`expressions` 手写参数（整表覆盖）> 模型自带exp3（`expressionFiles` 映射的或同名自动匹配的）> 内置标准参数组合（fallback）。建模师调好的表情几乎总是更生动——模型带表情文件就优先用人家的，内置组合只是兜底。

## 日夜主题

不用配置，一直开着：19:00-7:00整套UI换暗玻璃+浅色字（对话框、聊天气泡、信息面板），白天换回亮玻璃+墨字，切换1s过渡。想改配色的话在 `src/renderer/App.vue` 顶部搜 `.app-container.night`，是一组CSS变量。
