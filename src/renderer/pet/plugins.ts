// 管线插件，一个子系统一个。注册顺序（在Live2DCanvas.vue里）就是层叠顺序 ——
// 后面的插件有意覆盖前面的（dizzy在最后，被晃晕压倒本帧其他一切诉求）。
import type { FrameCtx, PetPlugin } from './pipeline'
import { setParam, getParam } from './pipeline'
import type { PetState } from './state'
import { createIdleMachine } from './idle'
import { SpringAxis, SPRING_FOLLOW, SPRING_ACTION } from '../composables/useSpring'
import type { ExpressionTables } from './expressions'

const ATTENTION_DURATION = 3500

// --- setup: 填好每帧共享上下文，其他插件都读它 ------------------------------

export function setupPlugin(
  state: PetState,
  choreographer: { tick: (dt: number, cm: any) => Record<string, number> | null },
): PetPlugin {
  const idleMachine = createIdleMachine(state)
  let smoothWork = 0

  return {
    name: 'setup',
    update(ctx) {
      ctx.idle = idleMachine.tick(ctx.dt)
      ctx.choreo = choreographer.tick(ctx.dt, ctx.cm)
      ctx.choreoActive = ctx.choreo ? new Set(Object.keys(ctx.choreo)) : ctx.choreoActive
      const workingTarget = ctx.now < state.workingUntil ? 1 : 0
      smoothWork += (workingTarget - smoothWork) * 0.05
      ctx.work = smoothWork
    },
  }
}

// --- gaze: 眼球。优先级 attention > glance > idle > 追鼠标 -------------------

export function gazePlugin(state: PetState): PetPlugin {
  let smoothEyeX = 0
  let smoothEyeY = 0

  return {
    name: 'gaze',
    update(ctx) {
      let targetEyeX: number, targetEyeY: number

      if (ctx.now < state.attentionUntil) {
        // 新聊天消息 → 瞟向左下角的聊天气泡
        targetEyeX = -1
        targetEyeY = -1
      } else if (ctx.idle) {
        targetEyeX = ctx.idle.eyeX
        targetEyeY = ctx.idle.eyeY
      } else {
        targetEyeX = (state.mouseX - 0.5) * 2
        targetEyeY = -(state.mouseY - 0.5) * 2
      }

      // 干活时眼神微微上飘，像在搜寻一个念头
      if (ctx.work > 0.02 && ctx.now >= state.attentionUntil) {
        targetEyeY = Math.min(1, targetEyeY + 0.35 * ctx.work)
      }

      // 被单击 → 迅速瞟向点击处
      const glancing = ctx.now < state.glanceUntil
      if (glancing) {
        targetEyeX = state.glanceEyeX
        targetEyeY = state.glanceEyeY
      }

      // 眼跳/glance时用快lerp（视线跳变就该跳），平时追鼠标用慢lerp
      const eyeSmooth = (ctx.idle?.saccade || glancing) ? 0.35 : 0.08
      smoothEyeX += (targetEyeX - smoothEyeX) * eyeSmooth
      smoothEyeY += (targetEyeY - smoothEyeY) * eyeSmooth
      ctx.gazeX = smoothEyeX
      ctx.gazeY = smoothEyeY

      if (!ctx.choreoActive.has('ParamEyeBallX')) setParam(ctx.cm, 'ParamEyeBallX', smoothEyeX)
      if (!ctx.choreoActive.has('ParamEyeBallY')) setParam(ctx.cm, 'ParamEyeBallY', smoothEyeY)
    },
  }
}

// --- head: 弹簧-阻尼追目标（鼠标/idle/动作关键帧） ---------------------------

