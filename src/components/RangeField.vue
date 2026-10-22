<script setup lang="ts">
import { useId } from 'vue'

const model = defineModel<number>({ required: true })

const props = withDefaults(
  defineProps<{
    label: string
    min?: number
    max?: number
    step?: number
    suffix?: string
    hint?: string
    disabled?: boolean
  }>(),
  {
    min: 0,
    max: 100,
    step: 1,
    suffix: '',
    hint: '',
    disabled: false,
  },
)

const id = useId()

function clamp(value: number): number {
  if (!Number.isFinite(value)) return props.min
  return Math.min(props.max, Math.max(props.min, value))
}

function onNumberChange(event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  if (!Number.isFinite(value)) return
  model.value = clamp(value)
}
</script>

<template>
  <div class="g-field">
    <div class="flex items-baseline justify-between gap-2">
      <label :for="id" class="g-label">{{ label }}</label>
      <span class="g-value">{{ model }}{{ suffix }}</span>
    </div>

    <div class="g-range-row">
      <input
        :id="id"
        v-model.number="model"
        class="g-range"
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :disabled="disabled"
      />
      <input
        v-model.number="model"
        class="g-input g-number"
        type="number"
        :min="min"
        :max="max"
        :step="step"
        :disabled="disabled"
        :aria-label="`${label}（数值）`"
        @change="onNumberChange"
      />
    </div>

    <p v-if="hint" class="g-hint">{{ hint }}</p>
  </div>
</template>
