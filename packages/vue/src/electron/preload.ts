import { contextBridge, ipcRenderer } from 'electron'

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

export function exposeTeleportWindowBridge(globalName = 'renderizer'): void {
  const bridge: TeleportWindowBridge = {
    isTeleportWindowHost: true,
    ready: (windowId) => ipcRenderer.invoke('renderizer-window-ready', windowId),
    control: (windowId, action) => ipcRenderer.invoke('renderizer-window-control', windowId, action),
    getState: (windowId) => ipcRenderer.invoke('renderizer-window-state', windowId),
    onStateChange: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        state: { windowId: string; isMaximized: boolean; isFullScreen: boolean },
      ) => callback(state)
      ipcRenderer.on('renderizer-window-state', listener)
      return () => ipcRenderer.removeListener('renderizer-window-state', listener)
    },
    onClosed: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, state: { windowId: string }) => callback(state)
      ipcRenderer.on('renderizer-window-closed', listener)
      return () => ipcRenderer.removeListener('renderizer-window-closed', listener)
    },
  }

  contextBridge.exposeInMainWorld(globalName, bridge)
}
