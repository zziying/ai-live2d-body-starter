// 插件之间、以及外部世界（DOM/IPC监听）与管线之间共享的可变状态。
// 监听器写、插件每帧读。故意用plain object —— ticker每帧都碰它，不需要响应式。
export interface PetState {
  emotion: string
  mouseX: number
  mouseY: number
  lastMouseMove: number
  /** 音频开始到结束之间为true —— lip-sync的所有权边界 */
  isSpeaking: boolean
  analyser: AnalyserNode | null
  workingUntil: number
  attentionUntil: number
  lastAttention: number
  glanceUntil: number
  glanceEyeX: number
  glanceEyeY: number
  glanceTilt: number
  dizzyMeter: number
  dizzyUntil: number
  dizzyCooldownUntil: number
}

export function createPetState(): PetState {
  return {
    emotion: 'neutral',
    mouseX: 0.5,
    mouseY: 0.5,
    lastMouseMove: Date.now(),
    isSpeaking: false,
    analyser: null,
    workingUntil: 0,
    attentionUntil: 0,
    lastAttention: 0,
    glanceUntil: 0,
    glanceEyeX: 0,
    glanceEyeY: 0,
    glanceTilt: 0,
    dizzyMeter: 0,
    dizzyUntil: 0,
    dizzyCooldownUntil: 0,
  }
}
