<img width="1546" height="423" alt="renderizer_banner" src="https://github.com/user-attachments/assets/919b6722-a24c-4317-9895-4138e45bb470" />

# Renderizer

Renderizer is a framework for building lightweight multi-window Electron apps without booting a second frontend app for every window.

Render one frontend runtime across multiple native windows. Keep your Vue state, theme, styles and components in one app, while Renderizer turns extra Electron windows into render surfaces.

```vue
<RenderWindow
  v-model:open="open"
  window-id="inspector"
  config-id="inspector"
>
  <InspectorPanel />
</RenderWindow>
```

## Packages

- `@renderizer/core`: framework-agnostic browser runtime for opening child documents and syncing document state.
- `@renderizer/vue`: Vue components, composables, and optional Electron integration helpers.
- `@renderizer/create`: CLI for adding Renderizer to existing projects.
- `@renderizer/js`: planned DOM-first adapter for vanilla JavaScript apps.
- `@renderizer/react`: planned React components, hooks, and optional Electron integration helpers.

## Why This Exists

Traditional Electron multi-window apps often spin up another renderer route or another frontend app instance for every window. That works, but it can duplicate app bootstrap, state setup, clients, caches and memory.

Renderizer keeps the app state in one runtime and treats native windows as extra documents.

## Quick Start

Add Renderizer to an existing project:

```bash
npm create @renderizer
```

The CLI asks for:

- The project root.
- The adapter to install.
- The renderer app path.
- The Electron app path.
- Whether to create `renderizer.config.ts` or `renderizer.config.js`.
- Whether to create an example `RenderWindow` component.

## Vue Setup

Install the Vue adapter:

```bash
npm install @renderizer/vue
```

Register Renderizer in your Vue entrypoint:

```ts
import { createApp } from 'vue'
import { createRenderizer } from '@renderizer/vue'
import App from './App.vue'
import renderizerConfig from '../renderizer.config'

createApp(App)
  .use(createRenderizer(renderizerConfig))
  .mount('#app')
```

Create `renderizer.config.ts` at your project root:

```ts
import { defineRenderizerConfig } from '@renderizer/vue'

export default defineRenderizerConfig({
  adapter: 'vue',
  paths: {
    renderer: './apps/client',
    electron: './apps/desktop',
  },
  windows: {
    default: {
      width: 1180,
      height: 780,
      popup: true,
    },
    presets: [
      {
        id: 'inspector',
        title: 'Inspector',
        width: 1200,
        height: 760,
        popup: true,
        minWidth: 720,
        minHeight: 480,
        frame: false,
        backgroundColor: '#111318',
      },
    ],
  },
})
```

Render a Vue component into a native Electron window:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { RenderWindow } from '@renderizer/vue'

const open = ref(false)
</script>

<template>
  <RenderWindow
    v-model:open="open"
    window-id="inspector"
    config-id="inspector"
  >
    <InspectorPanel />
  </RenderWindow>
</template>
```

## Electron Setup

In the Electron main process:

```ts
import { ipcMain } from 'electron'
import { RenderWindowManager } from '@renderizer/vue/electron'

const windows = new RenderWindowManager({
  preloadPath: '/absolute/path/to/preload.js',
})

windows.attachTo(mainWindow)

ipcMain.handle('renderizer-window-ready', (event, windowId: string) => {
  windows.show(event, windowId)
})

ipcMain.handle('renderizer-window-control', (event, windowId: string, action) => {
  windows.control(event, windowId, action)
})

ipcMain.handle('renderizer-window-state', (event, windowId: string) => {
  return windows.getState(event, windowId)
})
```

In the Electron preload:

```ts
import { exposeRenderizerBridge } from '@renderizer/vue/preload'

exposeRenderizerBridge()
```

## Example

The first official demo is a single-package Vue + Electron app:

```bash
npm run dev --workspace @renderizer/example-vue-electron-single
npm run dev:electron --workspace @renderizer/example-vue-electron-single
```

The demo opens a native inspector window from the same Vue runtime and syncs theme/style changes from the main window.

## Status

Renderizer is in alpha. The first milestone targets Vue apps that already use Electron. JavaScript and React adapters are planned after the Vue API is proven in real projects.
