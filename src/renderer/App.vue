<script setup lang="ts">
import { defineAsyncComponent, ref, onMounted, onUnmounted } from 'vue'
import { useEmotion, type Emotion } from './composables/useEmotion'
import ChatOverlay from './components/ChatOverlay.vue'
import type { PetConfig } from './types/electron'

const Live2DCanvas = defineAsyncComponent(() => import('./components/Live2DCanvas.vue'))

const { currentEmotion, setEmotion } = useEmotion()
const config = ref<PetConfig | null>(null)
const canvasRef = ref<any>(null)

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
const TYPE_INTERVAL = 45 // 每字ms

function onSpeech(text: string) {
  if (speechFadeTimer) { clearTimeout(speechFadeTimer); speechFadeTimer = null }
  if (speechClearTimer) { clearTimeout(speechClearTimer); speechClearTimer = null }
  if (typeTimer) { clearInterval(typeTimer); typeTimer = null }
  speechFading.value = false
  speechEnded = false
  speechText.value = text
  typedText.value = ''
  typing.value = true
  let i = 0
  typeTimer = setInterval(() => {
    i++
    typedText.value = text.slice(0, i)
    if (i >= text.length) {
      if (typeTimer) { clearInterval(typeTimer); typeTimer = null }
      typing.value = false
      if (speechEnded) scheduleSpeechFade()
    }
  }, TYPE_INTERVAL)
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
})

onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div class="app-container">
    <!-- 顶部细条：透明窗口的拖动把手（hover时可见） -->
    <div class="drag-handle" />

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
    <ChatOverlay :lifted="!!speechText" />

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

.app-container {
  position: relative;
  width: 100%;
  height: 100%;
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
.dialog-box {
  position: absolute;
  bottom: 4%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 12;
  width: 88%;
  min-height: 76px;
  background: rgba(252, 252, 252, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.08);
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
  background: rgba(90, 110, 160, 0.92);
  color: #fff;
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
  color: #333;
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
  color: #333;
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
