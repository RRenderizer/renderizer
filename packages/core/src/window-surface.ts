export interface WindowFeatureOptions {
  width?: number
  height?: number
  left?: number
  top?: number
  x?: number
  y?: number
  popup?: boolean
  resizable?: boolean
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  frame?: boolean
  show?: boolean
  center?: boolean
  movable?: boolean
  minimizable?: boolean
  maximizable?: boolean
  closable?: boolean
  focusable?: boolean
  fullscreen?: boolean
  fullscreenable?: boolean
  simpleFullscreen?: boolean
  skipTaskbar?: boolean
  kiosk?: boolean
  titleBarOverlay?: boolean
  transparent?: boolean
  alwaysOnTop?: boolean
  autoHideMenuBar?: boolean
  enableLargerThanScreen?: boolean
  hasShadow?: boolean
  thickFrame?: boolean
  paintWhenInitiallyHidden?: boolean
  acceptFirstMouse?: boolean
  disableAutoHideCursor?: boolean
  roundedCorners?: boolean
  backgroundColor?: string
  titleBarStyle?: 'default' | 'hidden' | 'hiddenInset' | 'customButtonsOnHover'
  vibrancy?: string
  visualEffectState?: 'followWindow' | 'active' | 'inactive'
  opacity?: number
  darkTheme?: boolean
}

export interface WindowSurfaceSyncOptions {
  selector?: string
  documentAttributes?: string[]
  excludeDocumentClasses?: string[]
  bodyClassName?: string
}

export interface OpenWindowSurfaceOptions {
  id: string
  title: string
  url?: string
  targetPrefix?: string
  features?: WindowFeatureOptions
  sync?: WindowSurfaceSyncOptions
  sourceWindow?: Window
}

export interface WindowSurface {
  id: string
  window: Window
  document: Document
  target: HTMLElement
}

export interface WindowSurfaceController {
  readonly id: string
  readonly surface: WindowSurface | null
  open: () => WindowSurface | null
  focus: () => void
  updateTitle: (title: string) => void
  dispose: (options?: { closeWindow?: boolean }) => void
}

const defaultStyleSelector = 'link[rel="stylesheet"], style'
const defaultTargetPrefix = 'renderizer'

