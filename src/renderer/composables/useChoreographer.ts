// 关键帧+缓动的动作引擎。6个内置动作全部只用标准参数，任何模型通用。
import { onMounted } from 'vue'

interface KeyFrame {
  params: Record<string, number>
  duration: number
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
}

interface Choreography {
  steps: KeyFrame[]
}

interface PlayState {
  choreo: Choreography
  stepIndex: number
  elapsed: number
  startValues: Record<string, number>
  captured: boolean
}

const EASINGS: Record<string, (t: number) => number> = {
  linear: t => t,
  easeIn: t => t * t,
  easeOut: t => 1 - (1 - t) * (1 - t),
  easeInOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
}

const PRESETS: Record<string, Choreography> = {
  nod: {
    steps: [
      { params: { ParamAngleY: -22, ParamBodyAngleX: 2 }, duration: 200, easing: 'easeOut' },
      { params: { ParamAngleY: 8 }, duration: 200, easing: 'easeInOut' },
      { params: { ParamAngleY: -14 }, duration: 160, easing: 'easeInOut' },
      { params: { ParamAngleY: 0, ParamBodyAngleX: 0 }, duration: 220, easing: 'easeOut' },
    ],
  },
  shake: {
    steps: [
      { params: { ParamAngleX: -20, ParamBodyAngleX: -2, ParamEyeLOpen: 0.1, ParamEyeROpen: 0.1 }, duration: 150, easing: 'easeOut' },
      { params: { ParamAngleX: 20, ParamBodyAngleX: 2, ParamEyeLOpen: 0.1, ParamEyeROpen: 0.1 }, duration: 250, easing: 'easeInOut' },
      { params: { ParamAngleX: -12, ParamBodyAngleX: -1, ParamEyeLOpen: 0.5, ParamEyeROpen: 0.5 }, duration: 200, easing: 'easeInOut' },
      { params: { ParamAngleX: 0, ParamBodyAngleX: 0, ParamEyeLOpen: 1, ParamEyeROpen: 1 }, duration: 200, easing: 'easeOut' },
    ],
  },
  surprise: {
    steps: [
      { params: { ParamAngleY: 15, ParamAngleZ: -4, ParamBodyAngleX: -5, ParamEyeLOpen: 1.3, ParamEyeROpen: 1.3, ParamBrowLY: 1, ParamBrowRY: 1, ParamMouthOpenY: 0.5 }, duration: 100, easing: 'easeOut' },
      { params: { ParamAngleY: 15, ParamAngleZ: -4, ParamBodyAngleX: -5, ParamEyeLOpen: 1.3, ParamEyeROpen: 1.3, ParamBrowLY: 1, ParamBrowRY: 1, ParamMouthOpenY: 0.5 }, duration: 1500, easing: 'linear' },
      { params: { ParamAngleY: 0, ParamAngleZ: 0, ParamBodyAngleX: 0, ParamEyeLOpen: 1, ParamEyeROpen: 1, ParamBrowLY: 0, ParamBrowRY: 0, ParamMouthOpenY: 0 }, duration: 400, easing: 'easeOut' },
    ],
  },
  thinking: {
    steps: [
      { params: { ParamAngleX: 12, ParamAngleY: -5, ParamAngleZ: 8 }, duration: 400, easing: 'easeOut' },
      { params: { ParamAngleX: 12, ParamAngleY: -5, ParamAngleZ: 8 }, duration: 1200, easing: 'linear' },
      { params: { ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0 }, duration: 500, easing: 'easeInOut' },
    ],
  },
  shy: {
    steps: [
      { params: { ParamAngleX: -15, ParamAngleY: -8, ParamAngleZ: -5 }, duration: 350, easing: 'easeOut' },
      { params: { ParamAngleX: -15, ParamAngleY: -8, ParamAngleZ: -5 }, duration: 700, easing: 'linear' },
      { params: { ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0 }, duration: 500, easing: 'easeInOut' },
    ],
  },
  celebrate: {
    steps: [
      { params: { ParamAngleY: 12, ParamAngleZ: -10, ParamBodyAngleX: -4, ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1, ParamMouthOpenY: 0.7 }, duration: 150, easing: 'easeOut' },
      { params: { ParamAngleY: 12, ParamAngleZ: 10, ParamBodyAngleX: 4, ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1, ParamMouthOpenY: 0.7 }, duration: 280, easing: 'easeInOut' },
      { params: { ParamAngleY: 12, ParamAngleZ: -8, ParamBodyAngleX: -3, ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1, ParamMouthOpenY: 0.7 }, duration: 280, easing: 'easeInOut' },
      { params: { ParamAngleY: 10, ParamAngleZ: 0, ParamBodyAngleX: 0, ParamEyeLSmile: 1, ParamEyeRSmile: 1, ParamMouthForm: 1, ParamMouthOpenY: 0.5 }, duration: 500, easing: 'easeOut' },
      { params: { ParamAngleY: 0, ParamAngleZ: 0, ParamBodyAngleX: 0, ParamEyeLSmile: 0, ParamEyeRSmile: 0, ParamMouthForm: 0, ParamMouthOpenY: 0 }, duration: 400, easing: 'easeInOut' },
    ],
  },
}

const GLOBAL_COOLDOWN = 10_000
const SAME_COOLDOWN = 30_000

export function useChoreographer() {
  let currentPlay: PlayState | null = null
  let lastPlayTime = 0
  let lastPlayName = ''

  function play(name: string, opts?: { cooldownMs?: number; sameCooldownMs?: number }): boolean {
    const now = Date.now()
    if (now - lastPlayTime < (opts?.cooldownMs ?? GLOBAL_COOLDOWN)) return false
    if (name === lastPlayName && now - lastPlayTime < (opts?.sameCooldownMs ?? SAME_COOLDOWN)) return false

    const choreo = PRESETS[name]
    if (!choreo) return false

    lastPlayTime = now
    lastPlayName = name
    currentPlay = { choreo, stepIndex: 0, elapsed: 0, startValues: {}, captured: false }
    return true
  }

  function tick(dt: number, cm: any): Record<string, number> | null {
    if (!currentPlay) return null

    const step = currentPlay.choreo.steps[currentPlay.stepIndex]
    if (!step) { currentPlay = null; return null }

    // 每步开始时捕获当前参数值做起点 —— 动作从"现在的姿势"出发而不是从0
    if (!currentPlay.captured) {
      for (const param of Object.keys(step.params)) {
        try {
          currentPlay.startValues[param] = cm.getParameterValueById(param)
        } catch {
          currentPlay.startValues[param] = 0
        }
      }
      currentPlay.captured = true
    }

    currentPlay.elapsed += dt * 1000
    const progress = Math.min(1, currentPlay.elapsed / Math.max(1, step.duration))
    const easingFn = EASINGS[step.easing || 'easeInOut']
    const eased = easingFn(progress)

    const result: Record<string, number> = {}
    for (const [param, target] of Object.entries(step.params)) {
      const start = currentPlay.startValues[param] ?? 0
      result[param] = start + (target - start) * eased
    }

    if (progress >= 1) {
      currentPlay.stepIndex++
      currentPlay.elapsed = 0
      currentPlay.captured = false
      if (currentPlay.stepIndex >= currentPlay.choreo.steps.length) {
        currentPlay = null
      }
    }

    return result
  }

  function isPlaying(): boolean {
    return currentPlay !== null
  }

  onMounted(() => {
    window.electronAPI?.onAction?.((data: { action: string }) => {
      if (data.action) play(data.action)
    })
  })

  return { play, tick, isPlaying }
}
