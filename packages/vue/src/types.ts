import type { RenderizerBridge } from './useRenderWindow.js'

declare global {
  interface Window {
    renderizer?: RenderizerBridge
  }
}

export {}
