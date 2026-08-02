import { Teleport, computed, defineComponent, h, ref, toRef, watch } from 'vue'
import type { PropType } from 'vue'
import type { WindowFeatureOptions } from '@renderizer/core'
import { useRenderWindow, type RenderizerBridge, type UseRenderWindowOptions } from './useRenderWindow.js'
import { getRenderizerConfig, resolveRenderWindowPreset } from './config.js'

const windowOpenFeatureKeys = [
  'width',
  'height',
  'left',
  'top',
  'popup',
  'resizable',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'frame',
  'transparent',
  'backgroundColor',
  'alwaysOnTop',
] as const

function pickWindowOpenFeatures(source: Partial<WindowFeatureOptions> | undefined): WindowFeatureOptions {
  const features: WindowFeatureOptions = {}
  if (!source) return features
  for (const key of windowOpenFeatureKeys) {
    const value = source[key]
    if (value !== undefined) {
      ;(features as Record<string, unknown>)[key] = value
    }
  }
  return features
}

export default defineComponent({
  name: 'RenderWindow',
  props: {
    open: { type: Boolean, required: true },
    windowId: { type: String, required: true },
    title: { type: String, default: '' },
    configId: { type: String, default: '' },
    features: { type: Object as PropType<WindowFeatureOptions>, default: () => ({}) },
    width: { type: Number, default: undefined },
    height: { type: Number, default: undefined },
    enabled: { type: Boolean, default: true },
    bridge: { type: Object as PropType<RenderizerBridge>, default: undefined },
    bridgeName: { type: String, default: 'renderizer' },
    framePrefix: { type: String, default: undefined },
    fallback: { type: String as PropType<'render' | 'none'>, default: 'render' },
    excludeDocumentClasses: { type: Array as PropType<string[]>, default: () => [] },
  },
  emits: {
    'update:open': (_open: boolean) => true,
    closed: () => true,
    'open-failed': () => true,
  },
  setup(props, { slots, emit }) {
    const externalOpenFailed = ref(false)
    const openRef = toRef(props, 'open')
    const preset = computed(() => props.configId ? resolveRenderWindowPreset(props.configId) : undefined)
    const defaultWindow = computed(() => getRenderizerConfig()?.windows?.default)
    const title = computed(() => props.title || preset.value?.title || props.windowId)
    const featureOptions = computed<WindowFeatureOptions>(() => {
      const features: WindowFeatureOptions = {
        ...pickWindowOpenFeatures(defaultWindow.value),
        ...pickWindowOpenFeatures(preset.value),
        ...props.features,
      }
      const width = props.width ?? props.features.width ?? preset.value?.width ?? defaultWindow.value?.width
      const height = props.height ?? props.features.height ?? preset.value?.height ?? defaultWindow.value?.height
      if (width !== undefined) features.width = width
      if (height !== undefined) features.height = height
      return features
    })
    const enabled = computed(() => props.enabled && !externalOpenFailed.value)
    const windowSurfaceOptions: UseRenderWindowOptions = {
      windowId: toRef(props, 'windowId'),
      title,
      open: openRef,
      features: featureOptions,
      bridgeName: props.bridgeName,
      enabled,
      excludeDocumentClasses: props.excludeDocumentClasses,
      onClosed: () => {
        emit('update:open', false)
        emit('closed')
      },
      onOpenFailed: () => {
        externalOpenFailed.value = true
        emit('open-failed')
      },
      ...(props.bridge ? { bridge: props.bridge } : {}),
      ...(props.framePrefix ? { framePrefix: props.framePrefix } : {}),
    }
    const windowSurface = useRenderWindow(windowSurfaceOptions)

    watch(openRef, (open) => {
      if (!open) externalOpenFailed.value = false
    })

    return () => {
      if (!props.open) return null
      if (windowSurface.isExternal.value && windowSurface.target.value) {
        return h(Teleport as unknown as string, { to: windowSurface.target.value }, slots.default?.({
          document: windowSurface.target.value.ownerDocument,
          isMaximized: windowSurface.isMaximized.value,
          control: windowSurface.control,
        }))
      }
      if (windowSurface.isExternal.value) return null
      if (props.fallback === 'none') return null
      return slots.default?.({
        document: document,
        isMaximized: false,
        control: windowSurface.control,
      })
    }
  },
})
