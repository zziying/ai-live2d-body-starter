// 模型自带表情（.exp3.json）加载：建模师调好的表情几乎总是比我们的标准参数
// 组合生动（带特效贴图联动），所以表情的优先级是——
//
//   pet.config.json 的 expressions（手写覆盖）
//     > 模型自带 exp3（同名自动采用；名字对不上就配 expressionFiles 映射）
//       > 内置默认组合（expressions.ts 的 BUILTIN_MAP，纯标准参数fallback）
//
// exp3 的 Blend 语义：Add=在参数默认值上加，Multiply=乘，Overwrite=直接写。
// 我们的管线每帧写绝对值，所以这里按模型参数表的默认值预先折算成绝对值。

export type ParamTable = Record<string, number>

/** 从model3.json的Expressions清单加载全部exp3，返回 表情名→参数表 */
export async function loadExp3Expressions(
  modelPath: string,
  settings: any,
  defaults: Record<string, number>,
): Promise<Record<string, ParamTable>> {
  let defs: Array<{ Name: string; File: string }> = settings?.expressions ?? []

  // 清单空 ≠ 没表情：不少模型的exp3文件躺在目录里但没登记进model3.json。
  // 让main扫一遍模型目录兜底，文件名（去掉.exp3.json）当表情名。
  if (!defs.length) {
    const files: string[] = (await window.electronAPI.listExp3?.()) || []
    defs = files.map(f => ({
      Name: f.replace(/^.*\//, '').replace(/\.exp3\.json$/, ''),
      File: f,
    }))
  }
  if (!defs.length) return {}

  const baseDir = '/' + modelPath.replace(/^\//, '').replace(/[^/]*$/, '')
  const out: Record<string, ParamTable> = {}

  await Promise.all(defs.map(async (def) => {
    try {
      const res = await fetch(baseDir + def.File)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const table: ParamTable = {}
      for (const p of json.Parameters ?? []) {
        const d = defaults[p.Id] ?? 0
        table[p.Id] =
          p.Blend === 'Overwrite' ? p.Value :
          p.Blend === 'Multiply' ? d * p.Value :
          d + p.Value  // Add（exp3的默认Blend）
      }
      out[def.Name] = table
    } catch (e) {
      console.warn(`[exp3] 表情"${def.Name}"加载失败（${def.File}）:`, (e as Error).message)
    }
  }))

  const names = Object.keys(out)
  if (names.length) {
    console.warn(
      `[model-profile] 模型自带表情 ${names.length} 个：${names.join('、')}\n` +
      `  与内置表情同名的自动采用；其余在 pet.config.json 的 expressionFiles 里映射，如 {"sad": "${names[0]}"}`
    )
  }
  return out
}

/**
 * 把模型自带表情按名字接到内置emotion上：
 * 1) expressionFiles 显式映射（emotion → exp3名）
 * 2) 同名自动匹配（忽略大小写），未被映射占用的emotion才参与
 */
export function mapExp3ToEmotions(
  exp3: Record<string, ParamTable>,
  emotionNames: string[],
  expressionFiles: Record<string, string>,
): Record<string, ParamTable> {
  const out: Record<string, ParamTable> = {}

  const lower: Record<string, string> = {}
  for (const name of Object.keys(exp3)) lower[name.toLowerCase()] = name

  for (const emo of emotionNames) {
    const hit = lower[emo.toLowerCase()]
    if (hit) out[emo] = exp3[hit]
  }
  for (const [emo, name] of Object.entries(expressionFiles)) {
    if (exp3[name]) {
      out[emo] = exp3[name]
    } else {
      console.warn(`[exp3] expressionFiles里"${emo}"指向的表情"${name}"不存在 —— 可用：${Object.keys(exp3).join('、') || '（无）'}`)
    }
  }
  return out
}
