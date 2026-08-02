import type { RenderizerBridge } from './useRenderWindow'

declare global {
  interface Window {
    renderizer?: RenderizerBridge
  }
}

export {}
