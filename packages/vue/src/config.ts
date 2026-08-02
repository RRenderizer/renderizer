import type { WindowFeatureOptions } from '@renderizer/core'

export interface RenderWindowPreset extends WindowFeatureOptions {
  id: string
  title?: string
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  x?: number
  y?: number
  center?: boolean
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

export interface RenderizerConfig {
  adapter: 'vue'
  paths?: {
    renderer?: string
    electron?: string
  }
  windows?: {
    default?: Omit<RenderWindowPreset, 'id'>
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
