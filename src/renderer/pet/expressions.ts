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

const BUILTIN_MAP: Record<string, Record<string, number>> = {
  happy: {
    ParamEyeLSmile: 1, ParamEyeRSmile: 1,
    ParamMouthForm: 1, ParamMouthOpenY: 0.4,
  },
  love: {
    ParamEyeLSmile: 1, ParamEyeRSmile: 1,
    ParamMouthForm: 0.8,
    ParamCheek: 1,
  },
  shy: {
    ParamEyeLSmile: 0.5, ParamEyeRSmile: 0.5,
    ParamMouthForm: 0.3,
    ParamCheek: 1,
  },
  sad: {
    ParamBrowLY: -0.8, ParamBrowRY: -0.8,
    ParamMouthForm: -0.8,
  },
  angry: {
    ParamBrowLY: -1, ParamBrowRY: -1,
    ParamBrowLAngle: -1, ParamBrowRAngle: -1,
    ParamMouthForm: -1, ParamMouthOpenY: 0.3,
  },
  gloomy: {
    ParamEyeLOpen: 0.5, ParamEyeROpen: 0.5,
    ParamBrowLY: -0.5, ParamBrowRY: -0.5,
    ParamMouthForm: -0.3,
  },
  neutral: {},
}

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
