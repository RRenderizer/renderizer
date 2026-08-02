import type { WindowFeatureOptions } from '@renderizer/core'

export interface RenderizerConfig {
  adapter: 'vue'
  electron?: {
    bridgeName?: string
    framePrefix?: string
  }
  windows?: {
    defaultFeatures?: WindowFeatureOptions
  }
}

export function defineRenderizerConfig(config: RenderizerConfig): RenderizerConfig {
  return config
}
