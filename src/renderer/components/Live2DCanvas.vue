<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display-lipsyncpatch/cubism4'
import { useChoreographer } from '../composables/useChoreographer'
import { useBlink } from '../composables/useBlink'
import { createPetState } from '../pet/state'
import { createPipeline, setPipelineAngleScale, type FrameCtx } from '../pet/pipeline'
import { buildExpressionTables, BUILTIN_MAP } from '../pet/expressions'
import { buildModelProfile } from '../pet/profile'
import { loadExp3Expressions, mapExp3ToEmotions, reportExp3 } from '../pet/exp3'
import {
  setupPlugin, gazePlugin, headSpringPlugin, eyeOpennessPlugin,
  expressionPlugin, exp3TogglePlugin, attentionSmilePlugin, lipSyncPlugin,
  thinkingFacePlugin, choreoApplyPlugin, dizzyPlugin,
  triggerAttention, DIZZY_DURATION,
} from '../pet/plugins'
import type { PetConfig } from '../types/electron'

const props = defineProps<{
  emotion: string
  config: PetConfig
}>()

export interface SpeechCue { at: number; action?: string; emotion?: string }
export interface SpeechPayload { text: string; cues: SpeechCue[]; durationMs: number }

const emit = defineEmits<{
  (e: 'speech', payload: SpeechPayload): void
  (e: 'speech-end'): void
}>()

const canvasRef = ref<HTMLCanvasElement>()
const loadError = ref('')
let app: PIXI.Application | null = null
let model: any = null

const state = createPetState()
const choreographer = useChoreographer()
const blink = useBlink()

const WORKING_TIMEOUT = 20_000
const GLANCE_DURATION = 1200
const DIZZY_THRESHOLD = 6      // 需要这么多次方向反转才晕
const DIZZY_COOLDOWN = 60_000

let currentAudio: HTMLAudioElement | null = null
let audioContext: AudioContext | null = null

watch(() => props.emotion, (newEmotion) => {
  state.emotion = newEmotion
}, { immediate: true })

// 暴露模型引用，方便在devtools里调参：window.__live2dModel().internalModel.coreModel
;(window as any).__live2dModel = () => model

function onMouseMove(e: MouseEvent) {
  if (!app) return
  state.mouseX = e.clientX / window.innerWidth
  state.mouseY = e.clientY / window.innerHeight
  state.lastMouseMove = Date.now()
}