export function headSpringPlugin(state: PetState): PetPlugin {
  const springX = new SpringAxis()
  const springY = new SpringAxis()
  const springZ = new SpringAxis()
  const bodySpringX = new SpringAxis()

  return {
    name: 'head-spring',
    update(ctx) {
      let targetHeadX: number, targetHeadY: number

      if (ctx.now < state.attentionUntil) {
        targetHeadX = -24
        targetHeadY = -20
      } else if (ctx.idle) {
        targetHeadX = ctx.idle.headX
        targetHeadY = ctx.idle.headY
      } else {
        targetHeadX = (state.mouseX - 0.5) * 60
        targetHeadY = -(state.mouseY - 0.5) * 60
      }

      const glancing = ctx.now < state.glanceUntil

      // 动作播放时弹簧改追关键帧输出，其余时间追鼠标/idle。
      // 速度在切换瞬间是连续的，动作结束不会"啪"地弹回鼠标位置。
      const tuning = ctx.choreo ? SPRING_ACTION : SPRING_FOLLOW
      ctx.headX = springX.update(ctx.choreo?.ParamAngleX ?? targetHeadX, ctx.dt, tuning)
      ctx.headY = springY.update(ctx.choreo?.ParamAngleY ?? targetHeadY, ctx.dt, tuning)
      ctx.headZ = springZ.update(ctx.choreo?.ParamAngleZ ?? (glancing ? state.glanceTilt : 0), ctx.dt, tuning)
      const bodyX = bodySpringX.update(ctx.choreo?.ParamBodyAngleX ?? ctx.headX * 0.3, ctx.dt, tuning)

      setParam(ctx.cm, 'ParamAngleX', ctx.headX)
      setParam(ctx.cm, 'ParamAngleY', ctx.headY)
      setParam(ctx.cm, 'ParamAngleZ', ctx.headZ)
      setParam(ctx.cm, 'ParamBodyAngleX', bodyX)
    },
  }
}

// --- eye openness: 表情/犯困基值 × 眨眼因子 ---------------------------------
// 乘法：半闭眼表情(gloomy)按半幅眨，近乎全闭直接跳过眨眼。

export function eyeOpennessPlugin(
  state: PetState,
  blink: { factor: (now: number, minBase: number) => number },
  tables: ExpressionTables,
): PetPlugin {
  return {
    name: 'eye-openness',
    update(ctx) {
      const eyeParams = tables.map[state.emotion] || {}
      let eyeBaseL = ctx.idle?.eyeOpen ?? eyeParams['ParamEyeLOpen'] ?? 1
      let eyeBaseR = ctx.idle?.eyeOpen ?? eyeParams['ParamEyeROpen'] ?? 1
      // 思考眯眼：干活时眼睛微微眯起
      if (ctx.work > 0.02 && state.emotion === 'neutral' && ctx.idle?.eyeOpen === undefined) {
        const squint = 1 - 0.28 * ctx.work
        eyeBaseL *= squint
        eyeBaseR *= squint
      }
      const blinkF = blink.factor(ctx.now, Math.min(eyeBaseL, eyeBaseR))
      if (!ctx.choreoActive.has('ParamEyeLOpen')) setParam(ctx.cm, 'ParamEyeLOpen', eyeBaseL * blinkF)
      if (!ctx.choreoActive.has('ParamEyeROpen')) setParam(ctx.cm, 'ParamEyeROpen', eyeBaseR * blinkF)
    },
  }
}

// --- expression: 默认脸 + 情绪覆盖 ------------------------------------------

export function expressionPlugin(state: PetState, tables: ExpressionTables): PetPlugin {
  return {
    name: 'expression',
    update(ctx) {
      const emotionParams = tables.map[state.emotion] || {}
      for (const paramId of tables.allParams) {
        if (state.isSpeaking && (paramId === 'ParamMouthOpenY' || paramId === 'ParamMouthForm')) continue
        if (ctx.choreoActive.has(paramId)) continue
        const val = emotionParams[paramId] ?? tables.defaultFace[paramId] ?? 0
        setParam(ctx.cm, paramId, val)
      }
    },
  }
}

// --- attention smile: 瞟聊天气泡时轻轻眯眼笑 --------------------------------

export function attentionSmilePlugin(state: PetState): PetPlugin {
  let smoothSmile = 0

  return {
    name: 'attention-smile',
    update(ctx) {
      const active = ctx.now < state.attentionUntil
      // 快起慢落 —— 移开视线后笑意还挂一会儿
      smoothSmile += ((active ? 1 : 0) - smoothSmile) * (active ? 0.25 : 0.05)
      if (smoothSmile <= 0.02) return

      if (!ctx.choreoActive.has('ParamEyeLSmile')) {
        setParam(ctx.cm, 'ParamEyeLSmile', Math.max(getParam(ctx.cm, 'ParamEyeLSmile'), smoothSmile))
        setParam(ctx.cm, 'ParamEyeRSmile', Math.max(getParam(ctx.cm, 'ParamEyeRSmile'), smoothSmile))
      }
      if (!state.isSpeaking && !ctx.choreoActive.has('ParamMouthForm')) {
        setParam(ctx.cm, 'ParamMouthForm', Math.max(getParam(ctx.cm, 'ParamMouthForm'), smoothSmile * 0.9))
      }
    },
  }
}

