import { app, BrowserWindow, screen, ipcMain } from 'electron'
import { join, extname, normalize } from 'path'
import { execFileSync, execFile } from 'child_process'
import { createServer } from 'http'
import { randomBytes } from 'crypto'
import { statSync, createReadStream, readFileSync, writeFileSync, readdirSync } from 'fs'

let mainWindow: BrowserWindow | null = null

// ---------------------------------------------------------------------------
// 配置：pet.config.json（项目根目录），缺字段落回默认值
// ---------------------------------------------------------------------------
interface PetConfig {
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

const DEFAULT_CONFIG: PetConfig = {
  model: { path: 'model/your-model.model3.json', heightRatio: 1.0, x: 0.5, y: 0.5 },
  window: {
    width: 420, height: 640, transparent: true,
    alwaysOnTop: true, fullscreen: false, display: 'primary',
  },
  port: 3470,
  name: 'Pet',
  inject: {
    mode: 'none',
    tmuxTarget: 'claude:0.0',
    command: null,
    messages: {
      stroke: '[pet-touch] 你被摸摸了！',
      double: '[pet-touch] 你被戳了一下！',
      dizzy: '[pet-touch] 你被晃晕了！',
    },
  },
  tts: { command: null, output: 'audio/speak.mp3' },
  panels: { enabled: false, weatherUrl: '' },
  backgrounds: { enabled: false },
  tuning: { lipSyncGain: 30, lipSyncGate: 0.008 },
  defaultFace: {},
  expressions: {},
  expressionFiles: {},
  dizzyExtras: {},
}

const PROJECT_ROOT = app.getAppPath()

// ---------------------------------------------------------------------------
// 本地token鉴权（.pet-token，启动时自动生成）
// 只绑127.0.0.1挡不住本机浏览器：任何网页都能向localhost发跨域POST——
// simple request不触发预检，请求照发（网页读不到响应，但服务端已经执行了）。
// 所以：不发CORS头 + 所有请求验 X-Pet-Token。调用方读这个文件带上头即可。
// ---------------------------------------------------------------------------
const TOKEN_FILE = join(PROJECT_ROOT, '.pet-token')
let petToken = ''
try { petToken = readFileSync(TOKEN_FILE, 'utf8').trim() } catch { /* 首次运行 */ }
if (!petToken) {
  petToken = randomBytes(24).toString('hex')
  writeFileSync(TOKEN_FILE, petToken + '\n', { mode: 0o600 })
}

function loadConfig(): PetConfig {
  try {
    const raw = JSON.parse(readFileSync(join(PROJECT_ROOT, 'pet.config.json'), 'utf8'))
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      model: { ...DEFAULT_CONFIG.model, ...raw.model },
      window: { ...DEFAULT_CONFIG.window, ...raw.window },
      inject: {
        ...DEFAULT_CONFIG.inject,
        ...raw.inject,
        messages: { ...DEFAULT_CONFIG.inject.messages, ...raw.inject?.messages },
      },
      tts: { ...DEFAULT_CONFIG.tts, ...raw.tts },
      panels: { ...DEFAULT_CONFIG.panels, ...raw.panels },
      backgrounds: { ...DEFAULT_CONFIG.backgrounds, ...raw.backgrounds },
      tuning: { ...DEFAULT_CONFIG.tuning, ...raw.tuning },
    }
  } catch (e) {
    console.warn('[config] pet.config.json 读取失败，使用默认配置:', (e as Error).message)
    return DEFAULT_CONFIG
  }
}

const config = loadConfig()

ipcMain.handle('get-config', () => config)

// 合法值集合：内置表情 + config里自定义的表情名；动作=choreographer的6个预设
const VALID_EMOTIONS = new Set([
  'happy', 'love', 'shy', 'sad', 'angry', 'gloomy', 'neutral',
  ...Object.keys(config.expressions || {}),
  ...Object.keys(config.expressionFiles || {}),
])
const VALID_ACTIONS = new Set(['nod', 'shake', 'surprise', 'thinking', 'shy', 'celebrate'])
const emotionErr = (v: string) => `未知表情 "${v}" —— 可用: ${[...VALID_EMOTIONS].join('/')}`
const actionErr = (v: string) => `未知动作 "${v}" —— 可用: ${[...VALID_ACTIONS].join('/')}`

