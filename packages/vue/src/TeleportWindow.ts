import { Teleport, computed, defineComponent, h, ref, toRef, watch } from 'vue'
import type { PropType } from 'vue'
import type { WindowFeatureOptions } from '@renderizer/core'
import { useTeleportWindow, type TeleportWindowBridge, type UseTeleportWindowOptions } from './useTeleportWindow'

export default defineComponent({
  name: 'TeleportWindow',
  props: {
    open: { type: Boolean, required: true },
    windowId: { type: String, required: true },
    title: { type: String, required: true },
    features: { type: Object as PropType<WindowFeatureOptions>, default: () => ({}) },
    width: { type: Number, default: undefined },
    height: { type: Number, default: undefined },
    enabled: { type: Boolean, default: true },
    bridge: { type: Object as PropType<TeleportWindowBridge>, default: undefined },
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
    const featureOptions = computed(() => ({
      ...props.features,
      ...(props.width ?? props.features.width ? { width: props.width ?? props.features.width } : {}),
      ...(props.height ?? props.features.height ? { height: props.height ?? props.features.height } : {}),
    }))
    const enabled = computed(() => props.enabled && !externalOpenFailed.value)
    const windowSurfaceOptions: UseTeleportWindowOptions = {
      windowId: toRef(props, 'windowId'),
      title: toRef(props, 'title'),
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
    const windowSurface = useTeleportWindow(windowSurfaceOptions)

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
      if (props.fallback === 'none') return null
      return slots.default?.({
        document: document,
        isMaximized: false,
        control: windowSurface.control,
      })
    }
  },
})
