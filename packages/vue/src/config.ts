import type { WindowFeatureOptions } from '@renderizer/core'

export interface RenderWindowPreset {
  id: string
  title?: string
  features?: WindowFeatureOptions
  electron?: {
    width?: number
    height?: number
    minWidth?: number
    minHeight?: number
    maxWidth?: number
    maxHeight?: number
    x?: number
    y?: number
    center?: boolean
    resizable?: boolean
    movable?: boolean
    minimizable?: boolean
    maximizable?: boolean
    closable?: boolean
    alwaysOnTop?: boolean
    fullscreen?: boolean
    maximized?: boolean
    frame?: boolean
    transparent?: boolean
    backgroundColor?: string
    titleBarStyle?: 'default' | 'hidden' | 'hiddenInset' | 'customButtonsOnHover'
  }
}

export interface RenderizerConfig {
  adapter: 'vue'
  paths?: {
    renderer?: string
    electron?: string
  }
  windows?: {
    defaultFeatures?: WindowFeatureOptions
    presets?: RenderWindowPreset[]
  }
}

let activeRenderizerConfig: RenderizerConfig | null = null

export function defineRenderizerConfig(config: RenderizerConfig): RenderizerConfig {
  return config
}

export function setRenderizerConfig(config: RenderizerConfig): void {
  activeRenderizerConfig = config
}

export function getRenderizerConfig(): RenderizerConfig | null {
  return activeRenderizerConfig
}

export function resolveRenderWindowPreset(id: string): RenderWindowPreset | undefined {
  return activeRenderizerConfig?.windows?.presets?.find((preset) => preset.id === id)
}
