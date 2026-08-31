// 每帧有序参数管线（分层思想提炼自 moeru-ai/airi 的 motion-manager 插件阶段）。
// 我们不跑SDK motion（autoInteract: false），所以一条链就是全部：
// 注册顺序即层叠顺序，后注册的插件覆盖先注册的。
import type { IdleBehavior } from './idle'

/** 每帧共享上下文。前面的插件填字段，后面的插件读。 */
export interface FrameCtx {
  /** Live2D core model —— 参数写入口 */
  cm: any
  /** 距上一帧的秒数 */
  dt: number
  /** 每帧取一次的 Date.now() */
  now: number
  /** idle状态机输出，用户活跃时为null（setup填） */
  idle: IdleBehavior | null
  /** choreographer本帧的关键帧输出，无动作时为null（setup填） */
  choreo: Record<string, number> | null
  /** 本帧被动作占用的参数id —— 其他插件不得写这些（setup填） */
  choreoActive: Set<string>
  /** 平滑后的工作强度 0..1（setup填） */
  work: number
  /** 平滑后的视线、弹簧头部输出 —— dizzy用它们做混合基准 */
  gazeX: number
  gazeY: number
  headX: number
  headY: number
  headZ: number
}

export interface PetPlugin {
  /** 出现在错误日志里 —— 单个插件出错不能炸掉整帧 */
  name: string
  update: (ctx: FrameCtx) => void
}

export function createPipeline() {
  const plugins: PetPlugin[] = []

  function register(plugin: PetPlugin) {
    plugins.push(plugin)
  }

  function run(ctx: FrameCtx) {
    for (const plugin of plugins) {
      try {
        plugin.update(ctx)
      } catch (e) {
        console.error(`[pipeline:${plugin.name}]`, e)
      }
    }
  }

  return { register, run }
}

// 角度类参数的写入缩放（模型profile探测后注册，见 profile.ts）。
// 管线幅度按标准范围打，非标范围的模型靠这层换算，插件代码不用感知。
let angleScale: Record<string, number> = {}

export function setPipelineAngleScale(scale: Record<string, number>) {
  angleScale = scale
}

/** 容错写参数：模型没有这个参数时静默跳过（不同模型参数表差异很大） */
export function setParam(cm: any, id: string, value: number) {
  try {
    const s = angleScale[id]
    cm.setParameterValueById(id, s ? value * s : value)
  } catch {}
}

/** 容错读参数：没有则返回0 */
export function getParam(cm: any, id: string): number {
  try {
    return cm.getParameterValueById(id) ?? 0
  } catch {
    return 0
  }
}
