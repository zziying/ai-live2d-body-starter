<script setup lang="ts">
import { defineAsyncComponent, ref, computed, onMounted, onUnmounted } from 'vue'
import { useEmotion, type Emotion } from './composables/useEmotion'
import ChatOverlay from './components/ChatOverlay.vue'
import type { SpeechPayload } from './components/Live2DCanvas.vue'
import type { PetConfig } from './types/electron'

const Live2DCanvas = defineAsyncComponent(() => import('./components/Live2DCanvas.vue'))

const { currentEmotion, setEmotion } = useEmotion()
const config = ref<PetConfig | null>(null)
const canvasRef = ref<any>(null)

// UI缩放（config window.zoom）：面板/字幕/气泡是按桌面角落的小窗设计的，铺满
// 副屏会显小。只用CSS zoom缩这几层，canvas不碰——webContents.setZoomFactor
// 会让透明全屏窗的合成器报SharedImage错、截图时好时坏，别走那条路
const uiZoom = computed(() => Number(config.value?.window?.zoom) || 1)

// --- 日夜：7:00-19:00白天，其余夜里。夜里整套CSS变量换暗玻璃+浅字 ---
function timePeriod(): 'day' | 'night' {
  const h = new Date().getHours()
  return h >= 7 && h < 19 ? 'day' : 'night'
}
const isNight = ref(timePeriod() === 'night')
const time = ref('')

function updateTime() {
  const now = new Date()
  time.value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  isNight.value = timePeriod() === 'night'
}

// --- 背景轮换：public/backgrounds/ 里的图按时段分池随机（backgrounds.enabled时启用）---
const bgUrl = ref('')
let bgPeriod = ''

async function refreshBackground() {
  try {
    const files = (await window.electronAPI.listBackgrounds?.()) || []
    const period = timePeriod()
    if (period === bgPeriod && bgUrl.value) return
    // day_* / night_* 进各自时段池；无前缀的图两个时段通用
    const pool = files.filter(
      f => f.startsWith(`${period}_`) || (!f.startsWith('day_') && !f.startsWith('night_'))
    )
    bgPeriod = period
    if (!pool.length) {
      bgUrl.value = ''
      return
    }
    const candidates = pool.length > 1 ? pool.filter(f => `/backgrounds/${encodeURIComponent(f)}` !== bgUrl.value) : pool
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    bgUrl.value = `/backgrounds/${encodeURIComponent(pick)}`
  } catch {}
}

// --- 天气行（panels.weatherUrl配了才拉，main代理请求）---
const weather = ref('')

async function fetchWeather() {
  try {
    const w = await window.electronAPI.fetchWeather?.()
    if (w) weather.value = w
  } catch {}
}

// --- galgame对话框：说话时打字机字幕，说完停留再淡出 ---
const speechText = ref('')
const typedText = ref('')
const typing = ref(false)
const speechFading = ref(false)
let speechFadeTimer: ReturnType<typeof setTimeout> | null = null
let speechClearTimer: ReturnType<typeof setTimeout> | null = null
let typeTimer: ReturnType<typeof setInterval> | null = null
let speechEnded = false
const SPEECH_LINGER = 4000
const SPEECH_FADE = 1000
const TYPE_INTERVAL = 45 // 每字ms（没有音频时长可参考时的默认）

// 打字机：速度按音频时长均分，内联标记（<nod>这类，main已切出位置）推进到
// 那个字时触发——动作卡在句中该出现的地方，不是一开口全放完。
// 标记是ta自己写的，不吃choreographer的冷却。
function onSpeech({ text, cues, durationMs }: SpeechPayload) {
  if (speechFadeTimer) { clearTimeout(speechFadeTimer); speechFadeTimer = null }
  if (speechClearTimer) { clearTimeout(speechClearTimer); speechClearTimer = null }
  if (typeTimer) { clearInterval(typeTimer); typeTimer = null }
  speechFading.value = false
  speechEnded = false
  speechText.value = text
  typedText.value = ''
  typing.value = true
  const interval = durationMs > 0
    ? Math.min(120, Math.max(25, durationMs / Math.max(1, text.length)))
    : TYPE_INTERVAL
  const pending = [...(cues ?? [])].sort((x, y) => x.at - y.at)
  const fireCues = (upTo: number) => {
    while (pending.length && pending[0].at <= upTo) {
      const cue = pending.shift()!
      if (cue.action) canvasRef.value?.playAction(cue.action, { cooldownMs: 0, sameCooldownMs: 0 })
      if (cue.emotion) setEmotion(cue.emotion as Emotion)
    }
  }
  let i = 0
  typeTimer = setInterval(() => {
    i++
    typedText.value = text.slice(0, i)
    fireCues(i)
    if (i >= text.length) {
      fireCues(Infinity)
      if (typeTimer) { clearInterval(typeTimer); typeTimer = null }
      typing.value = false
      if (speechEnded) scheduleSpeechFade()
    }
  }, interval)
}