export function triggerAttention(state: PetState) {
  const now = Date.now()
  // 聊天活动视为"有人在" —— 叫醒/重置idle计时
  state.lastMouseMove = now
  if (now - state.lastAttention < 8000) return
  state.lastAttention = now
  state.attentionUntil = now + ATTENTION_DURATION
}

// --- lip sync: 说话时RMS驱动嘴，结束后smoothstep交还给表情系统 ---------------

export function lipSyncPlugin(
  state: PetState,
  tuning: { lipSyncGain: number; lipSyncGate: number },
): PetPlugin {
  const RELEASE_MS = 200
  const smoothstep = (t: number) => t * t * (3 - 2 * t)

  let smoothMouth = 0
  let smoothForm = 0
  let wasSpeaking = false
  let releaseMs = 0
  let lastForcedMouth = 0
  let lastForcedForm = 0
  let pcm: Float32Array | null = null
  let freq: Uint8Array | null = null

  return {
    name: 'lip-sync',
    update(ctx) {
      // 边界是isSpeaking，绝不是mouthOpen>0 —— 音素之间的静音不能触发release
      if (wasSpeaking && !state.isSpeaking) releaseMs = RELEASE_MS
      // 新一句从闭嘴开始，而不是接着上一句的口型
      if (!wasSpeaking && state.isSpeaking) { smoothMouth = 0; smoothForm = 0 }
      wasSpeaking = state.isSpeaking

      if (state.isSpeaking && state.analyser) {
        const analyser = state.analyser
        if (!pcm || pcm.length !== analyser.fftSize) pcm = new Float32Array(analyser.fftSize)
        analyser.getFloatTimeDomainData(pcm as Float32Array<ArrayBuffer>)
        let sum = 0
        for (const a of pcm) sum += a * a
        const rms = Math.sqrt(sum / pcm.length)
        // 增益/门限是手感旋钮（pet.config.json tuning段）：不同TTS音量差很大，
        // 嘴几乎不动→调大gain；闭嘴时嘴皮乱颤→调大gate
        const gate = tuning.lipSyncGate
        const gain = tuning.lipSyncGain
        let target = rms > gate ? Math.min(1, (rms - gate) * gain) : 0
        // sqrt曲线：中等音量也能明显张嘴，音节看得清
        target = Math.sqrt(target)
        // 快开(0.6)稍慢合(0.25)，音节边界更脆
        smoothMouth += (target - smoothMouth) * (target > smoothMouth ? 0.6 : 0.25)
        setParam(ctx.cm, 'ParamMouthOpenY', smoothMouth)

        // 频谱重心驱动嘴型：低频→圆嘴(a/o)，高频→扁嘴(i/e)
        if (!freq || freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(freq as Uint8Array<ArrayBuffer>)
        let weighted = 0, total = 0
        for (let i = 0; i < freq.length; i++) {
          weighted += i * freq[i]
          total += freq[i]
        }
        if (total > 0 && smoothMouth > 0.05) {
          const centroid = weighted / total / freq.length  // 0..1
          const form = Math.max(-0.2, Math.min(1, (centroid - 0.05) * 5))
          smoothForm += (form - smoothForm) * 0.3
          setParam(ctx.cm, 'ParamMouthForm', smoothForm)
        }
        lastForcedMouth = smoothMouth
        lastForcedForm = smoothForm
        return
      }

      if (releaseMs > 0) {
        // 200ms smoothstep：从最后的口型渐变回表情系统本帧写的口型，不硬切
        releaseMs = Math.max(0, releaseMs - ctx.dt * 1000)
        const blend = smoothstep(1 - releaseMs / RELEASE_MS)
        const exprMouth = getParam(ctx.cm, 'ParamMouthOpenY')
        const exprForm = getParam(ctx.cm, 'ParamMouthForm')
        setParam(ctx.cm, 'ParamMouthOpenY', lastForcedMouth * (1 - blend) + exprMouth * blend)
        setParam(ctx.cm, 'ParamMouthForm', lastForcedForm * (1 - blend) + exprForm * blend)
      }
    },
  }
}

// --- thinking face: 工具跑着的时候微微皱眉抿嘴 ------------------------------
// 只叠在neutral上 —— 活跃情绪(love/happy...)赢过思考脸。
// 放在attention-smile之后，皱眉会把眼笑一起压下去。

export function thinkingFacePlugin(state: PetState): PetPlugin {
  return {
    name: 'thinking-face',
    update(ctx) {
      if (ctx.work <= 0.02 || state.emotion !== 'neutral' || state.isSpeaking) return
      const w = ctx.work
      const wobble = Math.sin(ctx.now / 1200) * 0.08 * w  // 眉毛缓慢起伏，像在琢磨什么
      const set = (param: string, value: number) => {
        if (!ctx.choreoActive.has(param)) setParam(ctx.cm, param, value)
      }
      set('ParamBrowLY', -0.4 * w + wobble)
      set('ParamBrowRY', -0.4 * w - wobble)
      set('ParamBrowLForm', -0.5 * w)
      set('ParamBrowRForm', -0.5 * w)
      set('ParamMouthForm', -0.35 * w)
    },
  }
}

// --- choreo apply: 弹簧/嘴没消费掉的动作参数，这里落地 -----------------------

export function choreoApplyPlugin(state: PetState): PetPlugin {
  return {
    name: 'choreo-apply',
    update(ctx) {
      if (!ctx.choreo) return
      for (const [param, value] of Object.entries(ctx.choreo)) {
        if (state.isSpeaking && param === 'ParamMouthOpenY') continue
        // 头部四轴已在head-spring里作为弹簧目标被消费
        if (param === 'ParamAngleX' || param === 'ParamAngleY' || param === 'ParamAngleZ'
          || param === 'ParamBodyAngleX') continue
        setParam(ctx.cm, param, value)
      }
    },
  }
}

// --- dizzy: 被晃晕 —— 眼球转圈、头部打摆，压倒其他一切 ----------------------

const DIZZY_METER_DECAY = 2    // 每秒衰减 —— 反向晃动必须够快才算
export const DIZZY_DURATION = 4000

export function dizzyPlugin(state: PetState, dizzyExtras: Record<string, number> = {}): PetPlugin {
  let phase = 0
  let smoothDizzy = 0

  return {
    name: 'dizzy',
    update(ctx) {
      state.dizzyMeter = Math.max(0, state.dizzyMeter - ctx.dt * DIZZY_METER_DECAY)
      const active = ctx.now < state.dizzyUntil
      smoothDizzy += ((active ? 1 : 0) - smoothDizzy) * (active ? 0.15 : 0.04)
      if (smoothDizzy <= 0.02) {
        if (!active) phase = 0
        return
      }

      const remain = active ? (state.dizzyUntil - ctx.now) / DIZZY_DURATION : 0
      phase += ctx.dt * (3 + 9 * remain)  // 一开始转得快，缓过来时慢下来
      const d = smoothDizzy
      const cm = ctx.cm
      setParam(cm, 'ParamEyeBallX', Math.cos(phase) * 0.9 * d + ctx.gazeX * (1 - d))
      setParam(cm, 'ParamEyeBallY', Math.sin(phase) * 0.9 * d + ctx.gazeY * (1 - d))
      setParam(cm, 'ParamAngleZ', ctx.headZ * (1 - d) + Math.sin(phase * 0.5) * 14 * d)
      setParam(cm, 'ParamAngleX', ctx.headX * (1 - d) + Math.cos(phase * 0.45) * 16 * d)
      setParam(cm, 'ParamAngleY', ctx.headY * (1 - d) + Math.sin(phase * 0.35) * 10 * d)
      setParam(cm, 'ParamBodyAngleX', Math.sin(phase * 0.4) * 6 * d)
      if (!state.isSpeaking) setParam(cm, 'ParamMouthForm', -0.8 * d)
      // 你的模型有脸色发青/冒汗/瞳孔缩小之类的特效参数？配在 pet.config.json
      // 的 dizzyExtras 里（值是最大强度，按晕眩程度d缩放）
      for (const [param, maxVal] of Object.entries(dizzyExtras)) {
        setParam(cm, param, maxVal * d)
      }
    },
  }
}