onMounted(async () => {
  if (!canvasRef.value) return
  const cfg = props.config

  if (!(window as any).Live2DCubismCore) {
    loadError.value = '缺少 live2dcubismcore.min.js —— 跑一下 node scripts/fetch-cubism-core.mjs 再重启'
    return
  }

  app = new PIXI.Application({
    view: canvasRef.value,
    resizeTo: canvasRef.value.parentElement!,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio,
    autoDensity: true,
  })

  Live2DModel.registerTicker(PIXI.Ticker)

  try {
    model = await Live2DModel.from('/' + cfg.model.path.replace(/^\//, ''), {
      autoInteract: false,
      autoUpdate: true,
    })
  } catch (e) {
    console.error('Live2D model load failed:', e)
    loadError.value = `模型加载失败：${cfg.model.path} —— 确认文件在 src/renderer/public/ 下且路径写对（加密模型无法加载）`
    return
  }

  // 定位：模型显示高度 = 窗口高 × heightRatio，锚点居中。
  // 很多模型画布四周有大片空白，人物只占中间一小块 —— 那就把 heightRatio
  // 调大（比如2~4）并用 x/y 平移，让人物部分充满窗口。调法见 docs/model-adaptation.md
  const scale = (app.screen.height * cfg.model.heightRatio) / model.height
  model.scale.set(scale)
  model.x = app.screen.width * cfg.model.x
  model.y = app.screen.height * cfg.model.y
  model.anchor.set(0.5, 0.5)

  // SDK的自动眨眼在我们的ticker之后覆写眼开度，表情的眯眼永远赢不了它。
  // 永久禁用 —— useBlink 用乘法调制代替。
  model.internalModel.eyeBlink = undefined

  app.stage.addChild(model)

  // 模型体检+角度缩放（跨模型兼容的关键一步，报告打在 pnpm dev 终端里）
  const profile = buildModelProfile(model.internalModel.coreModel)
  setPipelineAngleScale(profile.angleScale)

  // 表情三层优先级：config手写 > 模型自带exp3（叠在内置上） > 内置标准参数组合
  const paramDefaults = Object.fromEntries(
    Object.entries(profile.ranges).map(([id, r]) => [id, r.def])
  )
  const exp3Set = await loadExp3Expressions(cfg.model.path, model.internalModel.settings, paramDefaults)
  const exp3Mapped = mapExp3ToEmotions(exp3Set.tables, BUILTIN_MAP, cfg.expressionFiles)
  reportExp3(exp3Set, exp3Mapped.used)
  const tables = buildExpressionTables({ ...exp3Mapped.tables, ...cfg.expressions }, cfg.defaultFace)

  // --- 管线：注册顺序即层叠顺序，dizzy最后（压倒一切） ---------------------
  const pipeline = createPipeline()
  pipeline.register(setupPlugin(state, choreographer))
  pipeline.register(gazePlugin(state))
  pipeline.register(headSpringPlugin(state))
  pipeline.register(eyeOpennessPlugin(state, blink, tables))
  pipeline.register(expressionPlugin(state, tables))
  pipeline.register(exp3TogglePlugin(state, paramDefaults, new Set(tables.allParams)))
  pipeline.register(attentionSmilePlugin(state))
  pipeline.register(lipSyncPlugin(state, cfg.tuning))
  pipeline.register(thinkingFacePlugin(state))
  pipeline.register(choreoApplyPlugin(state))
  pipeline.register(dizzyPlugin(state, cfg.dizzyExtras))

  app.ticker.add(() => {
    if (!model?.internalModel?.coreModel) return
    const ctx: FrameCtx = {
      cm: model.internalModel.coreModel,
      dt: app!.ticker.deltaMS / 1000,
      now: Date.now(),
      idle: null,
      choreo: null,
      choreoActive: new Set(),
      work: 0,
      gazeX: 0,
      gazeY: 0,
      headX: 0,
      headY: 0,
      headZ: 0,
    }
    pipeline.run(ctx)
  })

  window.addEventListener('mousemove', onMouseMove)

  // --- 触摸互动：撸（拖动）/ 单击瞟一眼 / 双击 / 晃晕 ----------------------
  let isDragging = false
  let dragDist = 0
  let lastDragX = 0
  let lastDragY = 0
  let strokeCooldown = false
  const cv = canvasRef.value!

  function isOnCharacter(e: MouseEvent) {
    const rect = cv.getBoundingClientRect()
    const x = e.clientX - rect.left
    return x > rect.width * 0.2 && x < rect.width * 0.8
  }

  // 加权随机触摸反应：同一种摸法不总是同一个回答。摸头偏害羞，戳身体偏惊讶。
  const TOUCH_REACTIONS: Record<string, Record<string, number>> = {
    'head-stroke': { shy: 6, nod: 3, celebrate: 1 },
    'body-stroke': { shy: 4, nod: 4, thinking: 1 },
    'head-double': { shy: 5, surprise: 3, nod: 2 },
    'body-double': { surprise: 4, celebrate: 3, shake: 1 },
  }

  function pickWeighted(pool: Record<string, number>): string {
    let total = 0
    for (const w of Object.values(pool)) total += w
    let r = Math.random() * total
    for (const [name, w] of Object.entries(pool)) {
      if (r < w) return name
      r -= w
    }
    return Object.keys(pool)[0]
  }

  function touchZone(e: MouseEvent): 'head' | 'body' {
    const rect = cv.getBoundingClientRect()
    return (e.clientY - rect.top) < rect.height * 0.45 ? 'head' : 'body'
  }

  function reactToTouch(kind: 'stroke' | 'double', e: MouseEvent) {
    const pool = TOUCH_REACTIONS[`${touchZone(e)}-${kind}`]
    if (pool) choreographer.play(pickWeighted(pool), { cooldownMs: 3000, sameCooldownMs: 6000 })
  }

  cv.addEventListener('mousedown', (e: MouseEvent) => {
    if (isOnCharacter(e)) {
      isDragging = true
      dragDist = 0
      lastDragX = e.clientX
      lastDragY = e.clientY
    }
  })

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDragging || strokeCooldown) return
    const dx = e.clientX - lastDragX
    const dy = e.clientY - lastDragY
    dragDist += Math.sqrt(dx * dx + dy * dy)
    lastDragX = e.clientX
    lastDragY = e.clientY
    if (dragDist > 80) {
      strokeCooldown = true
      dragDist = 0
      reactToTouch('stroke', e)
      window.electronAPI?.petTouch?.('stroke')   // → inject到ta的session（配置了才发）
      setTimeout(() => { strokeCooldown = false }, 5000)
    }
  })

  // click在mouseup之后触发，先存下拖动距离供它判断
  let lastPressDragDist = 0
  window.addEventListener('mouseup', () => {
    lastPressDragDist = dragDist
    isDragging = false
    dragDist = 0
  })

  // 单击 → 瞟一眼点击处+眨眼，偶尔歪头。纯本地反应，不打扰ta的session
  //（不然轻轻一点也发消息，session会被摸摸刷屏）。
  cv.addEventListener('click', (e: MouseEvent) => {
    if (!isOnCharacter(e) || lastPressDragDist > 15) return
    const rect = cv.getBoundingClientRect()
    state.glanceEyeX = ((e.clientX - rect.left) / rect.width - 0.5) * 2
    state.glanceEyeY = -((e.clientY - rect.top) / rect.height - 0.35) * 1.6
    state.glanceTilt = Math.random() < 0.3 ? (Math.random() < 0.5 ? -7 : 7) : 0
    state.glanceUntil = Date.now() + GLANCE_DURATION
    blink.blinkNow()
  })

  // 晃晕检测：悬停状态下快速来回晃（方向反转积累）。拖动中不算 —— 那是撸。
  let shakeX = 0, shakeY = 0
  let shakeDirX = 0, shakeDirY = 0
  let lastShakeTime = 0

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (isDragging || !isOnCharacter(e)) return
    const now = Date.now()
    const dx = e.clientX - shakeX
    const dy = e.clientY - shakeY
    shakeX = e.clientX
    shakeY = e.clientY
    // 指针停过或刚进入 —— 重置方向状态，这一跳不计
    if (now - lastShakeTime > 150) {
      lastShakeTime = now
      shakeDirX = 0
      shakeDirY = 0
      return
    }
    lastShakeTime = now
    // 只有快速划动才算晃，慢慢移不算
    if (Math.abs(dx) > 6) {
      const dir = Math.sign(dx)
      if (shakeDirX !== 0 && dir !== shakeDirX) state.dizzyMeter += 1
      shakeDirX = dir
    }
    if (Math.abs(dy) > 6) {
      const dir = Math.sign(dy)
      if (shakeDirY !== 0 && dir !== shakeDirY) state.dizzyMeter += 1
      shakeDirY = dir
    }
    if (state.dizzyMeter >= DIZZY_THRESHOLD && now >= state.dizzyCooldownUntil && now >= state.dizzyUntil) {
      state.dizzyMeter = 0
      state.dizzyUntil = now + DIZZY_DURATION
      state.dizzyCooldownUntil = now + DIZZY_COOLDOWN
      window.electronAPI?.petTouch?.('dizzy')
    }
  })

  cv.addEventListener('dblclick', (e: MouseEvent) => {
    if (isOnCharacter(e)) {
      reactToTouch('double', e)
      window.electronAPI?.petTouch?.('double')
    }
  })

  // 新聊天消息 → 低头瞟聊天气泡
  window.electronAPI?.onAttention?.(() => {
    triggerAttention(state)
  })

  // 工作心跳（hooks发来）→ 保持思考脸
  window.electronAPI?.onWorkingPing?.(() => {
    state.workingUntil = Date.now() + WORKING_TIMEOUT
  })

  // 模型自带表情直通开关（POST /expression）：开/关状态由main维护，这里只落参数
  window.electronAPI?.onExpressionToggle?.((data) => {
    if (data.clear) { state.exp3Active = {}; return }
    const table = exp3Set.tables[data.name]
    if (!table) { console.warn(`[exp3] 直通开关：模型没有表情"${data.name}"`); return }
    if (data.on) state.exp3Active[data.name] = table
    else delete state.exp3Active[data.name]
  })

  // 音频keep-alive：不少外放音箱空闲时休眠，唤醒延迟会吞掉说话的前几个字。
  // 一条听不见的次声波常驻输出，让输出设备保持清醒。
  try {
    if (!audioContext) audioContext = new AudioContext()
    audioContext.resume().catch(() => {})
    const keepAliveOsc = audioContext.createOscillator()
    const keepAliveGain = audioContext.createGain()
    keepAliveGain.gain.value = 0.001
    keepAliveOsc.frequency.value = 30
    keepAliveOsc.connect(keepAliveGain)
    keepAliveGain.connect(audioContext.destination)
    keepAliveOsc.start()
  } catch (e) {
    console.error('Audio keep-alive failed:', e)
  }

  // 语音播放：analyser接进lip-sync插件
  window.electronAPI?.onSpeak?.(async (data: any) => {
    if (!model || !data?.file) return
    if (currentAudio) { currentAudio.pause(); currentAudio = null }

    // 音频经IPC拿Buffer → Blob URL：同源，analyser能读样本，也不用给HTTP端口开CORS
    const bytes = await window.electronAPI.readSpeakAudio?.()
    if (!bytes) { console.warn('[speak] 读不到音频文件', data.file); emit('speech-end'); return }
    const mime = /\.wav$/i.test(data.file) ? 'audio/wav' : 'audio/mpeg'
    const blobUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
    const audio = new Audio(blobUrl)
    currentAudio = audio

    if (!audioContext) audioContext = new AudioContext()
    const source = audioContext.createMediaElementSource(audio)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.25
    source.connect(analyser)
    analyser.connect(audioContext.destination)
    state.analyser = analyser

    state.isSpeaking = true
    const end = () => {
      state.isSpeaking = false; state.analyser = null; currentAudio = null
      URL.revokeObjectURL(blobUrl)
      emit('speech-end')
    }
    audio.onended = end
    audio.onerror = end
    // 字幕打字机等音频真的开始播才起步，并把时长带过去——打字速度按时长均分，
    // 内联标记（cues）才能大致卡在说到那个字的时候
    audio.play().then(() => {
      if (data.text) {
        const durationMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0
        emit('speech', { text: data.text, cues: data.cues ?? [], durationMs })
      }
    }).catch(() => { state.isSpeaking = false; emit('speech-end') })
  })
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  app?.destroy(true)
})

defineExpose({
  playAction: (name: string, opts?: { cooldownMs?: number; sameCooldownMs?: number }) => choreographer.play(name, opts),
})
</script>

<template>
  <canvas ref="canvasRef" class="live2d-canvas" />
  <div v-if="loadError" class="load-error">{{ loadError }}</div>
</template>

<style scoped>
.live2d-canvas {
  width: 100%;
  height: 100%;
}
.load-error {
  position: absolute;
  inset: 20% 8% auto;
  padding: 16px;
  background: rgba(180, 40, 40, 0.85);
  color: #fff;
  font-size: 14px;
  line-height: 1.6;
  border-radius: 10px;
  z-index: 99;
}
</style>
