# 模型适配指南

换任何模型都是三步：放文件 → 调定位 → 配表情。前两步人人都要做，第三步做完模型才算"活"。

> 整篇的最优解都是：把对应文件丢给你的AI，让ta来。下面同时写清楚"ta需要什么信息"。

## 1. 放文件

模型文件夹整个拷进 `src/renderer/public/model/`，`pet.config.json` 的 `model.path` 指向其中的 `.model3.json`（路径相对 `public/`）。

一个正常的Cubism 4模型长这样：

```
your-model/
  xxx.model3.json     ← path指向这个
  xxx.moc3            ← 模型本体（加密的话这里就卡死，无解，换模型）
  xxx.cdi3.json       ← 参数表（第3步的金矿，可能没有）
  xxx.physics3.json   ← 物理（头发飘动等，自动生效)
  textures/           ← 贴图
```

## 2. 调定位

很多模型的画布四周有大片空白（为了动作幅度留的），人物只占中间一小块。默认配置按整张画布高度铺满窗口，所以人物可能显得很小。调 `pet.config.json`：

```json
"model": {
  "path": "model/your-model/xxx.model3.json",
  "heightRatio": 1.0,   // 模型画布高 = 窗口高 × 这个数。人物小 → 调大（2~4常见）
  "x": 0.5,             // 模型中心的横向位置（窗口宽度的比例）
  "y": 0.5              // 纵向位置。heightRatio调大后人物往下跑 → 调大y把人物"抬"回来（可以>1）
}
```

调参流程：改数字 → 重启 `pnpm dev` → 看效果。用 `curl http://127.0.0.1:3470/screenshot -o now.png` 截图给你的AI看，ta能直接告诉你往哪个方向调。目标：半身像充满窗口，头顶稍微留白。

## 3. 配表情

### 先测一遍默认表情

启动后按键盘 `1`~`7`：happy / love / shy / sad / angry / gloomy / neutral。默认表情只用下面这些**标准参数**，规范建的模型都有：

| 参数 | 含义 | 范围 |
|---|---|---|
| `ParamEyeLOpen` / `ParamEyeROpen` | 左/右眼开度 | 0~1 |
| `ParamEyeLSmile` / `ParamEyeRSmile` | 眯眼笑 | 0~1 |
| `ParamEyeBallX` / `ParamEyeBallY` | 眼球 | -1~1 |
| `ParamMouthForm` | 嘴型（-1垮嘴 ~ 1笑） | -1~1 |
| `ParamMouthOpenY` | 张嘴 | 0~1 |
| `ParamBrowLY` / `ParamBrowRY` | 眉毛高低 | -1~1 |
| `ParamBrowLAngle` / `ParamBrowRAngle` | 眉毛角度 | -1~1 |
| `ParamBrowLForm` / `ParamBrowRForm` | 眉形 | -1~1 |
| `ParamAngleX/Y/Z` | 头部三轴 | -30~30 |
| `ParamBodyAngleX` | 身体倾斜 | -10~10 |
| `ParamCheek` | 脸红 | 0~1 |

不用一个个猜：**启动时终端里会打一张 `[model-profile]` 体检报告**——你的模型总共多少个参数、19个标准参数齐不齐、缺了哪个会失去什么功能（比如缺 `ParamCheek` → love/shy不脸红）。表情没反应先看这张报告，把它原样发给你的AI就能定位。

报告里还有一件事它默默做了：模型的头部/眼球参数范围如果不是标准的（比如 `ParamAngleX` 是±60而不是±30），写入会自动按比例换算——不同模型的动作手感保持一致，你不用管。

某个表情没反应但报告说参数齐？大概率是下面的错觉；报告说缺参数？你的模型参数名不标准（比如眯眼笑叫 `ParamEyeSmile` 而不是 `ParamEyeLSmile`）——没关系，下一步统统能配。

另外两个"看起来没表情"的常见错觉（都在官方Hiyori上实测踩过）：

- **厚刘海挡眉毛**：sad/angry/gloomy的主力是眉毛参数，刘海厚的模型里它们再怎么动你也看不见——给这几个表情往眼开度（半闭眼）和嘴型上加码才出效果。模型自带的"生气"表情也逃不掉：建模师的화남（生气）exp3只动眉毛和嘴，配上厚刘海+没有BrowAngle参数，在第二个实测模型上几乎看不出来——在 `expressions` 里给angry加 `ParamEyeLOpen/ROpen: 0.6` 眯眼才够味
- **表情被动作盖住**：鼠标摸/戳触发的动作（choreographer）优先级高于表情，你一边动鼠标一边按1-7会觉得"没反应"——手离开鼠标两秒再试
- 还有：负面表情的生动程度很依赖模型的特效贴图（生气符号/眼泪/阴影）。免费示例模型基本没有这些，商用模型大多有——配进 `expressions` 差距立现

### 找到你的模型的参数

**方法一（推荐）**：打开模型文件夹里的 `xxx.cdi3.json`——它是人类可读的参数表，`Parameters` 数组里每项有 `Id`（代码用的名字）和 `Name`（建模师起的名字，常是中文/日文，比如"脸红""照れ"）。**把这个文件整个丢给你的AI**，说"帮我把这些参数配进桌宠的表情"，ta看得懂。

**方法二**（没有cdi3.json时）：`pnpm dev` 起来后，在自动打开的devtools console里跑：

