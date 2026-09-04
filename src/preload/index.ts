import { contextBridge, ipcRenderer } from 'electron'

// removeAllListeners模式：HMR会反复注册listener，注册前先清掉。
// 代价是每个事件只支持一个订阅者 —— 需要多处消费时在App.vue里relay。
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getConfig: () => ipcRenderer.invoke('get-config'),
  petTouch: (action: string) => ipcRenderer.invoke('pet-touch', action),
  listBackgrounds: () => ipcRenderer.invoke('list-backgrounds'),
  listExp3: () => ipcRenderer.invoke('list-exp3'),
  fetchWeather: () => ipcRenderer.invoke('fetch-weather'),
  onEmotionUpdate: (callback: (data: any) => void) => {
    ipcRenderer.removeAllListeners('emotion-update')
    ipcRenderer.on('emotion-update', (_event, data) => callback(data))
  },
  onChatMessage: (callback: (data: any) => void) => {
    ipcRenderer.removeAllListeners('chat-message')
    ipcRenderer.on('chat-message', (_event, data) => callback(data))
  },
  onSpeak: (callback: (data: any) => void) => {
    ipcRenderer.removeAllListeners('speak')
    ipcRenderer.on('speak', (_event, data) => callback(data))
  },
  onAction: (callback: (data: any) => void) => {
    ipcRenderer.removeAllListeners('action-trigger')
    ipcRenderer.on('action-trigger', (_event, data) => callback(data))
  },
  onAttention: (callback: (data: any) => void) => {
    ipcRenderer.removeAllListeners('attention')
    ipcRenderer.on('attention', (_event, data) => callback(data))
  },
  onExpressionToggle: (callback: (data: any) => void) => {
    ipcRenderer.removeAllListeners('expression-toggle')
    ipcRenderer.on('expression-toggle', (_event, data) => callback(data))
  },
  onWorkingPing: (callback: (tool: string) => void) => {
    ipcRenderer.removeAllListeners('working-ping')
    ipcRenderer.on('working-ping', (_event, tool) => callback(tool || ''))
  },
})