export function normalizeWindowFeatures(features: WindowFeatureOptions = {}): string {
  const entries = [
    ['popup', features.popup ?? true],
    ['width', features.width],
    ['height', features.height],
    ['left', features.left],
    ['top', features.top],
    ['x', features.x],
    ['y', features.y],
    ['resizable', features.resizable],
    ['minWidth', features.minWidth],
    ['minHeight', features.minHeight],
    ['maxWidth', features.maxWidth],
    ['maxHeight', features.maxHeight],
    ['frame', features.frame],
    ['show', features.show],
    ['center', features.center],
    ['movable', features.movable],
    ['minimizable', features.minimizable],
    ['maximizable', features.maximizable],
    ['closable', features.closable],
    ['focusable', features.focusable],
    ['fullscreen', features.fullscreen],
    ['fullscreenable', features.fullscreenable],
    ['simpleFullscreen', features.simpleFullscreen],
    ['skipTaskbar', features.skipTaskbar],
    ['kiosk', features.kiosk],
    ['titleBarOverlay', features.titleBarOverlay],
    ['transparent', features.transparent],
    ['alwaysOnTop', features.alwaysOnTop],
    ['autoHideMenuBar', features.autoHideMenuBar],
    ['enableLargerThanScreen', features.enableLargerThanScreen],
    ['hasShadow', features.hasShadow],
    ['thickFrame', features.thickFrame],
    ['paintWhenInitiallyHidden', features.paintWhenInitiallyHidden],
    ['acceptFirstMouse', features.acceptFirstMouse],
    ['disableAutoHideCursor', features.disableAutoHideCursor],
    ['roundedCorners', features.roundedCorners],
    ['backgroundColor', features.backgroundColor],
    ['titleBarStyle', features.titleBarStyle],
    ['vibrancy', features.vibrancy],
    ['visualEffectState', features.visualEffectState],
    ['opacity', features.opacity],
    ['darkTheme', features.darkTheme],
  ] as const

  return entries
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value === true ? 'yes' : value === false ? 'no' : value}`)
    .join(',')
}

export function isWindowSurfaceOpen(surfaceWindow: Window | null | undefined): surfaceWindow is Window {
  return Boolean(surfaceWindow && !surfaceWindow.closed)
}

export function createWindowSurface(options: OpenWindowSurfaceOptions): WindowSurfaceController {
  const sourceWindow = options.sourceWindow ?? window
  const sourceDocument = sourceWindow.document
  const targetPrefix = options.targetPrefix ?? defaultTargetPrefix
  const frameName = `${targetPrefix}:${options.id}`
  const url = options.url ?? 'about:blank'
  const syncOptions = options.sync ?? {}
  const styleSelector = syncOptions.selector ?? defaultStyleSelector
  const observedAttributes = syncOptions.documentAttributes ?? ['class', 'style', 'data-theme']
  const excludedClasses = new Set(syncOptions.excludeDocumentClasses ?? [])
  let surface: WindowSurface | null = null
  let documentObserver: MutationObserver | null = null
  let headObserver: MutationObserver | null = null

  function syncDocumentTheme(targetDocument: Document): void {
    const sourceElement = sourceDocument.documentElement
    const nextClasses = [...sourceElement.classList].filter((className) => !excludedClasses.has(className))
    targetDocument.documentElement.className = nextClasses.join(' ')

    for (const attribute of observedAttributes) {
      if (attribute === 'class') continue
      const value = sourceElement.getAttribute(attribute)
      if (value === null) targetDocument.documentElement.removeAttribute(attribute)
      else targetDocument.documentElement.setAttribute(attribute, value)
    }
  }

  function syncStyles(targetDocument: Document): void {
    targetDocument.head.querySelectorAll('[data-renderizer-style]').forEach((node) => node.remove())
    sourceDocument.head.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(styleSelector)
      .forEach((source) => {
        const copy = source.cloneNode(true) as HTMLLinkElement | HTMLStyleElement
        copy.setAttribute('data-renderizer-style', '')
        if (source.tagName.toLowerCase() === 'link') {
          ;(copy as HTMLLinkElement).href = (source as HTMLLinkElement).href
        }
        targetDocument.head.append(copy)
      })
  }

  function prepareDocument(targetWindow: Window): WindowSurface {
    const targetDocument = targetWindow.document
    targetDocument.title = options.title
    targetDocument.documentElement.lang = sourceDocument.documentElement.lang || 'en'
    targetDocument.body.replaceChildren()
    targetDocument.body.className = syncOptions.bodyClassName ?? 'renderizer-document'

    syncDocumentTheme(targetDocument)
    syncStyles(targetDocument)

    const target = targetDocument.createElement('div')
    target.id = `${targetPrefix}-${options.id}`
    target.className = 'renderizer-mount'
    targetDocument.body.append(target)

    const nextDocumentObserver = new MutationObserver(() => syncDocumentTheme(targetDocument))
    nextDocumentObserver.observe(sourceDocument.documentElement, {
      attributes: true,
      attributeFilter: observedAttributes,
    })
    documentObserver = nextDocumentObserver

    const nextHeadObserver = new MutationObserver(() => syncStyles(targetDocument))
    nextHeadObserver.observe(sourceDocument.head, { childList: true, subtree: true })
    headObserver = nextHeadObserver

    return {
      id: options.id,
      window: targetWindow,
      document: targetDocument,
      target,
    }
  }

  return {
    get id() {
      return options.id
    },
    get surface() {
      return surface
    },
    open() {
      if (isWindowSurfaceOpen(surface?.window)) {
        surface.window.focus()
        return surface
      }

      const childWindow = sourceWindow.open(url, frameName, normalizeWindowFeatures(options.features))
      if (!childWindow) return null

      surface = prepareDocument(childWindow)
      return surface
    },
    focus() {
      if (isWindowSurfaceOpen(surface?.window)) surface.window.focus()
    },
    updateTitle(title: string) {
      if (isWindowSurfaceOpen(surface?.window)) surface.document.title = title
    },
    dispose(disposeOptions = {}) {
      documentObserver?.disconnect()
      headObserver?.disconnect()
      documentObserver = null
      headObserver = null

      if (disposeOptions.closeWindow !== false && isWindowSurfaceOpen(surface?.window)) {
        surface.window.close()
      }
      surface = null
    },
  }
}
