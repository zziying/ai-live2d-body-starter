// 自研眨眼状态机，乘法调制（思路借鉴 moeru-ai/airi 的 auto-eye-blink 插件）。
// SDK自带的eyeBlink会在我们的ticker之后直接覆写眼开度，表情的半闭眼永远显示不出来
// （gloomy的眯眼被它默默吃掉过几周）。所以彻底禁用SDK眨眼，改成乘法：
// 最终眼开度 = 表情基值 × 眨眼因子。眯眼表情按眯眼幅度眨，接近全闭时干脆跳过眨眼
// （0 × 因子会诡异地抽动）。

const CLOSE_MS = 75
const OPEN_MS_MIN = 150
const OPEN_MS_MAX = 300
const INTERVAL_MIN = 3000
const INTERVAL_MAX = 8000
const SKIP_THRESHOLD = 0.15 // 表情已经近乎闭眼 → 不眨

export function useBlink() {
  let phase: 'idle' | 'closing' | 'opening' = 'idle'
  let phaseStart = 0
  let openDuration = OPEN_MS_MIN
  let nextBlinkAt = Date.now() + INTERVAL_MIN + Math.random() * (INTERVAL_MAX - INTERVAL_MIN)

  // 返回本帧乘进眼开度的眨眼因子 0..1
  function factor(now: number, eyeBase: number): number {
    if (phase === 'idle') {
      if (now >= nextBlinkAt) {
        if (eyeBase <= SKIP_THRESHOLD) {
          nextBlinkAt = now + INTERVAL_MIN + Math.random() * (INTERVAL_MAX - INTERVAL_MIN)
          return 1
        }
        phase = 'closing'
        phaseStart = now
      }
      return 1
    }
    if (phase === 'closing') {
      const t = Math.min(1, (now - phaseStart) / CLOSE_MS)
      if (t >= 1) {
        phase = 'opening'
        phaseStart = now
        openDuration = OPEN_MS_MIN + Math.random() * (OPEN_MS_MAX - OPEN_MS_MIN)
        return 0
      }
      const eased = 1 - (1 - t) * (1 - t) // easeOutQuad —— 眼皮快速落下
      return 1 - eased
    }
    // opening
    const t = Math.min(1, (now - phaseStart) / openDuration)
    if (t >= 1) {
      phase = 'idle'
      nextBlinkAt = now + INTERVAL_MIN + Math.random() * (INTERVAL_MAX - INTERVAL_MIN)
      return 1
    }
    return t * t // easeInQuad —— 眼皮缓缓抬起
  }

  // 立刻眨一下（比如被点了一下）。眨到一半时是no-op。
  function blinkNow() {
    if (phase === 'idle') nextBlinkAt = 0
  }

  return { factor, blinkNow }
}