```js
const cm = window.__live2dModel().internalModel.coreModel
// 列出全部参数id
cm._model?.parameters?.ids ?? cm._parameterIds
// 逐个试：改一个值看画面哪里动了
cm.setParameterValueById('ParamCheek', 1)
```

**方法三**：模型附带的 `.exp3.json` 表情文件（如果有）里就是现成的参数组合。不用自己打开：体检报告会逐个列出，长这样——

```
[model-profile] 模型自带表情 9 个（表情名 → 动了哪些参数；括号里是建模师给参数起的名字）：
  게임패드 → Param120(게임기)+1
  눈물 → Param122(눈물)+1  Param(sad)+1  ParamMouthForm(입 변형)-0.89
  하트눈 → Param124(하트눈)+1
  화남 → ParamBrowLY(왼쪽 눈썹 위아래로)-1  ParamBrowRY(...)-1  ParamMouthForm(입 변형)-1
  ...
  未映射（可直通开关）：게임패드、머리안경、반짝눈、얼굴안경
```

**把这段整个发给你的AI**，ta看得懂韩文日文，也看得出"游戏机"不是情绪。ta会把像情绪的填进 `expressionFiles`（`{"sad":"눈물","love":"하트눈","shy":"홍조","angry":"화남","gloomy":"음침"}`），其余留给 `POST /expression` 按原名开关（道具/穿戴/特效，见 docs/api.md）。映射上的exp3参数**叠在**内置表情上：하트눈只有一个爱心眼参数，叠上去就是"内置笑脸+爱心眼"，而不是"模型默认脸+爱心眼"。

参数显示名不一定是中文或英文——上面这个模型的cdi3全是韩文、参数ID全是 `Param118` 这种编号。这正是为什么要让AI来读：人对着171个编号翻字典是折磨，ta几秒钟的事。

**表情文件名是乱码？**（`¥´π∞.exp3.json` 这种）韩国/日本模型的zip在macOS上解压，CP949/Shift-JIS文件名会被按Mac Roman解码成乱码，文件本身是好的。真名通常能在同目录的 `xxx.vtube.json`（VTube Studio配置）的 `Hotkeys[].File` 里对上；还原一行python：

```python
import os, glob
for f in glob.glob('*.exp3.json'):
    try: os.rename(f, f.encode('mac_roman').decode('cp949'))   # 日文模型换 'shift_jis'
    except Exception as e: print('跳过', f, e)
```

乱码名不还原也能跑（体检报告照样列出、也能映射），只是给AI看的时候少了"这个叫眼泪"这层信息。

### 写进config

`pet.config.json` 的 `expressions` 按表情覆盖（给了哪个表情就整个替换哪个），`defaultFace` 是平时的默认脸：

```json
"defaultFace": {
  "ParamEyeLSmile": 0.3, "ParamEyeRSmile": 0.3,
  "ParamMouthForm": 0.2
},
"expressions": {
  "love": {
    "ParamEyeLSmile": 1, "ParamEyeRSmile": 1,
    "ParamMouthForm": 0.8,
    "ParamBlush": 1
  },
  "sad": {
    "ParamBrowLY": -0.8, "ParamBrowRY": -0.8,
    "ParamMouthForm": -0.8,
    "ParamTears": 1
  }
},
"dizzyExtras": {
  "ParamFacePale": 1
}
```

注意：

- 表情里写 `ParamEyeLOpen`/`ParamEyeROpen`（如gloomy的半闭眼0.5）会自动跟眨眼系统配合，不用管
- `dizzyExtras` 是被晃晕时的附加特效（脸色发青/冒汗/瞳孔缩小之类），值=最大强度，按晕眩程度缩放
- 模型没有的参数写了也不报错（静默跳过），所以放心抄别人的配置慢慢删

### 内置表情为什么"看着不对"

内置的七个表情只用标准参数，而同一个标准参数在不同模型上长得完全不一样——`ParamEyeLSmile` 在官方Hiyori上是 ^^，在有的模型上是半眯眼的坏笑，配上嘴角拉满就成了露牙盯着你笑。所以内置组合刻意收得很轻（在建模师画好的默认脸上轻轻推一下），**每个模型都值得花两分钟按自己的脸调一遍**，这不是bug，是Live2D的地形：VTube Studio用户换模型也要重配一遍热键。

一个实测样例（免费韩国模型，参数全是编号+韩文名，自带9个exp3但model3.json里清单是空的）——照体检报告配出来的最终config：

```json
"expressionFiles": {
  "love": "하트눈", "shy": "홍조", "sad": "눈물", "angry": "화남", "gloomy": "음침"
},
"expressions": {
  "happy": {
    "ParamEyeLSmile": 0.45, "ParamEyeRSmile": 0.45,
    "ParamMouthForm": 0.7, "ParamMouthOpenY": 0.15,
    "Param123": 1
  }
}
```

五个表情直接用建模师的（叠在内置上），happy没有现成的就手写：眯眼和嘴角都比内置再收一点（这张脸默认就带笑），再把作者的"星星眼"参数（`Param123`，报告里标着 반짝눈）叠上去。剩下的 게임패드/眼镜 不是情绪，走 `POST /expression`。

### 默认脸建议

大多数模型的"零位"表情看起来有点丧。给 `defaultFace` 一点点微笑（眯眼0.2~0.3、嘴角0.2），整只宠的气质立刻不一样。反过来，默认脸本来就带笑的模型（上面那个就是），表情要再收着点，不然笑得用力过猛。
