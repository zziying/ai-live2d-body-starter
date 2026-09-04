// 表情表 —— 默认只用Cubism标准参数（任何按官方规范建的模型都有），
// pet.config.json 的 expressions/defaultFace 字段可以按你的模型覆盖/扩展。
//
// 标准参数速查（常用）：
//   ParamEyeLOpen/ParamEyeROpen  眼开度 0..1
//   ParamEyeLSmile/ParamEyeRSmile 眯眼笑 0..1
//   ParamMouthForm  嘴型 -1(垮)..1(笑)    ParamMouthOpenY 张嘴 0..1
//   ParamBrowLY/ParamBrowRY  眉毛高低 -1..1
//   ParamBrowLAngle/ParamBrowRAngle 眉毛角度   ParamBrowLForm/ParamBrowRForm 眉形
//   ParamCheek  脸红 0..1（很多模型有）
// 你的模型如果有专属特效参数（脸红贴图/流泪/生气符号），在config里加进对应表情即可。

export interface ExpressionTables {
  defaultFace: Record<string, number>
  map: Record<string, Record<string, number>>
  /** 表情系统会碰的全部参数（切换表情时需要归位）。眼开度不在这里 —— 它走独立通道。 */
  allParams: string[]
}

// 内置组合刻意收着：建模师画好的默认脸是最好看的底子，我们只在上面轻轻推。
// 每个参数拉满在有的模型上是^^，在有的模型上是半眯眼露牙的坏笑（三个实测模型
// 两个嫌重）。想要更用力的表情，在 pet.config.json 的 expressions 里按模型写。
export const BUILTIN_MAP: Record<string, Record<string, number>> = {
  happy: {
    ParamEyeLSmile: 0.6, ParamEyeRSmile: 0.6,
    ParamMouthForm: 0.8, ParamMouthOpenY: 0.2,
  },
  love: {
    ParamEyeLSmile: 0.7, ParamEyeRSmile: 0.7,
    ParamMouthForm: 0.7,
    ParamCheek: 1,
  },
  shy: {
    ParamEyeLSmile: 0.4, ParamEyeRSmile: 0.4,
    ParamMouthForm: 0.3,
    ParamCheek: 0.8,
  },
  sad: {
    ParamBrowLY: -0.7, ParamBrowRY: -0.7,
    ParamMouthForm: -0.7,
  },
  angry: {
    ParamBrowLY: -1, ParamBrowRY: -1,
    ParamBrowLAngle: -1, ParamBrowRAngle: -1,
    ParamMouthForm: -0.9, ParamMouthOpenY: 0.2,
  },
  gloomy: {
    ParamEyeLOpen: 0.55, ParamEyeROpen: 0.55,
    ParamBrowLY: -0.5, ParamBrowRY: -0.5,
    ParamMouthForm: -0.3,
  },
  neutral: {},
}

/** 内置表情名（exp3同名自动匹配用） */
export const BUILTIN_EMOTIONS = Object.keys(BUILTIN_MAP)

// 眼开度（ParamEyeLOpen/ParamEyeROpen）不进重置循环 —— 它有独立通道：
// 表情基值 × 眨眼因子。当年把它放进循环里用0做默认值，gloomy的半闭眼
// 就这么被静默压掉了好几周。
const EYE_OPEN_PARAMS = new Set(['ParamEyeLOpen', 'ParamEyeROpen'])

export function buildExpressionTables(
  configExpressions: Record<string, Record<string, number>> = {},
  configDefaultFace: Record<string, number> = {},
): ExpressionTables {
  // config里给了哪个表情，就整个覆盖哪个表情（不做参数级合并，好推理）
  const map: Record<string, Record<string, number>> = { ...BUILTIN_MAP }
  for (const [emotion, params] of Object.entries(configExpressions)) {
    map[emotion] = params
  }

  const all = new Set<string>()
  for (const params of Object.values(map)) {
    for (const id of Object.keys(params)) {
      if (!EYE_OPEN_PARAMS.has(id)) all.add(id)
    }
  }
  for (const id of Object.keys(configDefaultFace)) {
    if (!EYE_OPEN_PARAMS.has(id)) all.add(id)
  }

  return { defaultFace: configDefaultFace, map, allParams: [...all] }
}
