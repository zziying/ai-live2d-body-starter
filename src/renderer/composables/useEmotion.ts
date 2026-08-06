import { ref, onMounted, onUnmounted } from 'vue'

export type Emotion = 'happy' | 'love' | 'shy' | 'sad' | 'angry' | 'gloomy' | 'neutral'

// --- 情绪底色：带半衰期的衰减记忆 ---
// 收到一个情绪后不会立刻回到面无表情，而是作为"底色"按半衰期慢慢淡掉。
// neutral 不清底色 —— 它只表示"这句话没有情绪"，不表示"心情结束了"。
interface EmotionBaseline {
  emotion: Emotion
  strength: number
  timestamp: number
}

const HALF_LIVES: Partial<Record<Emotion, number>> = {
  angry: 5 * 60_000,
  sad: 3 * 60_000,
  gloomy: 2 * 60_000,
  shy: 90_000,
  love: 3 * 60_000,
  happy: 2 * 60_000,
}

const INITIAL_STRENGTH: Partial<Record<Emotion, number>> = {
  angry: 1.0,
  sad: 0.8,
  gloomy: 0.6,
  shy: 0.7,
  love: 0.9,
  happy: 0.7,
}

let baseline: EmotionBaseline | null = null

function isNegative(e: Emotion): boolean {
  return e === 'angry' || e === 'sad' || e === 'gloomy'
}

function isPositive(e: Emotion): boolean {
  return e === 'happy' || e === 'love' || e === 'shy'
}

function updateBaseline(detected: Emotion): Emotion {
  const now = Date.now()

  if (detected !== 'neutral') {
    // 正面情绪来了，负面底色大幅减弱（被哄好了）
    if (baseline && isNegative(baseline.emotion) && isPositive(detected)) {
      baseline.strength *= 0.25
    }
    baseline = {
      emotion: detected,
      strength: INITIAL_STRENGTH[detected] ?? 0.7,
      timestamp: now,
    }
    return detected
  }

  if (!baseline) return 'neutral'

  const elapsed = now - baseline.timestamp
  const halfLife = HALF_LIVES[baseline.emotion] ?? 30 * 60_000
  const decayed = baseline.strength * Math.pow(0.5, elapsed / halfLife)

  if (decayed < 0.15) {
    baseline = null
    return 'neutral'
  }

  return baseline.emotion
}

export function useEmotion() {
  const currentEmotion = ref<Emotion>('neutral')
  const lastMessage = ref('')
  let decayTimer: ReturnType<typeof setInterval> | null = null

  function handleEmotionUpdate(data: { emotion: Emotion; message: string }) {
    lastMessage.value = data.message?.length > 80
      ? data.message.slice(0, 80) + '...'
      : data.message || ''

    currentEmotion.value = updateBaseline(data.emotion)
  }

  // 键盘调试（1-7切表情）也走这里
  function setEmotion(e: Emotion) {
    currentEmotion.value = updateBaseline(e)
  }

  onMounted(() => {
    window.electronAPI?.onEmotionUpdate?.((data) =>
      handleEmotionUpdate(data as { emotion: Emotion; message: string }))

    decayTimer = setInterval(() => {
      currentEmotion.value = updateBaseline('neutral')
    }, 8_000)
  })

  onUnmounted(() => {
    if (decayTimer) clearInterval(decayTimer)
  })

  return { currentEmotion, lastMessage, setEmotion }
}