function scheduleSpeechFade() {
  if (speechFadeTimer) clearTimeout(speechFadeTimer)
  speechFadeTimer = setTimeout(() => {
    speechFading.value = true
    speechClearTimer = setTimeout(() => {
      speechText.value = ''
      typedText.value = ''
      speechFading.value = false
    }, SPEECH_FADE)
  }, SPEECH_LINGER)
}

// 音频先放完 —— 打字机还在打的话，淡出等它打完再计时
function onSpeechEnd() {
  speechEnded = true
  if (!typing.value) scheduleSpeechFade()
}

// --- 键盘调试：1-7切表情，字母键播动作（调模型表情时好用） ---
const debugLabel = ref('')
let debugLabelTimer: ReturnType<typeof setTimeout> | null = null

const EMOTION_KEYS: Record<string, Emotion> = {
  '1': 'happy', '2': 'love', '3': 'shy', '4': 'sad',
  '5': 'angry', '6': 'gloomy', '7': 'neutral',
}
const ACTION_KEYS: Record<string, string> = {
  n: 'nod', k: 'shake', s: 'surprise', t: 'thinking', y: 'shy', c: 'celebrate',
}

function flashLabel(text: string) {
  debugLabel.value = text
  if (debugLabelTimer) clearTimeout(debugLabelTimer)
  debugLabelTimer = setTimeout(() => { debugLabel.value = '' }, 1500)
}

function onKeyDown(e: KeyboardEvent) {
  const emotion = EMOTION_KEYS[e.key]
  if (emotion) {
    setEmotion(emotion)
    flashLabel(`表情: ${emotion}`)
    return
  }
  const action = ACTION_KEYS[e.key.toLowerCase()]
  if (action) {
    canvasRef.value?.playAction(action)
    flashLabel(`动作: ${action}`)
  }
}

onMounted(async () => {
  config.value = await window.electronAPI.getConfig()
  window.addEventListener('keydown', onKeyDown)
  updateTime()
  setInterval(updateTime, 10_000)
  if (config.value.backgrounds?.enabled) {
    refreshBackground()
    setInterval(refreshBackground, 10 * 60_000)
  }
  if (config.value.panels?.enabled && config.value.panels.weatherUrl) {
    fetchWeather()
    setInterval(fetchWeather, 10 * 60_000)
  }
})

onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div class="app-container" :class="{ night: isNight }">
    <!-- 背景：有图用图（换图2.5s交叉淡入）；开了背景但目录里没图时铺内置暖色渐变
         （日夜各一套跟主题走）。backgrounds.enabled=false 才是透明悬浮 -->
    <div v-if="config?.backgrounds?.enabled && !bgUrl" class="bg-layer bg-default" />
    <Transition name="bg-fade">
      <div
        v-if="config?.backgrounds?.enabled && bgUrl"
        :key="bgUrl"
        class="bg-layer"
        :style="{ backgroundImage: `url(${bgUrl})` }"
      />
    </Transition>

    <!-- 顶部细条：透明窗口的拖动把手（hover时可见） -->
    <div class="drag-handle" />

    <!-- 左上信息面板：时钟+天气（panels.enabled时显示） -->
    <div v-if="config?.panels?.enabled" class="left-col">
      <div class="time-block glass-card">
        <div class="clock">{{ time }}</div>
        <div v-if="weather" class="weather">{{ weather }}</div>
      </div>
    </div>

    <div class="canvas-wrap">
      <Live2DCanvas
        v-if="config"
        ref="canvasRef"
        :emotion="currentEmotion"
        :config="config"
        @speech="onSpeech"
        @speech-end="onSpeechEnd"
      />
    </div>

    <!-- galgame对话框（说话字幕） -->
    <div v-if="speechText" class="dialog-box" :class="{ fading: speechFading }">
      <div class="dialog-name">{{ config?.name || 'Pet' }}</div>
      <div class="dialog-text">{{ typedText }}<span v-if="typing" class="dialog-cursor">▏</span></div>
      <span v-if="!typing" class="dialog-next">▼</span>
    </div>

    <!-- 聊天气泡（对话框出现时让位） -->
    <ChatOverlay :lifted="!!speechText" :style="{ zoom: uiZoom }" />

    <!-- 键盘调试提示 -->
    <div v-if="debugLabel" class="debug-label">{{ debugLabel }}</div>
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

html, body, #app {
  width: 100%;
  height: 100%;
  background: transparent;
  overflow: hidden;
  font-family: 'PingFang SC', 'Hiragino Sans GB', system-ui, sans-serif;
}

/* 日夜主题 = 一组CSS变量。白天亮玻璃+墨字，夜里(19:00-7:00)暗玻璃+米白字，
   面板/对话框/聊天气泡全跟着变，1s过渡。 */
