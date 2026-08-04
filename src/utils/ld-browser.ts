import { getAdapter, type AxiosInstance, type AxiosResponse } from 'axios'
import type { LdApi } from '@kongxiangyiren/ld-api'

interface NodeLikeStream {
  on(event: 'data' | 'end' | 'error', callback: (...args: unknown[]) => void): NodeLikeStream
}

function createNodeLikeStream(readable: ReadableStream<Uint8Array>): NodeLikeStream {
  const listeners: Record<'data' | 'end' | 'error', Array<(...args: unknown[]) => void>> = {
    data: [],
    end: [],
    error: [],
  }
  const decoder = new TextDecoder()
  const reader = readable.getReader()

  function emit(event: 'data' | 'end' | 'error', ...args: unknown[]) {
    for (const listener of listeners[event]) {
      listener(...args)
    }
  }

  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          emit('end')
          return
        }
        emit('data', decoder.decode(value, { stream: true }))
      }
    } catch (error) {
      emit('error', error)
    }
  })()

  return {
    on(event, callback) {
      listeners[event].push(callback)
      return this
    },
  }
}

export function enableBrowserStream(api: LdApi) {
  const instance = (api as unknown as { $axios?: AxiosInstance }).$axios
  if (!instance) {
    return
  }

  const defaultAdapter = getAdapter(['xhr', 'http', 'fetch'])
  const fetchAdapter = getAdapter('fetch')
  instance.defaults.adapter = async config => {
    const adapter = config.responseType === 'stream' ? fetchAdapter : defaultAdapter
    const response: AxiosResponse = await adapter(config)
    if (config.responseType === 'stream' && response.data instanceof ReadableStream) {
      response.data = createNodeLikeStream(response.data)
    }
    return response
  }
}
