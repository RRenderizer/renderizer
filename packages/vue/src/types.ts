import type { TeleportWindowBridge } from './useTeleportWindow'

declare global {
  interface Window {
    renderizer?: TeleportWindowBridge
  }
}

export {}
