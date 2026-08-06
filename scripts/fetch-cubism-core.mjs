// Live2D Cubism Core（Web版）是Live2D社的专有软件，不能打包进开源repo。
// 官方允许从其CDN加载/随应用分发，这里在install后自动下载到public目录。
// 下载失败不阻塞install（离线场景），启动时缺文件会在页面上提示。
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'src', 'renderer', 'public', 'live2dcubismcore.min.js')
const URL = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js'

if (existsSync(dest)) {
  console.log('[cubism-core] already present, skip')
  process.exit(0)
}

try {
  const res = await fetch(URL)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, buf)
  console.log(`[cubism-core] downloaded → ${dest} (${(buf.length / 1024).toFixed(0)}KB)`)
} catch (e) {
  console.warn(`[cubism-core] download failed (${e.message}).`)
  console.warn(`[cubism-core] 请手动下载 ${URL} 放到 src/renderer/public/`)
}
