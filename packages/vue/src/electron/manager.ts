import { BrowserWindow } from 'electron'
import type { BrowserWindowConstructorOptions, IpcMainInvokeEvent, NativeImage, WebContents } from 'electron'

export interface RenderWindowState {
  isMaximized: boolean
  isFullScreen: boolean
}

export type RenderWindowAction = 'minimize' | 'toggle-maximize' | 'close' | 'focus'

export interface RenderWindowManagerOptions {
  preloadPath: string
  appId?: string
  icon?: NativeImage
  framePrefix?: string
  defaultWindowOptions?: BrowserWindowConstructorOptions
  openExternal?: (url: string) => Promise<void> | void
}

const defaultFramePrefix = 'renderizer'
const windowIdPattern = /^[a-z0-9][a-z0-9:_-]{0,127}$/

export function createRenderWindowFrameName(windowId: string, framePrefix = defaultFramePrefix): string {
  if (!windowIdPattern.test(windowId)) {
    throw new Error(`Invalid render window id: ${windowId}`)
  }
  return `${framePrefix}:${windowId}`
}

export function parseRenderWindowFrameName(frameName: string, framePrefix = defaultFramePrefix): string | null {
  const prefix = `${framePrefix}:`
  if (!frameName.startsWith(prefix)) return null
  const windowId = frameName.slice(prefix.length)
  return windowIdPattern.test(windowId) ? windowId : null
}

export class RenderWindowManager {
  private readonly windows = new Map<string, BrowserWindow>()
  private opener: WebContents | null = null
  private readonly framePrefix: string

  constructor(private readonly options: RenderWindowManagerOptions) {
    this.framePrefix = options.framePrefix ?? defaultFramePrefix
  }

  attachTo(opener: BrowserWindow): void {
    this.opener = opener.webContents
    opener.webContents.setWindowOpenHandler(({ url, frameName }) => {
      const windowId = parseRenderWindowFrameName(frameName, this.framePrefix)
      if (url !== 'about:blank' || !windowId) {
        if ((url.startsWith('https://') || url.startsWith('http://')) && this.options.openExternal) {
          void this.options.openExternal(url)
        }
        return { action: 'deny' }
      }

      const overrideBrowserWindowOptions: BrowserWindowConstructorOptions = {
        width: 1180,
        height: 780,
        minWidth: 360,
        minHeight: 240,
        frame: false,
        show: false,
        backgroundColor: '#111318',
        ...this.options.defaultWindowOptions,
        webPreferences: {
          preload: this.options.preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
          ...this.options.defaultWindowOptions?.webPreferences,
        },
      }
      if (this.options.icon) overrideBrowserWindowOptions.icon = this.options.icon

      return {
        action: 'allow',
        overrideBrowserWindowOptions,
      }
    })

    opener.webContents.on('did-create-window', (window, details) => {
      const windowId = parseRenderWindowFrameName(details.frameName, this.framePrefix)
      if (!windowId) {
        window.destroy()
        return
      }
      this.register(windowId, window)
    })
  }

  show(event: IpcMainInvokeEvent, windowId: string): void {
    const window = this.resolveOwnedWindow(event, windowId)
    window?.show()
    window?.focus()
  }

  control(event: IpcMainInvokeEvent, windowId: string, action: RenderWindowAction): void {
    const window = this.resolveOwnedWindow(event, windowId)
    if (!window) return

    if (action === 'minimize') window.minimize()
    if (action === 'focus') window.focus()
    if (action === 'toggle-maximize') {
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
    }
    if (action === 'close') window.close()
  }

  getState(event: IpcMainInvokeEvent, windowId: string): RenderWindowState {
    return this.readState(this.resolveOwnedWindow(event, windowId))
  }

  closeAll(): void {
    for (const window of this.windows.values()) {
      if (!window.isDestroyed()) window.destroy()
    }
    this.windows.clear()
  }

  private register(windowId: string, window: BrowserWindow): void {
    const previous = this.windows.get(windowId)
    if (previous && previous !== window && !previous.isDestroyed()) previous.destroy()
    this.windows.set(windowId, window)

    if (process.platform === 'win32' && this.options.appId) {
      window.setAppDetails({ appId: this.options.appId })
    }

    const sendState = () => {
      this.opener?.send('renderizer-window-state', {
        windowId,
        ...this.readState(window),
      })
    }

    window.on('maximize', sendState)
    window.on('unmaximize', sendState)
    window.on('enter-full-screen', sendState)
    window.on('leave-full-screen', sendState)
    window.on('closed', () => {
      if (this.windows.get(windowId) === window) this.windows.delete(windowId)
      this.opener?.send('renderizer-window-closed', { windowId })
    })
  }

  private resolveOwnedWindow(event: IpcMainInvokeEvent, windowId: string): BrowserWindow | null {
    if (event.sender !== this.opener || !windowIdPattern.test(windowId)) return null
    const window = this.windows.get(windowId)
    return window && !window.isDestroyed() ? window : null
  }

  private readState(window: BrowserWindow | null | undefined): RenderWindowState {
    return {
      isMaximized: window?.isMaximized() ?? false,
      isFullScreen: window?.isFullScreen() ?? false,
    }
  }
}
