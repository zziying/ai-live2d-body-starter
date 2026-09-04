// electronAPI 唯一的全局声明。别在组件/composable里各自 declare global —— 会类型冲突。
export interface PetConfig {
  model: { path: string; heightRatio: number; x: number; y: number }
  window: {
    width: number
    height: number
    transparent: boolean
    alwaysOnTop: boolean
    fullscreen: boolean
    display: 'primary' | 'secondary'
  }
  port: number
  name: string
  inject: {
    mode: 'none' | 'tmux' | 'command'
    tmuxTarget: string
    command: string[] | null
    messages: Record<string, string>
  }
  tts: { command: string[] | null; output: string }
  panels: { enabled: boolean; weatherUrl: string }
  backgrounds: { enabled: boolean }
  tuning: { lipSyncGain: number; lipSyncGate: number }
  defaultFace: Record<string, number>
  expressions: Record<string, Record<string, number>>
  expressionFiles: Record<string, string>
  dizzyExtras: Record<string, number>
}

declare global {
  interface Window {
    electronAPI: {
      platform: string
      getConfig: () => Promise<PetConfig>
      petTouch: (action: string) => Promise<{ ok: boolean }>
      listBackgrounds: () => Promise<string[]>
      listExp3: () => Promise<string[]>
      readSpeakAudio: () => Promise<Uint8Array | null>
      fetchWeather: () => Promise<string | null>
      onEmotionUpdate: (cb: (data: { emotion: string; message: string }) => void) => void
      onChatMessage: (cb: (data: { sender: string; text: string; ts: number }) => void) => void
      onSpeak: (cb: (data: { file: string; text?: string; cues?: Array<{ at: number; action?: string; emotion?: string }> }) => void) => void
      onAction: (cb: (data: { action: string }) => void) => void
      onAttention: (cb: (data: { target: string }) => void) => void
      onWorkingPing: (cb: (tool: string) => void) => void
      onExpressionToggle: (cb: (data: { name: string; on: boolean; clear?: boolean }) => void) => void
    }
  }
}

export {}
