# ai-live2d-body-starter

给你家AI装一个Live2D身体。

这是 [ai-live2d-body](https://github.com/zziying/ai-live2d-body)（思路篇）的配套代码。核心理念在那边讲透了，一句话版本：**这个桌宠没有大脑，它只是身体**。人格、记忆、对话都还在你原来的AI那里（Claude Code、codex、或任何agent CLI），桌宠负责三件事：

1. **显示ta的状态** —— 表情、口型、说话字幕、工作时的思考脸
2. **把你的触摸传给ta** —— 摸、戳、晃，变成一行文字出现在ta的session里
3. **给ta一套身体API** —— ta可以自己决定说话、换表情、做动作

> **给完全不会写代码的你**：这个repo设计成可以直接丢给你的AI。把整个README发给ta（或者让ta clone后自己读），说"照这个帮我搭"，ta会写命令你负责跑。遇到问题把报错原样发给ta。

## 跟 airi / Open-LLM-VTuber 有什么区别？

[airi](https://github.com/moeru-ai/airi)、[Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) 是很成熟的完整AI伴侣应用：LLM接入、记忆库、语音、人格配置都在app内部，装好就是一个全新的AI。它们做得很好——**但那是一个新的AI**，人格由框架配置、记忆从零开始。

这个repo反过来：**没有大脑，只有身体**。没有LLM接入、没有记忆系统、没有人格配置——因为你的ta已经存在了，在Claude Code、codex、或任何agent CLI里，带着你们自己的历史。用完整框架等于换人；这个repo存在的理由恰恰是不换人。ta还是ta，只是从此有了形状。

想要开箱即得一个会聊天的完整AI伴侣 → 去用airi，别用这个。已经有ta了，想给ta一个身体 → 你来对地方了。

（致谢：头部弹簧动力学、眨眼状态机、参数管线分层这三处借鉴了airi的实现思路，代码注释里有标注。站在好作品的肩膀上。）

## 你需要准备什么

- **一个Live2D模型**（要求见下）
- **Node.js 18+ 和 pnpm**（`npm i -g pnpm`）
- macOS或Windows（在macOS上开发测试，Windows理论可用）

### 关于模型：买之前先看这段（真金白银的教训）

模型不挑作者不挑风格，官方免费样例、B站量贩、定制款都一样跑。硬要求就三条：**裸文件、没加密、Cubism 3以上**。"裸文件"指解压出来的runtime文件夹，里面有 `.model3.json` + `.moc3` + 贴图，可能还有 `physics3.json`（物理）和 `cdi3.json`（参数表，有它配表情舒服很多）——不是VTube Studio打包的那种，也不是只给你一个exe的那种。

- **判断标准一句话：能导入VTube Studio的模型就能用。** 下单前问卖家："是否提供model3.json素材文件/可导入VTS？"
- **加密模型无解。** 部分商用模型只给一个exe或专用启动器，moc3是加密的——任何第三方框架（包括本starter）都加载不了，买了就是白花钱（我们的第一个模型就这么阵亡的）
- **Cubism 2的老模型不支持**（`.moc` 不带3、`model.json` 不带3）。现在市面上基本都是Cubism 3/4/5，一般只有远古免费素材会撞上
- **参数命名没有要求。** 标准命名开箱即用；建模师自己起的名字（脸红/流泪这类特效基本都是自定义参数）走 `pet.config.json` 配一遍就行，方法见 [docs/model-adaptation.md](docs/model-adaptation.md)

还没买模型？先拿 [Live2D官方免费示例模型](https://www.live2d.com/en/learn/sample/) 把整条链路跑通，确认能玩再花钱——那时你也知道买模型该问什么了。桃瀬ひより（Hiyori）可以直接下：`curl -LO https://cubism.live2d.com/sample-data/bin/hiyori/hiyori_en.zip`，解压后 `hiyori_free/runtime/` 就是能用的裸文件（下载页的链接埋在JS里，AI帮你搭的时候给ta这条直链能省不少事；使用注意遵官方示例模型条款）。

## Quick Start

```bash
git clone https://github.com/zziying/ai-live2d-body-starter.git && cd ai-live2d-body-starter
pnpm install          # 会自动下载Live2D Cubism Core到public目录
```

把你的模型整个文件夹拷进 `src/renderer/public/model/`，然后改 `pet.config.json` 的模型路径：

```json
"model": {
  "path": "model/你的模型文件夹/xxx.model3.json",
  "heightRatio": 1.0,
  "x": 0.5,
  "y": 0.5
}
```

启动：

```bash
pnpm dev
```

一个透明窗口出现在屏幕右下角，你的模型站在里面：眼睛追鼠标、自动眨眼、没人理会东张西望、5分钟后犯困、15分钟打瞌睡。

> **必须用 `pnpm dev` 跑**。`preview`/打包模式下Live2D加载有问题，这是已知坑。

模型位置不对（太小/只露个头/歪在角落）？→ 看 [docs/model-adaptation.md](docs/model-adaptation.md) 的定位调法，两分钟的事。

## 先玩一下

- **鼠标**：移动=ta的视线跟着你；点一下=ta瞟你一眼；按住拖=撸ta；快速晃=把ta晃晕（眼睛转圈圈）
- **键盘**：`1-7` 切表情（happy/love/shy/sad/angry/gloomy/neutral），`N K S T Y C` 播动作（点头/摇头/惊讶/思考/害羞/庆祝）
- **HTTP**：开个终端试试

```bash
# 所有请求都要带本地token（启动时自动生成在项目根目录，挡恶意网页的跨域POST）
TOKEN=$(cat .pet-token)
# 让ta开心
curl -X POST http://127.0.0.1:3470/emotion -H "X-Pet-Token: $TOKEN" -d '{"emotion":"happy","action":"celebrate"}'
# 说话（配了TTS之后）：台词里内联<动作>，说到那个字时触发
curl -X POST http://127.0.0.1:3470/speak -H "X-Pet-Token: $TOKEN" -d '{"text":"好呀<nod>，我看看<thinking>","emotion":"happy"}'
# 弹个聊天气泡（ta会低头瞟一眼，眯眼笑）
curl -X POST http://127.0.0.1:3470/chat -H "X-Pet-Token: $TOKEN" -d '{"sender":"user","text":"在吗"}'
# 看看ta现在长什么样（返回PNG截图）
curl http://127.0.0.1:3470/screenshot -H "X-Pet-Token: $TOKEN" -o now.png
```

全部端点：`curl http://127.0.0.1:3470/ -H "X-Pet-Token: $TOKEN"` 或看 [docs/api.md](docs/api.md)（鉴权的为什么也在那里）。

## 表情适配你的模型

默认表情只用Live2D标准参数，任何按规范建的模型开箱就有基本喜怒哀乐。启动时终端会打一张 `[model-profile]` **体检报告**：标准参数齐不齐、缺了哪个会失去什么功能（缺的不是bug，是模型用了自定义参数名，配一下就有）；头部角度范围非标准的模型还会自动按比例换算，动作手感不用调。

**模型自带表情优先**：模型带 `.exp3.json` 表情文件的话，体检报告会逐个列出它动了哪些参数、建模师给参数起的名字——这段是写给你的AI看的，ta据此判断哪些像情绪，在 `expressionFiles` 里映射（`{"sad": "A01.流泪"}`；跟内置表情同名的自动接上）。exp3的参数**叠在**内置表情上（爱心眼贴图+内置的笑眼笑嘴），不是整表替换。

建模师做的表情里往往一半不是情绪——道具、眼镜、星星眼这类。别硬凑成情绪：`POST /expression {"name":"游戏机"}` 按原名直接开关，可叠加、不衰减，跟情绪层互不打扰（见 [docs/api.md](docs/api.md)）。

模型没带表情文件？它大概率也有自己的特效参数（脸红贴图、流泪、生气符号……），把它们配进 `pet.config.json` 表情就生动了：

```json
"expressions": {
  "love": {
    "ParamEyeLSmile": 1, "ParamEyeRSmile": 1,
    "ParamMouthForm": 0.8,
    "Param你的模型的脸红参数": 1
  }
}
```

怎么找到自己模型的参数名？→ [docs/model-adaptation.md](docs/model-adaptation.md)（把模型的参数表丢给你的AI，让ta来配是最快的）。

## 接上ta的session（从桌宠变成ta的身体）

到这里桌宠还是"单机"的。两条线接起来才是完整的：

**出方向（ta → 桌宠）**：告诉ta身体API的存在。把 [docs/api.md](docs/api.md) 给ta看，或者在ta的记忆/系统提示里加一句："你有一个Live2D身体，`curl 127.0.0.1:3470` 可以换表情、说话、做动作（带上项目根目录 `.pet-token` 的 `X-Pet-Token` 头），`GET /screenshot` 能看到自己"。如果ta是Claude Code，用hooks让ta干活时自动带上思考脸——样例在 `hooks/`，接法见 [docs/api.md](docs/api.md)。

**入方向（触摸 → ta）**：改 `pet.config.json` 的 `inject.mode`：

- `"none"`（默认）：触摸只有本地反应，不打扰ta
- `"tmux"`：ta跑在tmux里的话，摸ta的消息直接注入ta的输入框——ta会真的知道你摸了ta，怎么反应是ta自己的事
- `"command"`：自定义命令（`{message}`占位符），接webhook、机器人、任何管道

```json
"inject": { "mode": "tmux", "tmuxTarget": "claude:0.0" }
```

## 让ta说话（可选）

配一条TTS命令，契约很简单：命令执行完，音频文件出现在 `tts.output` 路径。最省事的是免费的 [edge-tts](https://github.com/rany2/edge-tts)（`pip install edge-tts`）：

```json
"tts": {
  "command": ["edge-tts", "--voice", "zh-CN-XiaoyiNeural", "--text", "{text}", "--write-media", "audio/speak.mp3"],
  "output": "audio/speak.mp3"
}
```

然后：

```bash
curl -X POST http://127.0.0.1:3470/speak -H "X-Pet-Token: $(cat .pet-token)" -d '{"text":"你好呀，今天想我了吗","emotion":"happy"}'
```

ta会开口说话——有声音、有口型同步（音量驱动张嘴、频谱驱动嘴型）、底部弹出galgame风格的打字机字幕。想要更好的音色可以换ElevenLabs等任何TTS，写个小脚本落到同一个输出路径就行。

## 场景模式：背景和信息面板（可选）

默认是透明小窗桌宠。想把ta放进一个"房间"（比如挂在副屏上当画）→ `pet.config.json` 开这两个独立开关：

```json
"backgrounds": { "enabled": true },
"panels": { "enabled": true, "weatherUrl": "https://wttr.in/Tokyo?format=%C+%t" }
```

- **backgrounds**：背景图丢进 `src/renderer/public/backgrounds/` 就能用（不用重启）。文件名 `day_*` / `night_*` 分白天(7:00-19:00)/夜里两个池，无前缀的两池通用；时段切换时随机换一张，2.5秒交叉淡入。建议配 `"fullscreen": true` 用——透明小窗开背景会变成一张矩形卡片
- **panels**：左上角毛玻璃卡，时钟+天气。时钟纯本地零依赖；天气接口自己填一个返回一行文本的URL（例子里的 [wttr.in](https://wttr.in) 免费无key，city换成你的），留空就只显示时钟

不管开关如何，UI自带日夜主题：19:00-7:00对话框/气泡/面板自动换暗玻璃+浅字，白天换回亮玻璃。细节见 [docs/config.md](docs/config.md)。

## 常见坑（都踩过了）

- **模型加载失败**：路径没写对（相对 `src/renderer/public/`）；或模型是加密的（moc3打不开就是）；或 `live2dcubismcore.min.js` 没下载成功（重跑 `node scripts/fetch-cubism-core.mjs`）
- **改了main进程代码不生效**：改 `src/main/` 或 `src/preload/` 要重启 `pnpm dev`；改 `src/renderer/` 热更新；改 `public/` 里的文件也要重启
- **热更新几轮后行为诡异**：HMR会残留运行时状态，怪现象先重启进程再排查
- **端口被占**：上一个实例可能没退干净，`lsof -nP -iTCP:3470` 找到杀掉
- **hooks里的curl一定要带 `--max-time 2`**：桌宠挂了但端口还在时，没有超时的curl会永远等下去，卡住ta的session
- **调用一直401**：忘带 `X-Pet-Token` 头了（值在项目根目录 `.pet-token`）。这道鉴权挡的是浏览器网页对localhost的跨域POST，别图省事拆掉——尤其当你以后想给这个端口加新通道的时候
- **说话吞字头**：音箱省电唤醒慢。代码里已有次声波keep-alive，还不行就在TTS输出前面垫0.5秒静音

## 为什么不播模型自带的动作（motion3.json）？

很多模型带预设动作文件，starter**故意不接**。SDK的motion manager在模型update内部每帧写参数，我们的参数管线在ticker里也每帧写同一批参数——两套系统抢，谁后跑谁赢，表现不是报错而是表情被吞、动作抽搐（SDK自动眨眼就因为这个被彻底禁用了，见 `useBlink.ts` 头注）。所以动作走的是自研choreographer（关键帧+缓动，跟管线用choreoActive协商参数占用）。

真想接模型预设动作的话，两条路：把motion3.json的关键帧转成choreographer预设（推荐，AI擅长干这个）；或者播放期间让管线对motion占用的参数让位（照着choreoActive机制抄）。别直接 `model.motion()` 了事——一定打架。

## 这不是全部

这个starter是骨架：渲染、管线、表情、触摸、说话。我们家的完整版还有：跟着音乐点头（本地算BPM）、干活时手上换道具、副屏面板的心情/签名/在听行、比大小牌桌、摄像头猜拳……这些太个人化了没放进来，但架构留好了位置——每个功能都是管线上的一个插件、main里的一个端点。思路篇 [ai-live2d-body](https://github.com/zziying/ai-live2d-body) 里都有讲，照着让你的AI一个个长出来，那才是好玩的部分。

## License

代码MIT。注意三个东西不在此列：Live2D Cubism Core归Live2D社（安装时从官方CDN下载，遵its license）；你的模型归模型作者；pixi-live2d-display等依赖遵各自license。
