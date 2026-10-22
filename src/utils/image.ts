/** base64 → 原始字节。 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/**
 * 后端返回的原始像素是 RGB（3 通道，逐像素排列）。
 * 这里转成 canvas 需要的 RGBA（alpha 固定 255）。
 */
export function toRgba(bytes: Uint8Array, width: number, height: number): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('无效的图片尺寸')
  }

  const pixelCount = width * height
  if (bytes.length !== pixelCount * 3) {
    throw new Error('原始像素长度与尺寸不匹配')
  }

  const rgba = new Uint8ClampedArray(pixelCount * 4)
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const source = pixel * 3
    const target = pixel * 4
    rgba[target] = bytes[source] ?? 0
    rgba[target + 1] = bytes[source + 1] ?? 0
    rgba[target + 2] = bytes[source + 2] ?? 0
    rgba[target + 3] = 255
  }
  return rgba
}

const PNG_BASE64_PREFIX = 'iVBORw0KGgo'
const JPEG_BASE64_PREFIX = '/9j/'

/** progress 事件有时直接给编码后的图片，用魔数判断。 */
export function encodedImageMime(base64: string): 'image/png' | 'image/jpeg' | null {
  if (base64.startsWith(PNG_BASE64_PREFIX)) return 'image/png'
  if (base64.startsWith(JPEG_BASE64_PREFIX)) return 'image/jpeg'
  return null
}

function drawToDataUrl(
  bytes: Uint8Array,
  width: number,
  height: number,
  mime: string,
  quality?: number,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器不支持 Canvas 2D')

  const imageData = context.createImageData(width, height)
  imageData.data.set(toRgba(bytes, width, height))
  context.putImageData(imageData, 0, 0)
  return canvas.toDataURL(mime, quality)
}

/** 生成结果：原始 RGB base64 → PNG data URL。 */
export function rawRgbToDataUrl(base64: string, width: number, height: number): string {
  return drawToDataUrl(base64ToBytes(base64), width, height, 'image/png')
}

/**
 * 扩散过程的中间预览。格式或尺寸不匹配时返回 null，
 * 调用方只保留进度条，不影响生成流程。
 */
export function previewToDataUrl(
  image: string,
  format: string | undefined,
  width: number,
  height: number,
): string | null {
  if (!image) return null

  const encodedMime = encodedImageMime(image)
  if (encodedMime) return `data:${encodedMime};base64,${image}`

  if (format !== undefined && format !== 'raw') return null
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    return null

  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(image)
  } catch {
    return null
  }
  if (bytes.length !== width * height * 3) return null

  try {
    return drawToDataUrl(bytes, width, height, 'image/jpeg', 0.9)
  } catch {
    return null
  }
}
