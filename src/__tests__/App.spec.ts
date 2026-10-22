import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

import App from '@/App.vue'
import { ldDevice } from '@/api/ld'

vi.mock('@/api/ld', () => ({
  ldApi: {
    tokenize: vi.fn<(...args: unknown[]) => unknown>(),
    generateImage: vi.fn<(...args: unknown[]) => unknown>(),
  },
  ldDevice: {
    getInfo: vi.fn<(...args: unknown[]) => unknown>(),
    getModels: vi.fn<(...args: unknown[]) => unknown>(),
    getStatus: vi.fn<(...args: unknown[]) => unknown>(),
    selectModel: vi.fn<(...args: unknown[]) => unknown>(),
    stop: vi.fn<(...args: unknown[]) => unknown>(),
  },
}))

const model = {
  id: 'model-1',
  name: 'Test Model',
  description: '',
  run_on_cpu: true,
  is_sdxl: false,
  is_anima: false,
  dit_kind: 'sd15',
  is_custom: false,
  generation_size: 512,
  defaults: { prompt: '', negative_prompt: '', steps: 20, cfg: 7.5, scheduler: 'dpm' as const },
  resolutions: [] as [],
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.mocked(ldDevice.getInfo).mockResolvedValue({
    app: 'localdream',
    version: '2.8.1',
    protocol: 1,
    device: 'Pixel',
  })
  vi.mocked(ldDevice.getModels).mockResolvedValue({
    use_img2img: true,
    models: [model],
    upscalers: [],
  })
  vi.mocked(ldDevice.getStatus).mockResolvedValue({
    serving_model_id: 'model-1',
    state: 'running',
    message: null,
    error_model_id: null,
    width: 512,
    height: 512,
  })
})

describe('App', () => {
  it('renders the brand, route tabs and the device status pill', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>首页内容</div>' } },
        { path: '/img2img', component: { template: '<div>图生图内容</div>' } },
        { path: '/inpaint', component: { template: '<div>局部重画内容</div>' } },
        { path: '/gallery', component: { template: '<div>画廊内容</div>' } },
        { path: '/settings', component: { template: '<div>设置内容</div>' } },
      ],
    })
    await router.push('/')
    await router.isReady()

    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), router],
      },
    })

    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Local Dream')
    expect(text).toContain('文生图')
    expect(text).toContain('图生图')
    expect(text).toContain('局部重画')
    expect(text).toContain('画廊')
    expect(text).toContain('设备与模型')
    expect(text).toContain('运行中')
    expect(text).toContain('Test Model')
    expect(text).toContain('首页内容')

    expect(wrapper.find('a[href="/"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/img2img"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/settings"]').exists()).toBe(true)

    wrapper.unmount()
  })
})
