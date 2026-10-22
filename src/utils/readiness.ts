import type { Status } from '@kongxiangyiren/ld-api'

export type DeviceMode = 'checking' | 'auto' | 'manual'

export type ReadinessTone = 'info' | 'warn' | 'error'

export interface Readiness {
  canGenerate: boolean
  tone: ReadinessTone
  /** 为 null 表示无需提示。 */
  message: string | null
  /** 提示用户去「设备与模型」页处理。 */
  action?: 'settings'
}

export interface ReadinessInput {
  mode: DeviceMode
  status: Status | null
  busy: boolean
  prompt: string
}

/**
 * 生成就绪判断（与 8081 探测结果无关：探测只作提示，不阻塞生成）。
 * 8808 不可用时进入手动模式，只要提示词非空即可尝试生成。
 */
export function getReadiness(input: ReadinessInput): Readiness {
  const { mode, status, busy, prompt } = input

  if (busy) {
    return { canGenerate: false, tone: 'info', message: '正在生成，请稍候…' }
  }

  if (mode === 'auto') {
    const state = status?.state
    if (state === 'running') {
      if (!prompt.trim()) {
        return { canGenerate: false, tone: 'info', message: '输入提示词后即可生成' }
      }
      return { canGenerate: true, tone: 'info', message: null }
    }
    if (state === 'starting') {
      return { canGenerate: false, tone: 'warn', message: '模型加载中，请稍候…' }
    }
    if (state === 'error') {
      return {
        canGenerate: false,
        tone: 'error',
        message: status?.message ?? '模型运行出错，请到「设备与模型」重新加载',
        action: 'settings',
      }
    }
    return {
      canGenerate: false,
      tone: 'warn',
      message: '尚未加载模型，请先到「设备与模型」选择并加载模型',
      action: 'settings',
    }
  }

  // checking：设备接口还没返回，不阻塞，直接允许尝试 8081。
  // manual：8808 不可用，只依赖 8081。
  if (!prompt.trim()) {
    return { canGenerate: false, tone: 'info', message: '输入提示词后即可生成' }
  }

  return {
    canGenerate: true,
    tone: 'info',
    message: mode === 'checking' ? '正在检测设备接口（8808），可直接尝试生成' : null,
  }
}
