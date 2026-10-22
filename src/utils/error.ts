import type { ErrorEvent as LdErrorEvent } from '@kongxiangyiren/ld-api'

/** 生成接口以普通对象 reject，而不是 Error 实例。 */
export function isLdError(value: unknown): value is LdErrorEvent {
  if (typeof value !== 'object' || value === null) return false
  const { type, message } = value as { type?: unknown; message?: unknown }
  return (type === 'error' || type === 'request_error') && typeof message === 'string'
}

export function isAbortError(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  return (value as { name?: unknown }).name === 'AbortError'
}

interface FetchErrorLike {
  data?: { error?: { message?: unknown } }
}

/**
 * 统一把 ld-api / ofetch / 浏览器错误转成可展示的中文文案。
 * `fallback` 用于网络层错误（TypeError: Failed to fetch 等）的上下文说明。
 */
export function describeError(value: unknown, fallback: string): string {
  if (isLdError(value)) return value.message

  if (value instanceof Error) {
    const detailed = (value as Error & FetchErrorLike).data?.error?.message
    if (typeof detailed === 'string' && detailed) return detailed
    if (value instanceof TypeError) return fallback
    return value.message || fallback
  }

  if (typeof value === 'string' && value) return value
  return fallback
}
