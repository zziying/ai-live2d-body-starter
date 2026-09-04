// 模型自带表情（.exp3.json）加载：建模师调好的表情几乎总是比我们的标准参数
// 组合生动（带特效贴图联动），所以表情的优先级是——
//
//   pet.config.json 的 expressions（手写覆盖，整表替换）
//     > 模型自带 exp3 叠在内置表情上（同名自动接；名字对不上就配 expressionFiles）
//       > 内置默认组合（expressions.ts 的 BUILTIN_MAP，纯标准参数fallback）
//
// "叠"的意思：exp3 写了的参数用 exp3 的，没写的用内置表情补。建模师的特效型
// 表情往往只有一个自定义参数（爱心眼=Param124），整表替换会把笑脸参数全丢掉，
// 全靠模型默认脸兜着——默认脸面无表情的模型上 love 就成了"面无表情+爱心眼"。
//
// exp3 的 Blend 语义：Add=在参数默认值上加，Multiply=乘，Overwrite=直接写。
// 我们的管线每帧写绝对值，所以这里按模型参数表的默认值预先折算成绝对值。

export type ParamTable = Record<string, number>

interface Exp3Def { Name: string; File: string }

/** 模型自带表情：折算后的参数表 + 给报告用的原始参数行 */
export interface Exp3Set {
  tables: Record<string, ParamTable>
  /** 表情名 → 报告行（"Param122(눈물)+1  ParamMouthForm-0.89"） */
  summary: Record<string, string>
}

/** 读 cdi3.json 的参数显示名（建模师起的名字，常是中日韩文）；没有就空表 */
async function loadDisplayNames(modelPath: string, baseDir: string): Promise<Record<string, string>> {
  try {
    const res = await fetch('/' + modelPath.replace(/^\//, ''))
    if (!res.ok) return {}
    const model3 = await res.json()
    const cdi = model3?.FileReferences?.DisplayInfo
    if (!cdi) return {}
    const cdiRes = await fetch(baseDir + cdi)
    if (!cdiRes.ok) return {}
    const cdiJson = await cdiRes.json()
    const names: Record<string, string> = {}
    for (const p of cdiJson.Parameters ?? []) {
      if (p.Id && p.Name && p.Name !== p.Id) names[p.Id] = p.Name
    }
    return names
  } catch {
    return {}
  }
}

/** 从model3.json的Expressions清单（空则扫目录）加载全部exp3 */
export async function loadExp3Expressions(
  modelPath: string,
  settings: any,
  defaults: Record<string, number>,
): Promise<Exp3Set> {
  let defs: Exp3Def[] = settings?.expressions ?? []

  // 清单空 ≠ 没表情：不少模型的exp3文件躺在目录里但没登记进model3.json。
  // 让main扫一遍模型目录兜底，文件名（去掉.exp3.json）当表情名。
  if (!defs.length) {
    const files: string[] = (await window.electronAPI.listExp3?.()) || []
    defs = files.map(f => ({
      Name: f.replace(/^.*\//, '').replace(/\.exp3\.json$/, ''),
      File: f,
    }))
  }
  if (!defs.length) return { tables: {}, summary: {} }

  const baseDir = '/' + modelPath.replace(/^\//, '').replace(/[^/]*$/, '')
  const displayNames = await loadDisplayNames(modelPath, baseDir)
  const tables: Record<string, ParamTable> = {}
  const summary: Record<string, string> = {}

  await Promise.all(defs.map(async (def) => {
    try {
      const res = await fetch(baseDir + def.File)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const table: ParamTable = {}
      const parts: string[] = []
      for (const p of json.Parameters ?? []) {
        const d = defaults[p.Id] ?? 0
        table[p.Id] =
          p.Blend === 'Overwrite' ? p.Value :
          p.Blend === 'Multiply' ? d * p.Value :
          d + p.Value  // Add（exp3的默认Blend）
        const label = displayNames[p.Id] ? `${p.Id}(${displayNames[p.Id]})` : p.Id
        const op = p.Blend === 'Overwrite' ? '=' : p.Blend === 'Multiply' ? '×' : (p.Value >= 0 ? '+' : '')
        parts.push(`${label}${op}${+Number(p.Value).toFixed(2)}`)
      }
      tables[def.Name] = table
      summary[def.Name] = parts.join('  ') || '（空）'
    } catch (e) {
      console.warn(`[exp3] 表情"${def.Name}"加载失败（${def.File}）:`, (e as Error).message)
    }
  }))

  return { tables, summary }
}

/**
 * 把模型自带表情接到内置emotion上，exp3参数叠在内置参数表上：
 * 1) expressionFiles 显式映射（emotion → exp3名）
 * 2) 同名自动匹配（忽略大小写），未被映射占用的emotion才参与
 * 返回 emotion → 合并后的参数表，以及 emotion → 用了哪个exp3（报告用）
 */
export function mapExp3ToEmotions(
  exp3: Record<string, ParamTable>,
  builtin: Record<string, ParamTable>,
  expressionFiles: Record<string, string>,
): { tables: Record<string, ParamTable>; used: Record<string, string> } {
  const used: Record<string, string> = {}

  const lower: Record<string, string> = {}
  for (const name of Object.keys(exp3)) lower[name.toLowerCase()] = name

  for (const emo of Object.keys(builtin)) {
    const hit = lower[emo.toLowerCase()]
    if (hit) used[emo] = hit
  }
  for (const [emo, name] of Object.entries(expressionFiles)) {
    if (exp3[name]) {
      used[emo] = name
    } else {
      console.warn(`[exp3] expressionFiles里"${emo}"指向的表情"${name}"不存在 —— 可用：${Object.keys(exp3).join('、') || '（无）'}`)
    }
  }

  const tables: Record<string, ParamTable> = {}
  for (const [emo, name] of Object.entries(used)) {
    tables[emo] = { ...(builtin[emo] ?? {}), ...exp3[name] }
  }
  return { tables, used }
}

/**
 * 体检报告的表情段。写给setup时在旁边的那个AI看的：每个exp3动了哪些参数、
 * 建模师给参数起的名字——ta据此判断哪些像情绪（写进expressionFiles）、
 * 哪些是道具/穿戴/特效开关（留给 POST /expression 直通）。
 */
export function reportExp3(set: Exp3Set, used: Record<string, string>) {
  const names = Object.keys(set.tables)
  if (!names.length) return
  const usedNames = new Set(Object.values(used))
  const lines = [`[model-profile] 模型自带表情 ${names.length} 个（表情名 → 动了哪些参数；括号里是建模师给参数起的名字）：`]
  for (const n of names) {
    const tag = Object.entries(used).filter(([, v]) => v === n).map(([emo]) => emo)
    lines.push(`  ${n} → ${set.summary[n]}${tag.length ? `   ⇐ 已接到 ${tag.join('/')}` : ''}`)
  }
  const free = names.filter(n => !usedNames.has(n))
  lines.push(
    `  与内置表情同名的已自动接上（exp3参数叠在内置表情上）。其余请你的AI照上表判断：` +
    `像情绪的写进 pet.config.json 的 expressionFiles（如 {"sad": "${free[0] ?? names[0]}"}）；` +
    `道具/穿戴/特效开关不用硬凑情绪，POST /expression 按原名直接开关`
  )
  if (free.length) lines.push(`  未映射（可直通开关）：${free.join('、')}`)
  console.warn(lines.join('\n'))
}
