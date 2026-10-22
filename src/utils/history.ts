import type { HistoryEntry } from '@/stores/generation'
import type { Settings } from '@/stores/settings'
import { uploadedImageFromDataUrl, type UploadedImage } from '@/utils/upload'

/** 把一条历史记录还原成生成参数（用于「重做」）。 */
export function applyEntryToSettings(config: Settings, entry: HistoryEntry): void {
  config.prompt = entry.prompt
  config.negativePrompt = entry.negativePrompt
  config.steps = entry.steps
  config.cfg = entry.cfg
  config.seed = entry.seed
  config.scheduler = entry.scheduler

  const snapshot = entry.snapshot
  if (snapshot) {
    config.width = snapshot.width
    config.height = snapshot.height
    config.aspectRatio = snapshot.aspectRatio
    config.manualDimensionMode = snapshot.manualDimensionMode
    config.denoiseStrength = snapshot.denoiseStrength
    config.showProcess = snapshot.showProcess
    config.useOpencl = snapshot.useOpencl
  } else {
    // 兼容旧记录：没有快照时至少还原实际输出尺寸。
    config.width = entry.width
    config.height = entry.height
  }
}

/** 图生图 / 局部重画历史记录里的底图，转换成上传组件需要的结构。 */
export function entryReferenceImage(entry: HistoryEntry): UploadedImage | null {
  if ((entry.mode !== 'img2img' && entry.mode !== 'inpaint') || !entry.inputImage) return null
  return uploadedImageFromDataUrl(entry.inputImage.dataUrl, entry.inputImage.name)
}

/** 局部重画历史记录里的蒙版（dataURL），用于恢复涂抹区域。 */
export function entryMaskImage(entry: HistoryEntry): string | null {
  if (entry.mode !== 'inpaint') return null
  return entry.inputMask?.dataUrl ?? null
}
