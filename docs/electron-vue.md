# Electron + Vue Integration

## Main Process

```ts
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { RenderWindowManager } from '@renderizer/vue/electron'

let mainWindow: BrowserWindow
let windows: RenderWindowManager

function createMainWindow() {
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: '/absolute/path/to/preload.js',
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  windows = new RenderWindowManager({
    preloadPath: '/absolute/path/to/preload.js',
    appId: 'com.example.app',
    openExternal: (url) => shell.openExternal(url),
    defaultWindowOptions: {
      minWidth: 720,
      minHeight: 480,
    },
  })
  windows.attachTo(mainWindow)
}

ipcMain.handle('renderizer-window-ready', (event, windowId: string) => {
  windows.show(event, windowId)
})

ipcMain.handle('renderizer-window-control', (event, windowId: string, action) => {
  windows.control(event, windowId, action)
})

ipcMain.handle('renderizer-window-state', (event, windowId: string) => {
  return windows.getState(event, windowId)
})

app.on('before-quit', () => windows?.closeAll())
```

## Preload

```ts
import { exposeRenderizerBridge } from '@renderizer/vue/preload'

exposeRenderizerBridge()
```

## Vue

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { RenderWindow } from '@renderizer/vue'

const open = ref(false)
</script>

<template>
  <button @click="open = true">Open Inspector</button>

  <RenderWindow
    v-model:open="open"
    window-id="inspector"
    config-id="inspector"
  >
    <template #default="{ control, isMaximized }">
      <header>
        <button @click="control('minimize')">Minimize</button>
        <button @click="control('toggle-maximize')">
          {{ isMaximized ? 'Restore' : 'Maximize' }}
        </button>
        <button @click="control('close')">Close</button>
      </header>
      <main>
        Your real Vue component tree goes here.
      </main>
    </template>
  </RenderWindow>
</template>
```

## Design Notes

The child window receives a blank document. The core runtime copies stylesheet links and style tags, syncs selected root document attributes, and provides a mount target. Framework adapters decide how to render into that target.

Vue uses `Teleport`. React should use `createPortal`. Pure JavaScript can append DOM directly to the returned target.