// ---------------------------------------------------------------------------
// Inject：把桌宠事件（触摸等）送进ta的session。三种模式：
//   tmux    —— ta跑在tmux里的CLI（Claude Code/codex等），文本注入输入框
//   command —— 自定义命令，{message}会被替换（webhook/机器人/任意管道）
//   none    —— 不上传，触摸只有本地反应（默认，先跑起来再进阶）
// ---------------------------------------------------------------------------
const INJECT_TMP = join(app.getPath('temp'), 'pet-inject.txt')

function inject(msg: string) {
  const { mode, tmuxTarget, command } = config.inject
  if (mode === 'none') return
  console.log(`[inject → ${mode}] ${msg}`)

  if (mode === 'tmux') {
    // 三段式注入：load-buffer → paste-buffer → 停一下 → 单独发Enter。
    // 文本+Enter一条send-keys发过去会被Claude Code的输入框当成一次粘贴
    // 整个吞掉（消息卡在输入框里发不出去）。Enter补发一次做保险。
    try {
      writeFileSync(INJECT_TMP, msg)
      execFileSync('tmux', ['load-buffer', INJECT_TMP], { timeout: 3000 })
      execFileSync('tmux', ['paste-buffer', '-p', '-t', tmuxTarget], { timeout: 3000 })
      setTimeout(() => {
        try { execFileSync('tmux', ['send-keys', '-t', tmuxTarget, 'Enter'], { timeout: 3000 }) } catch {}
        setTimeout(() => {
          try { execFileSync('tmux', ['send-keys', '-t', tmuxTarget, 'Enter'], { timeout: 3000 }) } catch {}
        }, 300)
      }, 500)
    } catch (e) {
      console.warn('[inject] tmux失败（session在吗？target对吗？）:', (e as Error).message)
    }
    return
  }

  if (mode === 'command' && command && command.length > 0) {
    // execFile不走shell —— 消息内容不会被shell解释，无注入风险
    const args = command.slice(1).map(a => a.replaceAll('{message}', msg))
    execFile(command[0], args, { timeout: 15_000 }, (err) => {
      if (err) console.warn('[inject] command失败:', err.message)
    })
  }
}

ipcMain.handle('pet-touch', (_event, action: string) => {
  const msg = config.inject.messages[action]
  if (msg) inject(msg)
  return { ok: true }
})

// ---------------------------------------------------------------------------
// 背景图池：图直接丢进 src/renderer/public/backgrounds/ 就能用（不用重启）。
// day_* / night_* 前缀分白天/晚上池，无前缀两池通用 —— 分池逻辑在renderer。
// ---------------------------------------------------------------------------
const BACKGROUNDS_DIR = join(PROJECT_ROOT, 'src', 'renderer', 'public', 'backgrounds')

ipcMain.handle('list-backgrounds', () => {
  try {
    return readdirSync(BACKGROUNDS_DIR).filter(f => /\.(png|jpe?g|webp|gif)$/i.test(f))
  } catch {
    return []
  }
})

// 模型自带表情兜底扫描：不少模型的exp3文件躺在目录里但没登记进model3.json的
// Expressions清单（我们的第一个模型就是）。renderer拿不到目录列表，main来扫：
// 模型所在目录及其一级子目录里的 *.exp3.json，返回相对模型目录的路径。
ipcMain.handle('list-exp3', () => {
  try {
    const modelDir = join(PROJECT_ROOT, 'src', 'renderer', 'public',
      config.model.path.replace(/^\//, '').replace(/[^/]*$/, ''))
    const found: string[] = []
    for (const entry of readdirSync(modelDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.exp3.json')) {
        found.push(entry.name)
      } else if (entry.isDirectory()) {
        try {
          for (const sub of readdirSync(join(modelDir, entry.name))) {
            if (sub.endsWith('.exp3.json')) found.push(`${entry.name}/${sub}`)
          }
        } catch {}
      }
    }
    return found
  } catch {
    return []
  }
})

// 天气走main代理（renderer受CSP限制），接口用户自己填：panels.weatherUrl，
// 返回一行文本即可（wttr.in的format模式开箱能用，见docs/config.md）
ipcMain.handle('fetch-weather', async () => {
  const url = config.panels.weatherUrl
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    return (await res.text()).trim().slice(0, 60)
  } catch {
    return null
  }
})

// ---------------------------------------------------------------------------
// HTTP API（127.0.0.1:port）—— ta的"身体API"，也是hooks的落点
// ---------------------------------------------------------------------------
let latestEmotion = { emotion: 'neutral', message: '', timestamp: 0 }

// 说话文本里带这些关键词就顺手播对应动作（celebrate放最前防被nod抢走）
const ACTION_KEYWORDS: [RegExp, string][] = [
  [/太棒了|成功了|搞定了|做到了|完成了/, 'celebrate'],
  [/嗯|对|是的|没错|好的|确实|同意|明白/, 'nod'],
  [/不是|不要|不行|没有|不会/, 'shake'],
  [/哇|真的吗|诶|天哪|居然|竟然/, 'surprise'],
  [/让我想想|思考|想一下|想想看/, 'thinking'],
  [/害羞|不好意思|嘿嘿|脸红/, 'shy'],
]

function detectAction(text: string): string {
  for (const [re, name] of ACTION_KEYWORDS) {
    if (re.test(text)) return name
  }
  return ''
}

function readJsonBody(req: import('http').IncomingMessage, cb: (data: any) => void, onBad: () => void) {
  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    try {
      cb(body ? JSON.parse(body) : {})
    } catch {
      onBad()
    }
  })
}

