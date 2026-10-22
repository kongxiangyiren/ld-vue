import { describe, expect, it } from 'vitest'
import type { Status } from '@kongxiangyiren/ld-api'

import { getReadiness } from '@/utils/readiness'

function status(state: Status['state'], message: string | null = null): Status {
  return {
    serving_model_id: 'model-1',
    state,
    message,
    error_model_id: null,
    width: 512,
    height: 512,
  }
}

describe('getReadiness', () => {
  it('allows generation while the device check is still running', () => {
    const readiness = getReadiness({ mode: 'checking', status: null, busy: false, prompt: 'cat' })
    expect(readiness.canGenerate).toBe(true)
    expect(readiness.message).toContain('8808')
  })

  it('blocks generation with an empty prompt', () => {
    expect(
      getReadiness({ mode: 'manual', status: null, busy: false, prompt: '   ' }).canGenerate,
    ).toBe(false)
  })

  it('blocks when busy', () => {
    const readiness = getReadiness({
      mode: 'manual',
      status: null,
      busy: true,
      prompt: 'cat',
    })
    expect(readiness.canGenerate).toBe(false)
    expect(readiness.message).toContain('正在生成')
  })

  it('asks for a model in auto mode when idle', () => {
    const readiness = getReadiness({
      mode: 'auto',
      status: status('idle'),
      busy: false,
      prompt: 'cat',
    })
    expect(readiness.canGenerate).toBe(false)
    expect(readiness.action).toBe('settings')
  })

  it('reports model loading and model errors', () => {
    expect(
      getReadiness({ mode: 'auto', status: status('starting'), busy: false, prompt: 'cat' }).tone,
    ).toBe('warn')

    const failed = getReadiness({
      mode: 'auto',
      status: status('error', 'out of memory'),
      busy: false,
      prompt: 'cat',
    })
    expect(failed.canGenerate).toBe(false)
    expect(failed.message).toBe('out of memory')
    expect(failed.action).toBe('settings')
  })

  it('allows generation when the model is running', () => {
    const readiness = getReadiness({
      mode: 'auto',
      status: status('running'),
      busy: false,
      prompt: 'cat',
    })
    expect(readiness.canGenerate).toBe(true)
    expect(readiness.message).toBeNull()
  })

  it('allows generation in manual mode without any 8081 probe result', () => {
    const readiness = getReadiness({ mode: 'manual', status: null, busy: false, prompt: 'cat' })
    expect(readiness.canGenerate).toBe(true)
    expect(readiness.message).toBeNull()
  })
})
