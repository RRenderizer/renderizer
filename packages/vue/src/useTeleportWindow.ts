import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import { createWindowSurface, type WindowFeatureOptions, type WindowSurfaceController } from '@renderizer/core'
import './types'

export interface TeleportWindowBridge {
  isTeleportWindowHost: boolean
  ready: (windowId: string) => Promise<void>
  control: (windowId: string, action: 'minimize' | 'toggle-maximize' | 'close' | 'focus') => Promise<void>
  getState: (windowId: string) => Promise<{ isMaximized: boolean; isFullScreen: boolean }>
  onStateChange: (
    callback: (state: { windowId: string; isMaximized: boolean; isFullScreen: boolean }) => void,
  ) => () => void
  onClosed: (callback: (state: { windowId: string }) => void) => () => void
}

export interface UseTeleportWindowOptions {
  windowId: Ref<string> | string
  title: Ref<string> | string
  open: Ref<boolean>
  features?: Ref<WindowFeatureOptions> | WindowFeatureOptions
  bridge?: TeleportWindowBridge
  bridgeName?: string
  enabled?: Ref<boolean> | boolean
  framePrefix?: string
  excludeDocumentClasses?: string[]
  onClosed?: () => void
  onOpenFailed?: () => void
}

export interface UseTeleportWindowReturn {
  target: Ref<HTMLElement | null>
  isMaximized: Ref<boolean>
  isExternal: Ref<boolean>
  openWindow: () => void
  closeWindow: () => void
  control: (action: 'minimize' | 'toggle-maximize' | 'close' | 'focus') => void
}

function valueOf<T>(source: Ref<T> | T): T {
  return typeof source === 'object' && source !== null && 'value' in source ? source.value : source
}

function resolveBridge(options: UseTeleportWindowOptions): TeleportWindowBridge | undefined {
  if (options.bridge) return options.bridge
  const bridgeName = options.bridgeName ?? 'renderizer'
  return (window as unknown as Record<string, TeleportWindowBridge | undefined>)[bridgeName]
}

export function useTeleportWindow(options: UseTeleportWindowOptions): UseTeleportWindowReturn {
  const controller = shallowRef<WindowSurfaceController | null>(null)
  const target = ref<HTMLElement | null>(null)
  const isMaximized = ref(false)
  const bridge = computed(() => resolveBridge(options))
  const isExternal = computed(() => {
    const enabled = options.enabled === undefined ? true : valueOf(options.enabled)
    return enabled && bridge.value?.isTeleportWindowHost === true
  })
  let removeStateListener: (() => void) | undefined
  let removeClosedListener: (() => void) | undefined

  function ensureListeners(): void {
    if (!bridge.value || removeStateListener || removeClosedListener) return
    removeStateListener = bridge.value.onStateChange((state) => {
      if (state.windowId !== valueOf(options.windowId)) return
      isMaximized.value = state.isMaximized || state.isFullScreen
    })
    removeClosedListener = bridge.value.onClosed((state) => {
      if (state.windowId !== valueOf(options.windowId)) return
      dispose(false)
      options.onClosed?.()
    })
  }

  function openWindow(): void {
    if (!options.open.value || !isExternal.value) return
    const windowId = valueOf(options.windowId)
    const sync = options.excludeDocumentClasses
      ? { excludeDocumentClasses: options.excludeDocumentClasses }
      : undefined

    controller.value ??= createWindowSurface({
      id: windowId,
      title: valueOf(options.title),
      features: valueOf(options.features ?? {}),
      ...(options.framePrefix ? { targetPrefix: options.framePrefix } : {}),
      ...(sync ? { sync } : {}),
    })

    const surface = controller.value.open()
    target.value = surface?.target ?? null
    if (!surface) {
      options.onOpenFailed?.()
      return
    }

    ensureListeners()
    void bridge.value?.ready(windowId)
    void bridge.value?.getState(windowId).then((state) => {
      isMaximized.value = state.isMaximized || state.isFullScreen
    })
  }

  function dispose(closeWindow = true): void {
    controller.value?.dispose({ closeWindow })
    controller.value = null
    target.value = null
    isMaximized.value = false
  }

  function closeWindow(): void {
    dispose()
  }

  function control(action: 'minimize' | 'toggle-maximize' | 'close' | 'focus'): void {
    void bridge.value?.control(valueOf(options.windowId), action)
  }

  watch(
    () => options.open.value,
    (open) => {
      if (open) openWindow()
      else dispose()
    },
    { immediate: true },
  )

  watch(
    () => valueOf(options.title),
    (title, previousTitle) => {
      controller.value?.updateTitle(title)
      if (options.open.value && previousTitle !== undefined) controller.value?.focus()
    },
  )

  onBeforeUnmount(() => {
    removeStateListener?.()
    removeClosedListener?.()
    dispose()
  })

  return {
    target,
    isMaximized,
    isExternal,
    openWindow,
    closeWindow,
    control,
  }
}
