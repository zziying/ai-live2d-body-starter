// 模型参数profile：加载后从coreModel读出全部参数的 id/min/max，做两件事——
//
// 1) 体检报告：对照标准参数清单，缺哪个就说清哪个功能会降级（console.warn，
//    会转发到 pnpm dev 的终端里）。模型"没反应"时先看这张报告，把它原样发给
//    你的AI就能定位。
// 2) 角度缩放：管线里的头部/眼球幅度按 Cubism 标准范围（Angle±30、Body±10、
//    EyeBall±1）打的。模型实际范围更小时，写超的值会被core钳位——表现为头一转
//    就顶死在边上；范围更大时则动作幅度显得蔫。这里按真实范围算一个缩放系数，
//    setParam 写入时自动乘上，模型间手感一致。
//
// 参数范围只在 .moc3 里（cdi3.json 只有名字没有范围），所以从运行时的
// coreModel 读，不依赖 cdi3 存在。

export interface ModelProfile {
  /** 参数id → {min, max, def}；读不出参数表时为空（宽松模式，行为同从前） */
  ranges: Record<string, { min: number; max: number; def: number }>
  /** 角度类参数的写入缩放系数（模型范围/标准范围），缺省1 */
  angleScale: Record<string, number>
}

// 管线会写的角度类参数及其假设的标准半幅
const STD_HALF_RANGE: Record<string, number> = {
  ParamAngleX: 30,
  ParamAngleY: 30,
  ParamAngleZ: 30,
  ParamBodyAngleX: 10,
  ParamEyeBallX: 1,
  ParamEyeBallY: 1,
}

// 标准参数 → 缺了会失去什么（体检报告用）
const STANDARD_PARAMS: Array<[string, string]> = [
  ['ParamAngleX', '头部左右转（追鼠标/点头摇头）'],
  ['ParamAngleY', '头部上下转'],
  ['ParamAngleZ', '歪头'],
  ['ParamBodyAngleX', '身体跟随摆动'],
  ['ParamEyeBallX', '眼神左右追踪'],
  ['ParamEyeBallY', '眼神上下追踪'],
  ['ParamEyeLOpen', '左眼开合（眨眼）'],
  ['ParamEyeROpen', '右眼开合（眨眼）'],
  ['ParamEyeLSmile', '眯眼笑（happy/love/瞟聊天气泡）'],
  ['ParamEyeRSmile', '眯眼笑'],
  ['ParamMouthOpenY', '张嘴（口型同步）'],
  ['ParamMouthForm', '嘴型（微笑/撇嘴）'],
  ['ParamBrowLY', '眉毛高低（sad/angry/思考脸）'],
  ['ParamBrowRY', '眉毛高低'],
  ['ParamBrowLAngle', '眉毛角度（angry）'],
  ['ParamBrowRAngle', '眉毛角度'],
  ['ParamBrowLForm', '眉形（思考脸皱眉）'],
  ['ParamBrowRForm', '眉形'],
  ['ParamCheek', '脸红（love/shy）'],
]

/** 兼容取Cubism core原生模型：framework的CubismModel包着_model，字段名看版本 */
function coreParams(cm: any): { ids: string[]; min: Float32Array; max: Float32Array; def: Float32Array } | null {
  const core = cm?.getModel?.() ?? cm?._model ?? null
  const p = core?.parameters
  if (p?.ids?.length) {
    return { ids: p.ids, min: p.minimumValues, max: p.maximumValues, def: p.defaultValues }
  }
  return null
}

export function buildModelProfile(cm: any): ModelProfile {
  const ranges: ModelProfile['ranges'] = {}
  const angleScale: ModelProfile['angleScale'] = {}

  const p = coreParams(cm)
  if (!p) {
    console.warn('[model-profile] 读不到参数表（SDK结构变了？），跳过体检和角度缩放，行为同旧版')
    return { ranges, angleScale }
  }

  for (let i = 0; i < p.ids.length; i++) {
    ranges[p.ids[i]] = { min: p.min[i], max: p.max[i], def: p.def[i] }
  }

  for (const [id, stdHalf] of Object.entries(STD_HALF_RANGE)) {
    const r = ranges[id]
    if (!r) continue
    const half = Math.max(Math.abs(r.min), Math.abs(r.max))
    if (half > 0 && Math.abs(half - stdHalf) > 0.001) {
      angleScale[id] = half / stdHalf
    }
  }

  // --- 体检报告 ---
  const missing = STANDARD_PARAMS.filter(([id]) => !ranges[id])
  const scaled = Object.entries(angleScale)
  const lines = [
    `[model-profile] 参数 ${p.ids.length} 个，标准参数 ${STANDARD_PARAMS.length - missing.length}/${STANDARD_PARAMS.length} 齐`,
  ]
  for (const [id, what] of missing) {
    lines.push(`  缺 ${id} → ${what} 不生效（模型没这个参数，不是bug；有同功能的自定义参数就配进 pet.config.json 的 expressions/defaultFace）`)
  }
  for (const [id, s] of scaled) {
    const r = ranges[id]
    lines.push(`  ${id} 范围 ${r.min}..${r.max}（非标准）→ 写入自动×${s.toFixed(2)}`)
  }
  console.warn(lines.join('\n'))

  return { ranges, angleScale }
}
