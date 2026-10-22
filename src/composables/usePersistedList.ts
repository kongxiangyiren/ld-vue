import { shallowRef, type Ref } from 'vue'
import { useIDBKeyval } from '@vueuse/integrations/useIDBKeyval'

interface PersistedList<T> {
  data: Ref<T[]>
  isFinished: Ref<boolean>
  set: (value: T[]) => Promise<void>
}

/**
 * IndexedDB 持久化数组（生成记录用）。
 * 没有 IndexedDB 的环境（例如 jsdom 单元测试）自动退回内存数组。
 */
export function usePersistedList<T>(key: string, initialValue: T[] = []): PersistedList<T> {
  if (typeof indexedDB === 'undefined') {
    const data = shallowRef(initialValue)
    return {
      data,
      isFinished: shallowRef(true),
      set: async (value: T[]) => {
        data.value = value
      },
    }
  }

  const { data, isFinished, set } = useIDBKeyval<T[]>(key, initialValue, {
    // 数组整体替换即可；浅层 ref 同时避免代理对象进入 IndexedDB（DataCloneError）。
    shallow: true,
    deep: false,
    onError: (error) => {
      console.warn('[ld-vue] 写入 IndexedDB 失败，生成记录可能无法保存', error)
    },
  })

  return { data, isFinished, set }
}
