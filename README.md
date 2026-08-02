# Renderizer

Renderizer is a small framework for building lightweight multi-window Electron apps without booting a second frontend app per window.

It lets a single reactive UI runtime render into many native windows by opening trusted blank documents, preparing mount targets, syncing styles/themes, and letting framework adapters mount or teleport content into those targets.

## Packages

- `@renderizer/core`: framework-agnostic browser runtime for opening child documents and syncing document state.
- `@renderizer/js`: planned DOM-first adapter for vanilla JavaScript apps.
- `@renderizer/vue`: Vue components, composables, and optional Electron integration helpers.
- `@renderizer/react`: planned React components, hooks, and optional Electron integration helpers.
- `@renderizer/create`: CLI for adding Renderizer to existing projects.

## Why This Exists

Traditional Electron multi-window apps often spin up another renderer route or another frontend app instance for every window. That works, but it duplicates app bootstrap, state setup, network clients, caches, and memory.

Renderizer keeps the app state in one runtime and treats native windows as extra documents/surfaces.

## Vue Example

```vue
<script setup lang="ts">
import { TeleportWindow } from '@renderizer/vue'
</script>

<template>
  <TeleportWindow
    v-model:open="open"
    window-id="inspector"
    title="Inspector"
    :width="1200"
    :height="760"
  >
    <InspectorPanel />
  </TeleportWindow>
</template>
```

## Status

This project is being extracted from a working Fabric prototype. The first public milestone targets Vue apps that already use Electron, with pure JavaScript and React adapters following after the core API is stable.