.app-container {
  position: relative;
  width: 100%;
  height: 100%;
  --ink: #333;
  --glass-bg: rgba(243, 238, 228, 0.42);
  --glass-border: rgba(255, 255, 255, 0.35);
  --dialog-bg: rgba(252, 252, 252, 0.82);
  --plate-bg: rgba(90, 110, 160, 0.92);
  --plate-ink: #fff;
  --bubble-user-bg: rgba(255, 255, 255, 0.72);
  --bubble-user-ink: #333;
  --bubble-pet-bg: rgba(120, 150, 220, 0.7);
  --bubble-pet-ink: #fff;
  color: var(--ink);
  transition: color 1s ease;
}

.app-container.night {
  --ink: #e9e3d6;
  --glass-bg: rgba(40, 38, 50, 0.46);
  --glass-border: rgba(255, 255, 255, 0.14);
  --dialog-bg: rgba(32, 30, 42, 0.85);
  --plate-bg: rgba(120, 140, 190, 0.9);
  --plate-ink: #f5f2ea;
  --bubble-user-bg: rgba(70, 68, 82, 0.7);
  --bubble-user-ink: #ece7db;
  --bubble-pet-bg: rgba(90, 115, 180, 0.75);
  --bubble-pet-ink: #fff;
}

.bg-layer {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
}

/* 内置默认背景：暖色渐变 + 两团柔光。白天奶油橘→玫瑰米，夜里暖梅紫→深棕 */
.bg-default {
  background:
    radial-gradient(60% 55% at 18% 12%, rgba(255, 244, 214, 0.9), transparent 70%),
    radial-gradient(50% 45% at 85% 90%, rgba(244, 196, 186, 0.7), transparent 70%),
    linear-gradient(160deg, #fbe9d4 0%, #f5d6c3 48%, #eac9c6 100%);
  transition: background 1s;
}
.app-container.night .bg-default {
  background:
    radial-gradient(60% 55% at 18% 12%, rgba(120, 90, 110, 0.55), transparent 70%),
    radial-gradient(50% 45% at 85% 90%, rgba(150, 100, 90, 0.4), transparent 70%),
    linear-gradient(160deg, #3b2f42 0%, #4a3548 50%, #2f2430 100%);
}

.bg-fade-enter-active,
.bg-fade-leave-active {
  transition: opacity 2.5s ease;
}

.bg-fade-enter-from,
.bg-fade-leave-to {
  opacity: 0;
}

/* 左上信息面板 */
.left-col {
  position: absolute;
  top: 22px;
  left: 18px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 240px;
}

.glass-card {
  background: var(--glass-bg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  transition: background 1s ease, border-color 1s ease;
}

.time-block {
  display: flex;
  flex-direction: column;
  padding: 8px 16px 10px;
}

.clock {
  font-size: 44px;
  font-weight: 300;
  letter-spacing: 3px;
  opacity: 0.85;
  line-height: 1.1;
}

.weather {
  font-size: 15px;
  font-weight: 600;
  opacity: 0.65;
  margin-top: 4px;
}

.drag-handle {
  position: absolute;
  top: 0;
  left: 20%;
  width: 60%;
  height: 14px;
  z-index: 20;
  border-radius: 0 0 8px 8px;
  -webkit-app-region: drag;
  transition: background 0.2s ease;
}
.drag-handle:hover {
  background: rgba(128, 128, 128, 0.25);
}

.canvas-wrap {
  position: absolute;
  inset: 0;
}

/* galgame对话框 —— 底部宽框、名牌、打字机 */
.left-col,
.dialog-box,
.debug-label {
  zoom: v-bind(uiZoom);
}

.dialog-box {
  position: absolute;
  bottom: 4%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 12;
  width: 88%;
  min-height: 76px;
  background: var(--dialog-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  padding: 18px 22px 14px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
  animation: speech-pop 0.25s ease;
  transition: opacity 1s ease;
  pointer-events: none;
}

.dialog-box.fading {
  opacity: 0;
}

.dialog-name {
  position: absolute;
  top: -13px;
  left: 18px;
  background: var(--plate-bg);
  color: var(--plate-ink);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 2px;
  padding: 3px 14px;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}

.dialog-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--ink);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dialog-cursor {
  display: inline-block;
  animation: cursor-blink 0.8s step-end infinite;
  opacity: 0.7;
}

.dialog-next {
  position: absolute;
  bottom: 6px;
  right: 16px;
  font-size: 12px;
  color: var(--ink);
  opacity: 0.5;
  animation: next-bounce 1.1s ease-in-out infinite;
}

.debug-label {
  position: absolute;
  top: 20px;
  right: 16px;
  z-index: 15;
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  border-radius: 8px;
  pointer-events: none;
}

@keyframes cursor-blink {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 0; }
}

@keyframes next-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(4px); }
}

@keyframes speech-pop {
  0% { opacity: 0; transform: translateX(-50%) translateY(8px); }
  100% { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>
