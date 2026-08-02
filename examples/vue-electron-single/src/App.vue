<script setup lang="ts">
import { ref } from 'vue'
import { RenderWindow } from '@renderizer/vue'

const open = ref(false)
const theme = ref<'dark' | 'light'>('dark')

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme.value
}
</script>

<template>
  <main class="app-shell">
    <section class="hero">
      <p class="eyebrow">Renderizer Vue Electron</p>
      <h1>One Vue runtime. Multiple native windows.</h1>
      <p>
        This demo renders the inspector into a separate Electron window while keeping the same Vue state,
        styles and theme.
      </p>
      <div class="actions">
        <button type="button" @click="open = true">Open Inspector</button>
        <button type="button" class="secondary" @click="toggleTheme">Toggle Theme</button>
      </div>
    </section>

    <RenderWindow
      v-model:open="open"
      window-id="example-inspector"
      config-id="inspector"
    >
      <section class="inspector">
        <header>
          <span>Render Window</span>
          <strong>{{ theme }} theme</strong>
        </header>
        <div class="inspector-grid">
          <article>
            <span>Runtime</span>
            <strong>Shared Vue tree</strong>
          </article>
          <article>
            <span>Document</span>
            <strong>Native Electron window</strong>
          </article>
          <article>
            <span>Theme sync</span>
            <strong>Live</strong>
          </article>
        </div>
      </section>
    </RenderWindow>
  </main>
</template>
