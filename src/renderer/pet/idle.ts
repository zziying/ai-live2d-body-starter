// idle状态机：5秒东张西望（眼跳）→ 5分钟犯困 → 15分钟打瞌睡。
import type { PetState } from './state'

export interface IdleBehavior {
  eyeX: number
  eyeY: number
  headX: number
  headY: number
  eyeOpen?: number
  saccade?: boolean
  dozing?: boolean
}

// --- 眼跳(saccade)：像人一样按不规则间隔跳视线，而不是正弦扫来扫去 ---
// 离散分布（400ms一档）：7.5%概率800ms快速连跳，峰值停留1200-2800ms，
// 还有一条"就这么盯着某处看一会儿"的长尾。
const SACCADE_DIST: Array<[number, number]> = [
  [0.075, 800], [0.185, 1200], [0.310, 1600], [0.450, 2000], [0.575, 2400],
  [0.625, 2800], [0.665, 3200], [0.695, 3600], [0.715, 4000], [1.000, 4400],
]

function saccadeInterval(): number {
  const r = Math.random()
  for (const [cum, start] of SACCADE_DIST) {
    if (r <= cum) return start + Math.random() * 400
  }
  return 2000
}

export function createIdleMachine(state: PetState) {
  let idleTimer = 0
  let saccadeEyeX = 0
  let saccadeEyeY = 0
  let nextSaccadeAt = 0

  function tick(dt: number): IdleBehavior | null {
    const idleSeconds = (Date.now() - state.lastMouseMove) / 1000

    if (idleSeconds < 5) {
      idleTimer = 0
      return null
    }

    idleTimer += dt

    // Phase 0: 好奇地东张西望（5s-5min）—— 眼跳，头部跟着视线走
    if (idleSeconds < 300) {
      const now = Date.now()
      if (now >= nextSaccadeAt) {
        saccadeEyeX = -1 + Math.random() * 2
        saccadeEyeY = -0.5 + Math.random() * 1.2
        nextSaccadeAt = now + saccadeInterval()
      }
      return {
        eyeX: saccadeEyeX,
        eyeY: saccadeEyeY,
        headX: saccadeEyeX * 22,
        headY: saccadeEyeY * 14,
        saccade: true,
      }
    }

    // Phase 1: 犯困（5min-15min）
    if (idleSeconds < 900) {
      const t = idleTimer * 0.2
      return {
        eyeX: Math.sin(t) * 0.4,
        eyeY: -0.3,
        headX: Math.sin(t * 0.3) * 12,
        headY: -10 + Math.sin(t * 0.2) * 4,
        eyeOpen: 0.3,
      }
    }

    // Phase 2: 打瞌睡（15min+）
    const t = idleTimer * 0.12
    const nod = Math.sin(t * 0.5)
    return {
      eyeX: 0,
      eyeY: -0.4,
      headX: Math.sin(t * 0.2) * 5,
      headY: -20 + nod * 5,
      eyeOpen: 0,
      dozing: true,
    }
  }

  return { tick }
}
