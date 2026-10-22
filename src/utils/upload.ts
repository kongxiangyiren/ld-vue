export interface UploadedImage {
  /** 不带 dataURL 前缀的 base64（后端要求 PNG/JPEG 字节）。 */
  base64: string
  dataUrl: string
  name: string
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

/** 从 dataURL 还原上传组件需要的数据（用于「使用当前结果」/画廊重做）。 */
export function uploadedImageFromDataUrl(dataUrl: string, name: string): UploadedImage | null {
  const commaIndex = dataUrl.indexOf(',')
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : ''
  if (!base64) return null
  return { base64, dataUrl, name }
}

export function isSupportedImage(file: File): boolean {
  return file.type === 'image/png' || file.type === 'image/jpeg'
}

export function readImageFile(file: File): Promise<UploadedImage> {
  if (!isSupportedImage(file)) {
    return Promise.reject(new Error('只支持 PNG / JPEG 图片'))
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Promise.reject(new Error('图片不能超过 20MB'))
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      if (!base64) {
        reject(new Error('图片读取失败'))
        return
      }
      resolve({ base64, dataUrl, name: file.name })
    }
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}