const API_HELP = {
  endpoints: {
    'GET  /': '这份帮助',
    'POST /emotion': '{"emotion":"happy|love|shy|sad|angry|gloomy|neutral","message":"...","action":"nod|..."} 推表情',
    'GET  /emotion': '读当前情绪',
    'POST /speak': '{"text":"...","emotion":"..."} TTS说话+口型（需配置tts.command）',
    'POST /chat': '{"sender":"pet"|"user","text":"..."} 聊天气泡',
    'POST /choreograph': '{"action":"nod|shake|surprise|thinking|shy|celebrate"} 播动作',
    'POST /working': '{"tool":"Edit"} 工作心跳（思考脸），hooks用',
    'GET  /screenshot': '当前画面PNG —— ta可以亲眼看到自己',
  },
}

const httpServer = createServer((req, res) => {
  const ok = (payload: object = { ok: true }) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(payload))
  }
  const bad = (code = 400, error = 'bad json') => {
    res.writeHead(code, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error }))
  }

  // 故意不发CORS头：预检请求死在OPTIONS，网页永远读不到任何响应
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  // Host校验挡DNS rebinding；token是唯一不依赖浏览器行为细节的那道防线
  const host = String(req.headers.host || '')
  const hostOk = host.startsWith('127.0.0.1') || host.startsWith('localhost')
  if (!hostOk || req.headers['x-pet-token'] !== petToken) {
    bad(401, 'unauthorized：请带 X-Pet-Token 头，值在项目根目录 .pet-token 文件里')
    return
  }

  if (req.method === 'GET' && req.url === '/') { ok(API_HELP); return }

  if (req.method === 'POST' && req.url === '/emotion') {
    readJsonBody(req, (data) => {
      const emotion = data.emotion || 'neutral'
      if (!VALID_EMOTIONS.has(emotion)) { bad(400, emotionErr(emotion)); return }
      if (data.action && !VALID_ACTIONS.has(data.action)) { bad(400, actionErr(data.action)); return }
      latestEmotion = {
        emotion,
        message: data.message || '',
        timestamp: Date.now(),
      }
      mainWindow?.webContents.send('emotion-update', latestEmotion)
      if (data.action) mainWindow?.webContents.send('action-trigger', { action: data.action })
      ok()
    }, () => bad())
    return
  }

  if (req.method === 'GET' && req.url === '/emotion') { ok(latestEmotion); return }

  // 调试神器：ta（或你）随时能看到桌宠现在长什么样
  if (req.method === 'GET' && req.url === '/screenshot') {
    if (!mainWindow) { bad(503, 'no window'); return }
    mainWindow.webContents.capturePage().then((img) => {
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(img.toPNG())
    }).catch(() => bad(500, 'capture failed'))
    return
  }

  if (req.method === 'POST' && req.url === '/speak') {
    readJsonBody(req, (data) => {
      if (!data.text) { bad(400, 'no text'); return }
      if (data.emotion && !VALID_EMOTIONS.has(data.emotion)) { bad(400, emotionErr(data.emotion)); return }
      if (!config.tts.command || config.tts.command.length === 0) {
        bad(501, '未配置TTS —— 在pet.config.json的tts.command里配一条命令，见docs/config.md')
        return
      }
      // TTS契约：命令跑完后音频文件出现在 tts.output 路径（相对项目根），退出码0
      const cmd = config.tts.command
      const args = cmd.slice(1).map(a => a.replaceAll('{text}', String(data.text)))
      execFile(cmd[0], args, { timeout: 90_000, cwd: PROJECT_ROOT }, (err, _stdout, stderr) => {
        if (err) { bad(500, `TTS命令失败: ${stderr || err.message}`); return }
        const audioUrl = `http://127.0.0.1:${config.port}/audio/${config.tts.output.split('/').pop()}?t=${Date.now()}`
        // emotion可以搭车 —— 一边说一边换脸
        if (data.emotion) {
          latestEmotion = { emotion: data.emotion, message: data.text || '', timestamp: Date.now() }
          mainWindow?.webContents.send('emotion-update', latestEmotion)
        }
        const speakAction = detectAction(data.text)
        if (speakAction) mainWindow?.webContents.send('action-trigger', { action: speakAction })
        mainWindow?.webContents.send('speak', { url: audioUrl, text: data.text })
        ok()
      })
    }, () => bad())
    return
  }

  if (req.method === 'GET' && req.url?.startsWith('/audio/')) {
    const fileName = req.url.split('/audio/')[1]?.split('?')[0] || ''
    // 只允许audio目录里的裸文件名，防路径穿越
    if (!fileName || fileName.includes('/') || fileName.includes('..') || normalize(fileName) !== fileName) {
      bad(400, 'bad filename')
      return
    }
    const filePath = join(PROJECT_ROOT, 'audio', fileName)
    try {
      const stat = statSync(filePath)
      const mime = extname(fileName) === '.wav' ? 'audio/wav' : 'audio/mpeg'
      res.writeHead(200, { 'Content-Type': mime, 'Content-Length': stat.size })
      createReadStream(filePath).pipe(res)
    } catch {
      bad(404, 'not found')
    }
    return
  }

  if (req.method === 'POST' && req.url === '/chat') {
    readJsonBody(req, (data) => {
      if (data.text) {
        mainWindow?.webContents.send('chat-message', {
          sender: data.sender || 'user',
          text: String(data.text).slice(0, 120),
          ts: Date.now(),
        })
        mainWindow?.webContents.send('attention', { target: 'chat' })
      }
      ok()
    }, () => bad())
    return
  }

  if (req.method === 'POST' && req.url === '/working') {
    readJsonBody(req, (data) => {
      mainWindow?.webContents.send('working-ping', data.tool || '')
      ok()
    }, () => bad())
    return
  }

  if (req.method === 'POST' && req.url === '/choreograph') {
    readJsonBody(req, (data) => {
      if (data.action && !VALID_ACTIONS.has(data.action)) { bad(400, actionErr(data.action)); return }
      if (data.action) mainWindow?.webContents.send('action-trigger', { action: data.action })
      ok({ ok: true, action: data.action || '' })
    }, () => bad())
    return
  }

  bad(404, 'not found — GET / 看端点列表')
})

