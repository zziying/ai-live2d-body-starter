<script setup lang="ts">
// 左下角聊天气泡：最近几条对话飘着，30秒淡出。
// 消息来源 = POST /chat（谁发都行，sender区分左右气泡颜色）。
import { ref, onMounted } from 'vue'

defineProps<{ lifted: boolean }>()

interface Bubble {
  id: number
  sender: string
  text: string
  fading: boolean
}

const bubbles = ref<Bubble[]>([])
let nextId = 1

const MAX_BUBBLES = 3
const LINGER_MS = 30_000
const FADE_MS = 600

onMounted(() => {
  window.electronAPI?.onChatMessage?.((data) => {
    const bubble: Bubble = {
      id: nextId++,
      sender: data.sender || 'other',
      text: data.text.length > 80 ? data.text.slice(0, 80) + '…' : data.text,
      fading: false,
    }
    bubbles.value.push(bubble)
    if (bubbles.value.length > MAX_BUBBLES) bubbles.value.shift()
    setTimeout(() => {
      bubble.fading = true
      setTimeout(() => {
        bubbles.value = bubbles.value.filter(b => b.id !== bubble.id)
      }, FADE_MS)
    }, LINGER_MS)
  })
})
</script>

<template>
  <div class="chat-overlay" :class="{ lifted }">
    <transition-group name="bubble">
      <div
        v-for="b in bubbles"
        :key="b.id"
        class="bubble"
        :class="[b.sender === 'pet' ? 'from-pet' : 'from-user', { fading: b.fading }]"
      >
        {{ b.text }}
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.chat-overlay {
  position: absolute;
  left: 14px;
  bottom: 14px;
  z-index: 11;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 62%;
  pointer-events: none;
  transition: opacity 0.4s ease;
}
/* 说话对话框出现时快速隐身让位，结束后浮回 */
.chat-overlay.lifted {
  opacity: 0;
}
/* 气泡色走App.vue的日夜主题变量，夜里自动换暗色 */
.bubble {
  padding: 7px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: opacity 0.6s ease, background 1s ease, color 1s ease;
  width: fit-content;
}
.bubble.fading {
  opacity: 0;
}
.from-user {
  background: var(--bubble-user-bg, rgba(255, 255, 255, 0.72));
  color: var(--bubble-user-ink, #333);
  align-self: flex-start;
}
.from-pet {
  background: var(--bubble-pet-bg, rgba(120, 150, 220, 0.7));
  color: var(--bubble-pet-ink, #fff);
  align-self: flex-end;
}
.bubble-enter-active {
  transition: all 0.25s ease;
}
.bubble-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
</style>
