import type { App, Plugin } from 'vue'
import { setRenderizerConfig, type RenderizerConfig } from './config'

export function createRenderizer(config: RenderizerConfig): Plugin {
  return {
    install(app: App) {
      setRenderizerConfig(config)
      app.provide('renderizer:config', config)
    },
  }
}