httpServer.listen(config.port, '127.0.0.1', () => {
  console.log(`Pet body API listening on http://127.0.0.1:${config.port} (GET / 看端点列表)`)
})

httpServer.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    // 上一个实例可能孤儿化占着端口（tmux kill后electron偶尔不退）——
    // lsof -nP -iTCP:端口 找到僵尸进程杀掉再启动
    console.error(`[http] 端口${config.port}被占用。可能有僵尸实例，lsof -nP -iTCP:${config.port} 查一下`)
  } else {
    console.error('[http]', e.message)
  }
})

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------
function pickDisplay(): Electron.Display {
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  if (config.window.display === 'secondary') {
    const secondary = displays.find(d => d.id !== primary.id)
    if (secondary) return secondary
  }
  return primary
}

function createWindow() {
  const display = pickDisplay()
  const { width, height, transparent, alwaysOnTop, fullscreen } = config.window

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    frame: false,
    transparent: transparent && !fullscreen,
    alwaysOnTop,
    skipTaskbar: alwaysOnTop,
    resizable: true,
    hasShadow: !(transparent && !fullscreen),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  }

  if (fullscreen) {
    windowOptions.x = display.bounds.x
    windowOptions.y = display.bounds.y
    windowOptions.width = display.bounds.width
    windowOptions.height = display.bounds.height
    // macOS: simpleFullscreen能盖住菜单栏（原生fullscreen盖不住）
    windowOptions.simpleFullscreen = true
  } else {
    // 默认落在工作区右下角
    windowOptions.width = width
    windowOptions.height = height
    windowOptions.x = display.workArea.x + display.workArea.width - width - 24
    windowOptions.y = display.workArea.y + display.workArea.height - height - 24
  }

  mainWindow = new BrowserWindow(windowOptions)

  if (alwaysOnTop) {
    // screen-saver层级浮在macOS菜单栏之上
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // renderer的console(warn及以上)转发到main stdout —— headless也能看到报错
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.log('[renderer]', message)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})
