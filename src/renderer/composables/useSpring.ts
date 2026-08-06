// 弹簧-阻尼头部动力学（semi-implicit Euler）。
// 不用lerp追目标，让物理去追：会过冲、会回弹，目标跳变（比如动作播完）时速度连续不跳变。

export interface SpringTuning {
  stiffness: number
  damping: number
}

// 软跟随：追鼠标/idle视线 —— 略欠阻尼，带一点活气
export const SPRING_FOLLOW: SpringTuning = { stiffness: 40, damping: 12 }
// 动作模式：追choreographer关键帧 —— 看得见的过冲和回稳
export const SPRING_ACTION: SpringTuning = { stiffness: 120, damping: 16 }

export class SpringAxis {
  pos = 0
  vel = 0

  update(target: number, dt: number, tuning: SpringTuning): number {
    // 钳dt：窗口切后台会给出秒级长帧，不钳会把积分器炸飞
    dt = Math.min(dt, 1 / 30)
    const accel = tuning.stiffness * (target - this.pos) - tuning.damping * this.vel
    this.vel += accel * dt
    this.pos += this.vel * dt
    if (Math.abs(target - this.pos) < 0.01 && Math.abs(this.vel) < 0.01) {
      this.pos = target
      this.vel = 0
    }
    return this.pos
  }

  snap(value: number) {
    this.pos = value
    this.vel = 0
  }
}
