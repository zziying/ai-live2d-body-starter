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

- **厚刘海挡眉毛**：sad/angry/gloomy的主力是眉毛参数，刘海厚的模型里它们再怎么动你也看不见——给这几个表情往眼开度（半闭眼）和嘴型上加码才出效果
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

**方法三**：模型附带的 `.exp3.json` 表情文件（如果有）里就是现成的参数组合，打开抄参数名和值即可。

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

### 默认脸建议

大多数模型的"零位"表情看起来有点丧。给 `defaultFace` 一点点微笑（眯眼0.2~0.3、嘴角0.2），整只宠的气质立刻不一样。
