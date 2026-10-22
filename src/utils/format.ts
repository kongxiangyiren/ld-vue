import type { Scheduler } from '@kongxiangyiren/ld-api'

import type { GenerationMode } from '@/stores/generation'
import { schedulerLabel } from '@/utils/generate'

export function generationModeLabel(mode: GenerationMode): string {
  if (mode === 'img2img') return '图生图'
  if (mode === 'inpaint') return '局部重画'
  return '文生图'
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const seconds = ms / 1000
  return seconds < 10 ? `${seconds.toFixed(1)} 秒` : `${Math.round(seconds)} 秒`
}

export function formatDateTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '—'
  return new Date(timestamp).toLocaleString()
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

export function buildFilename(seed: number, width: number, height: number): string {
  return `local-dream-${seed}-${width}x${height}.png`
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  link.rel = 'noopener'
  link.click()
}

export interface ShareableEntry {
  prompt: string
  negativePrompt: string
  steps: number
  cfg: number
  seed: number
  scheduler: Scheduler
  width: number
  height: number
  mode: GenerationMode
  modelName: string
}

export function shareText(entry: ShareableEntry): string {
  const lines = [
    entry.prompt,
    `Negative prompt: ${entry.negativePrompt}`,
    `Steps: ${entry.steps}, CFG: ${entry.cfg}, Seed: ${entry.seed}, Scheduler: ${schedulerLabel(entry.scheduler)}, Size: ${entry.width}x${entry.height}`,
    `Mode: ${generationModeLabel(entry.mode)}, Model: ${entry.modelName}`,
  ]
  return lines.join('\n')
}
