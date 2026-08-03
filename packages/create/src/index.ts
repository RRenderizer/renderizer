#!/usr/bin/env node
import { cancel, confirm, intro, isCancel, outro, select, spinner, text } from '@clack/prompts'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

type Adapter = 'js' | 'vue' | 'react'
type ConfigFormat = 'ts' | 'js'
type CliMode = 'existing' | 'template'
type ScriptLanguage = 'ts' | 'js'
type PackageManager = 'npm' | 'pnpm' | 'yarn'
interface RunOptions {
  silent?: boolean
}

const adapterPackages: Record<Adapter, string | null> = {
  js: null,
  vue: '@renderizer/vue',
  react: null,
}

const renderizerLogoSvg = `<svg width="441" height="392" viewBox="0 0 441 392" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#filter0_d_2_12)">
<path d="M272.007 342.204C239.827 376.424 189.547 387.234 146.567 367.104C134.037 361.234 122.777 353.264 112.927 343.414L40.9569 271.454C21.0269 251.524 11.2768 223.334 10.1068 195.444C8.75685 163.174 20.2468 131.864 41.9068 108.344C68.9368 79.0042 108.707 65.0642 147.947 71.5742C153.137 60.6742 159.207 51.2542 166.847 42.7242C207.427 -2.56577 278.217 -6.97576 323.007 35.1342L397.087 108.434C417.857 128.984 428.427 157.974 430.407 186.744C434.557 247.144 395.127 303.554 335.817 317.764C320.467 321.444 305.077 321.544 289.307 318.974C284.327 327.404 278.717 335.064 272.007 342.194V342.204ZM172.247 333.084C202.337 341.804 234.267 329.184 250.507 303.114C243.617 298.494 237.137 294.214 231.367 288.514L173.927 231.724L126.227 231.624C111.987 231.594 99.4168 223.824 92.1968 212.794C84.0468 200.334 83.2169 185.224 89.2269 172.004C95.2369 158.774 107.497 150.054 121.667 148.034C136.557 145.904 149.737 151.614 160.147 161.914L215.037 216.294L256.847 257.544C286.857 285.694 333.097 285.414 363.167 258.014C398.127 226.164 400.367 170.864 367.357 136.424L333.347 102.834L299.977 69.7642C287.027 56.9242 270.687 49.1842 252.357 48.3642C224.987 47.1342 199.527 61.7542 186.557 86.1742C193.437 90.5942 200.267 94.7342 206.147 100.534L259.467 153.104L313.457 153.354C328.057 153.424 341.297 161.774 348.707 174.104C360.187 193.234 355.657 217.814 338.397 231.864C321.507 245.614 296.087 245.054 280.277 229.464L183.597 134.174C165.617 116.454 141.157 107.914 116.027 112.044C95.3968 115.434 76.9468 126.544 64.8568 143.724C56.0568 156.234 50.5568 170.424 49.7468 185.914C48.6368 207.144 55.7569 228.734 70.4569 244.284L107.197 280.784L139.337 312.714C148.707 322.024 159.217 329.324 172.237 333.094L172.247 333.084Z" fill="#262422"/>
</g>
<defs>
<filter id="filter0_d_2_12" x="0" y="0" width="440.706" height="391.203" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="4"/>
<feGaussianBlur stdDeviation="5"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_2_12"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_2_12" result="shape"/>
</filter>
</defs>
</svg>
`

const vueLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 10 128 110">
  <path fill="#42b883" d="M78.8,10L64,35.4L49.2,10H0l64,110l64-110C128,10,78.8,10,78.8,10z"/>
  <path fill="#35495e" d="M78.8,10L64,35.4L49.2,10H25.6L64,76l38.4-66H78.8z"/>
</svg>
`

function resolvePackageManager(): PackageManager {
  const userAgent = process.env.npm_config_user_agent ?? ''
  if (userAgent.startsWith('pnpm')) return 'pnpm'
  if (userAgent.startsWith('yarn')) return 'yarn'
  return 'npm'
}

function installArgs(packageManager: PackageManager, packageName: string): string[] {
  if (packageManager === 'pnpm') return ['add', packageName]
  if (packageManager === 'yarn') return ['add', packageName]
  return ['install', packageName, '--silent', '--no-audit', '--no-fund']
}

function resolveProjectRoot(input: string, cwd: string): string {
  const normalizedInput = input.trim()
  if (!normalizedInput || normalizedInput === '.' || normalizedInput === './' || normalizedInput === '/') {
    return cwd
  }
  return path.resolve(cwd, normalizedInput)
}

function relativePath(from: string, to: string): string {
  const relative = path.relative(from, to).replaceAll(path.sep, '/')
  return relative ? `./${relative}` : '.'
}

function run(command: string, args: string[], cwd: string, options: RunOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = ''
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        CI: 'true',
        npm_config_yes: 'true',
        npm_config_update_notifier: 'false',
      },
      stdio: options.silent ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: process.platform === 'win32',
    })
    if (options.silent) {
      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString()
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        output += chunk.toString()
      })
    }
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else {
        const details = output.trim()
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}${details ? `\n${details}` : ''}`))
      }
    })
  })
}

function cancelIfNeeded<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('Renderizer setup cancelled.')
    process.exit(0)
  }
  return value
}

async function readPackageName(projectRoot: string): Promise<string | null> {
  const packagePath = path.join(projectRoot, 'package.json')
  if (!existsSync(packagePath)) return null
  try {
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as { name?: unknown }
    return typeof packageJson.name === 'string' ? packageJson.name : null
  } catch {
    return null
  }
}

function configSource(adapter: Adapter, paths: { renderer: string; electron: string }): string {
  return `import { defineRenderizerConfig } from '@renderizer/${adapter}'

export default defineRenderizerConfig({
  adapter: '${adapter}',
  paths: {
    renderer: '${paths.renderer}',
    electron: '${paths.electron}',
  },
  windows: {
    default: {
      width: 1020,
      height: 720,
      popup: true,
      frame: true,
      autoHideMenuBar: true,
      backgroundColor: '#FEF9F4',
    },
    presets: [
      {
        id: 'timeline',
        title: 'Renderizer Timeline',
        width: 660,
        height: 620,
        popup: true,
        minWidth: 520,
        minHeight: 440,
        frame: true,
        autoHideMenuBar: true,
        backgroundColor: '#FEF9F4',
      },
      {
        id: 'focus',
        title: 'Renderizer Focus',
        width: 620,
        height: 620,
        popup: true,
        minWidth: 520,
        minHeight: 440,
        frame: true,
        autoHideMenuBar: true,
        backgroundColor: '#FEF9F4',
      },
    ],
  },
})
`
}

function vueMainSource(language: ScriptLanguage): string {
  const appImport = language === 'ts' ? "import App from './App.vue'" : "import App from './App.vue'"
  return `import { createApp } from 'vue'
import { createRenderizer } from '@renderizer/vue'
${appImport}
import renderizerConfig from '../renderizer.config'
import './style.css'

createApp(App)
  .use(createRenderizer(renderizerConfig))
  .mount('#app')
`
}

function vueAppSource(_language: ScriptLanguage): string {
  return `<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { RenderWindow } from '@renderizer/vue'
import RenderizerLogo from './assets/renderizer_logo.svg?raw'
import VueLogo from './assets/vue-js.svg?raw'

const lanes = [
  { id: 'backlog', title: 'Backlog', hint: 'Ideas waiting for a window' },
  { id: 'active', title: 'Active', hint: 'Moving through shared state' },
  { id: 'review', title: 'Review', hint: 'Ready for the final cut' },
]

const cards = ref([
  { id: 1, title: 'Record CLI setup flow', owner: 'Andre', priority: 'High', lane: 'backlog' },
  { id: 2, title: 'Show shared state across windows', owner: 'Renderizer', priority: 'High', lane: 'active' },
  { id: 3, title: 'Polish blocky landing section', owner: 'Design', priority: 'Medium', lane: 'active' },
  { id: 4, title: 'Cut LinkedIn teaser video', owner: 'Launch', priority: 'Low', lane: 'review' },
])

const events = ref([
  { id: 1, label: 'Command room online', detail: 'Three Electron windows share one Vue runtime.', time: '00:00' },
])

const selectedCardId = ref(2)
const timelineOpen = ref(false)
const focusOpen = ref(false)
const theme = ref('light')
const draggingCardId = ref(null)
const dropLaneId = ref(null)
const dragPreview = ref({ x: 0, y: 0, speed: 0 })
let lastPointer = { x: 0, y: 0, time: 0 }
let didDrag = false
let dragFrame = 0
let pendingPointer = null

const selectedCard = computed(() => cards.value.find((card) => card.id === selectedCardId.value) ?? cards.value[0])
const completedCount = computed(() => cards.value.filter((card) => card.lane === 'review').length)
const draggingCard = computed(() => cards.value.find((card) => card.id === draggingCardId.value) ?? null)
const dragPreviewStyle = computed(() => ({
  '--drag-speed': dragPreview.value.speed.toFixed(3),
  transform: \`translate3d(\${dragPreview.value.x}px, \${dragPreview.value.y}px, 0)\`,
}))

function laneCards(lane) {
  return cards.value.filter((card) => card.lane === lane)
}

function eventTime() {
  return new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })
}

function pushEvent(label, detail) {
  events.value.unshift({ id: Date.now(), label, detail, time: eventTime() })
  events.value = events.value.slice(0, 8)
}

function selectCard(card) {
  selectedCardId.value = card.id
  pushEvent('Card focused', \`\${card.title} is now visible in the Focus Window.\`)
}

function moveCard(card, lane) {
  if (card.lane === lane) return
  card.lane = lane
  selectedCardId.value = card.id
  pushEvent('Card moved', \`\${card.title} moved to \${lanes.find((item) => item.id === lane)?.title}.\`)
}

function laneFromPoint(x, y) {
  const element = document.elementFromPoint(x, y)?.closest('[data-lane-id]')
  const lane = element?.dataset.laneId
  return lane === 'backlog' || lane === 'active' || lane === 'review' ? lane : null
}

function updateDragPreview(x, y) {
  const now = performance.now()
  const elapsed = Math.max(now - lastPointer.time, 16)
  const dx = x - lastPointer.x
  const dy = y - lastPointer.y
  const speed = Math.min(Math.hypot(dx, dy) / elapsed, 2.4)
  dragPreview.value = { x: x + 18, y: y + 18, speed }
  lastPointer = { x, y, time: now }
  dropLaneId.value = laneFromPoint(x, y)
}

function scheduleDragPreview(event) {
  pendingPointer = { x: event.clientX, y: event.clientY }
  if (dragFrame) return
  dragFrame = window.requestAnimationFrame(() => {
    dragFrame = 0
    if (!pendingPointer) return
    updateDragPreview(pendingPointer.x, pendingPointer.y)
    pendingPointer = null
  })
}

function onDragMove(event) {
  if (!draggingCard.value) return
  event.preventDefault()
  didDrag = true
  scheduleDragPreview(event)
}

function onDragEnd(event) {
  if (!draggingCard.value) return
  event.preventDefault()
  if (dragFrame) {
    window.cancelAnimationFrame(dragFrame)
    dragFrame = 0
  }
  pendingPointer = null
  const targetLane = laneFromPoint(event.clientX, event.clientY) ?? dropLaneId.value
  if (targetLane) moveCard(draggingCard.value, targetLane)
  draggingCardId.value = null
  dropLaneId.value = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
  setTimeout(() => {
    didDrag = false
  }, 0)
}

function startDrag(card, event) {
  if (event.button !== 0) return
  event.preventDefault()
  selectedCardId.value = card.id
  draggingCardId.value = card.id
  dropLaneId.value = card.lane
  lastPointer = { x: event.clientX, y: event.clientY, time: performance.now() }
  dragPreview.value = { x: event.clientX + 18, y: event.clientY + 18, speed: 0 }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

function handleCardClick(card) {
  if (didDrag) return
  selectCard(card)
}

function updateSelectedTitle(value) {
  if (!selectedCard.value) return
  selectedCard.value.title = value
  pushEvent('Title edited', 'Focus Window changed the selected card title.')
}

function updateSelectedOwner(value) {
  if (!selectedCard.value) return
  selectedCard.value.owner = value
  pushEvent('Owner edited', \`\${selectedCard.value.title} owner is now \${value}.\`)
}

function cyclePriority() {
  if (!selectedCard.value) return
  const next = selectedCard.value.priority === 'High' ? 'Medium' : selectedCard.value.priority === 'Medium' ? 'Low' : 'High'
  selectedCard.value.priority = next
  pushEvent('Priority changed', \`\${selectedCard.value.title} is now \${next} priority.\`)
}

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme.value
}

onBeforeUnmount(() => {
  if (dragFrame) window.cancelAnimationFrame(dragFrame)
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
})
</script>

<template>
  <main class="command-room">
    <header class="hero">
      <div class="brand-lockup" aria-label="Renderizer plus Vue">
        <span class="brand-mark brand-mark--renderizer" v-html="RenderizerLogo" />
        <span class="brand-plus" aria-hidden="true">♥</span>
        <span class="brand-mark brand-mark--vue" v-html="VueLogo" />
      </div>
      <div class="hero-actions">
        <button type="button" @click="timelineOpen = true">Open Timeline</button>
        <button type="button" @click="focusOpen = true">Open Focus</button>
        <button type="button" class="secondary" @click="toggleTheme">Toggle Theme</button>
      </div>
    </header>

    <section class="stats-grid" aria-label="Shared state counters">
      <article class="stat-card">
        <span>Total Cards</span>
        <strong>{{ cards.length }}</strong>
      </article>
      <article class="stat-card">
        <span>In Review</span>
        <strong>{{ completedCount }}</strong>
      </article>
      <article class="stat-card">
        <span>Selected</span>
        <strong>{{ selectedCard?.priority }}</strong>
      </article>
    </section>

    <section class="board" aria-label="Kanban board">
      <article
        v-for="lane in lanes"
        :key="lane.id"
        class="lane"
        :class="{ 'is-drop-target': dropLaneId === lane.id }"
        :data-lane-id="lane.id"
      >
        <header>
          <div>
            <span>{{ lane.title }}</span>
            <p>{{ lane.hint }}</p>
          </div>
          <strong>{{ laneCards(lane.id).length }}</strong>
        </header>

        <TransitionGroup name="card-flow" tag="div" class="card-stack">
          <button
            v-for="card in laneCards(lane.id)"
            :key="card.id"
            type="button"
            class="kanban-card"
            :class="{
              'is-selected': selectedCardId === card.id,
              'is-dragging': draggingCardId === card.id,
            }"
            @click="handleCardClick(card)"
            @pointerdown="startDrag(card, $event)"
          >
            <span>{{ card.priority }}</span>
            <strong>{{ card.title }}</strong>
            <small>{{ card.owner }}</small>
          </button>
        </TransitionGroup>
      </article>
    </section>

    <div v-if="draggingCard" class="drag-preview" :style="dragPreviewStyle">
      <span>{{ draggingCard.priority }}</span>
      <strong>{{ draggingCard.title }}</strong>
      <small>{{ draggingCard.owner }}</small>
    </div>
  </main>

  <RenderWindow
    v-model:open="timelineOpen"
    window-id="renderizer-timeline"
    config-id="timeline"
    fallback="none"
  >
    <section class="timeline-window">
      <header class="window-header">
        <span>Live Timeline</span>
        <strong>{{ events.length }} events</strong>
      </header>
      <TransitionGroup name="timeline-flow" tag="ul" class="timeline-list">
        <li v-for="event in events" :key="event.id" class="timeline-event">
          <span>{{ event.time }}</span>
          <div>
            <strong>{{ event.label }}</strong>
            <p>{{ event.detail }}</p>
          </div>
        </li>
      </TransitionGroup>
    </section>
  </RenderWindow>

  <RenderWindow
    v-model:open="focusOpen"
    window-id="renderizer-focus"
    config-id="focus"
    fallback="none"
  >
    <section v-if="selectedCard" class="focus-window">
      <header class="window-header">
        <span>Focus Window</span>
        <strong>{{ selectedCard.priority }}</strong>
      </header>
      <label class="field-block">
        <span>Title</span>
        <textarea :value="selectedCard.title" @input="updateSelectedTitle($event.target.value)" />
      </label>
      <label class="field-block">
        <span>Owner</span>
        <input :value="selectedCard.owner" @input="updateSelectedOwner($event.target.value)" />
      </label>
      <div class="focus-actions">
        <button type="button" @click="cyclePriority">Cycle Priority</button>
        <button type="button" class="secondary" @click="moveCard(selectedCard, 'review')">Send To Review</button>
      </div>
    </section>
  </RenderWindow>
</template>
`
}

function vueStyleSource(): string {
  return `@import url("https://fonts.googleapis.com/css2?family=Instrument+Sans:wdth,wght@75..100,400..700&display=swap");

:root {
  --cream: #FEF9F4;
  --ink: #262422;
  --surface: #FEF9F4;
  --muted: #77716B;
  --line: rgba(38, 36, 34, 0.18);
  --hot: #FF5B36;
  --yellow: #F2D34F;
  --shadow: #000;
  --hard-shadow: 5px 5px 0 var(--shadow);
  --card-shadow: 6px 6px 0 var(--shadow);
  color: var(--ink);
  background: var(--cream);
  font-family: "Instrument Sans", "Aptos", "Segoe UI", sans-serif;
  color-scheme: light;
}

:root[data-theme="dark"] {
  --cream: #211F1D;
  --ink: #FEF9F4;
  --surface: #2C2926;
  --muted: #C7BFB7;
  --line: rgba(254, 249, 244, 0.16);
  --hot: #F2D34F;
  --yellow: #FF5B36;
  --shadow: rgba(0, 0, 0, 0.42);
  --hard-shadow: 4px 4px 0 var(--shadow);
  --card-shadow: 4px 4px 0 var(--shadow);
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  overflow: hidden;
  background: var(--cream);
  color: var(--ink);
  user-select: none;
}

button,
input,
textarea {
  font: inherit;
}

button {
  min-height: 50px;
  padding: 0 19px;
  border: 2px solid var(--ink);
  border-radius: 0;
  background: var(--hot);
  color: #262422;
  box-shadow: var(--hard-shadow);
  cursor: pointer;
  font-weight: 650;
  text-transform: uppercase;
  transition: transform 160ms ease, box-shadow 160ms ease;
}

button:hover:not(:disabled) {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0 var(--shadow);
}

button.secondary {
  background: var(--yellow);
}

.command-room {
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 18px;
  width: 100vw;
  height: 100vh;
  padding: 24px;
  overflow: hidden;
  background: var(--cream);
}

.hero {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 28px;
  align-items: center;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: clamp(14px, 3vw, 24px);
}

.brand-mark {
  display: grid;
  place-items: center;
  width: clamp(76px, 10vw, 112px);
  aspect-ratio: 1;
}

.brand-mark svg {
  display: block;
  width: 100%;
  height: 100%;
}

.brand-mark--renderizer svg path {
  fill: var(--ink);
}

.brand-plus {
  color: var(--hot);
  font-size: clamp(34px, 5vw, 58px);
  font-weight: 700;
  line-height: 1;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.stat-card,
.lane,
.window-header,
.timeline-event,
.field-block {
  border: 2px solid var(--ink);
  border-radius: 0;
  background: transparent;
}

.stat-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 74px;
  padding: 0 20px;
  box-shadow: var(--hard-shadow);
}

.stat-card span,
.window-header span,
.field-block span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.stat-card strong {
  font-size: 32px;
  font-weight: 560;
  letter-spacing: -0.05em;
}

.board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  min-height: 0;
}

.lane {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 0;
  padding: 14px;
  background: var(--surface);
  box-shadow: var(--card-shadow);
  overflow: hidden;
  transition: background 180ms ease, box-shadow 180ms ease;
}

.lane.is-drop-target {
  background:
    linear-gradient(0deg, color-mix(in srgb, var(--yellow) 18%, transparent), color-mix(in srgb, var(--yellow) 18%, transparent)),
    var(--surface);
  box-shadow: 7px 7px 0 var(--shadow);
}

.lane > header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}

.lane > header span {
  font-size: 28px;
  font-weight: 560;
  letter-spacing: -0.045em;
}

.lane > header p {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 14px;
}

.lane > header strong {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 2px solid var(--ink);
  background: var(--yellow);
  color: #262422;
}

.card-stack {
  display: grid;
  align-content: start;
  gap: 14px;
  min-height: 0;
  padding: 12px 8px 8px 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
}

.kanban-card {
  display: grid;
  gap: 8px;
  width: 100%;
  min-height: 142px;
  padding: 14px;
  text-align: left;
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--card-shadow);
  text-transform: none;
  touch-action: none;
  cursor: grab;
}

.kanban-card.is-selected {
  background: var(--yellow);
  color: #262422;
}

.kanban-card.is-dragging {
  opacity: 0.38;
  transform: scale(0.985);
  box-shadow: none;
  cursor: grabbing;
}

.kanban-card > span {
  width: max-content;
  padding: 5px 8px;
  border: 2px solid currentColor;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.kanban-card > strong {
  max-width: 320px;
  font-size: 21px;
  font-weight: 560;
  line-height: 1;
  letter-spacing: -0.045em;
}

.kanban-card > small {
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.timeline-window,
.focus-window {
  display: grid;
  gap: 16px;
  width: 100vw;
  height: 100vh;
  padding: 22px;
  overflow: hidden;
  background: var(--cream);
  color: var(--ink);
}

.timeline-window {
  grid-template-rows: auto 1fr;
}

.focus-window {
  grid-template-rows: auto auto auto auto 1fr;
}

.window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 62px;
  padding: 0 18px;
}

.window-header strong {
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.03em;
}

.timeline-list {
  display: grid;
  align-content: start;
  gap: 12px;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.timeline-event {
  display: grid;
  grid-template-columns: 66px 1fr;
  gap: 14px;
  padding: 16px;
  box-shadow: 4px 4px 0 var(--shadow);
}

.timeline-event > span {
  color: var(--hot);
  font-size: 12px;
  font-weight: 650;
}

.timeline-event strong {
  font-size: 20px;
  font-weight: 560;
  letter-spacing: -0.04em;
}

.timeline-event p {
  margin: 6px 0 0;
  color: var(--muted);
  line-height: 1.35;
}

.field-block {
  display: grid;
  gap: 10px;
  padding: 16px;
  background: var(--surface);
  box-shadow: var(--hard-shadow);
}

.field-block input,
.field-block textarea {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  outline: none;
  font-size: 24px;
  font-weight: 560;
  letter-spacing: -0.045em;
}

.field-block textarea {
  min-height: 154px;
  resize: none;
}

.focus-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.card-flow-move,
.card-flow-enter-active,
.card-flow-leave-active,
.timeline-flow-move,
.timeline-flow-enter-active,
.timeline-flow-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}

.card-flow-enter-from,
.card-flow-leave-to,
.timeline-flow-enter-from,
.timeline-flow-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

.drag-preview {
  --drag-speed: 0;
  position: fixed;
  left: 0;
  top: 0;
  z-index: 50;
  display: grid;
  gap: 8px;
  width: 320px;
  min-height: 132px;
  padding: 14px;
  border: 2px solid var(--ink);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--hot) calc(var(--drag-speed) * 18%), transparent), transparent 58%),
    var(--yellow);
  color: #262422;
  box-shadow: calc(8px + var(--drag-speed) * 5px) calc(8px + var(--drag-speed) * 5px) 0 var(--shadow);
  pointer-events: none;
  backface-visibility: hidden;
  contain: layout paint;
  will-change: transform;
}

.drag-preview span {
  width: max-content;
  padding: 5px 8px;
  border: 2px solid currentColor;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.drag-preview strong {
  font-size: 22px;
  font-weight: 560;
  line-height: 1;
  letter-spacing: -0.045em;
}

.drag-preview small {
  color: rgba(38, 36, 34, 0.68);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

@media (max-width: 980px) {
  body {
    overflow: auto;
  }

  .command-room {
    height: auto;
    min-height: 100vh;
  }

  .hero,
  .board,
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .hero-actions {
    justify-content: start;
  }
}
`
}

function electronMainSource(language: ScriptLanguage): string {
  const configImport = '../renderizer.config.js'
  const typeImport = language === 'ts' ? "import type { BrowserWindowConstructorOptions } from 'electron'\n" : ''
  const returnType = language === 'ts' ? ': BrowserWindowConstructorOptions' : ''
  const optionsType = language === 'ts' ? ': BrowserWindowConstructorOptions' : ''
  const variableTypes = language === 'ts'
    ? 'let mainWindow: BrowserWindow | null = null\nlet renderWindows: RenderWindowManager | null = null'
    : 'let mainWindow = null\nlet renderWindows = null'
  const functionReturn = language === 'ts' ? ': void' : ''
  const ipcTypes = language === 'ts' ? ', windowId: string' : ', windowId'
  const actionTypes = language === 'ts' ? ', action' : ', action'
  return `import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
${typeImport}import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RenderWindowManager } from '@renderizer/vue/electron'
import renderizerConfig from '${configImport}'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rendererUrl = process.env.RENDERIZER_EXAMPLE_URL ?? 'http://127.0.0.1:5173'

${variableTypes}

function defaultRenderWindowOptions()${returnType} {
  const options${optionsType} = {
    backgroundColor: '#FEF9F4',
  }
  const width = renderizerConfig.windows?.default?.width
  const height = renderizerConfig.windows?.default?.height
  if (width !== undefined) options.width = width
  if (height !== undefined) options.height = height
  return options
}

function createMainWindow()${functionReturn} {
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 1020,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    autoHideMenuBar: true,
    backgroundColor: '#FEF9F4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.${language === 'ts' ? 'js' : 'js'}'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  renderWindows = new RenderWindowManager({
    preloadPath: path.join(__dirname, 'preload.js'),
    defaultWindowOptions: defaultRenderWindowOptions(),
    openExternal: (url) => shell.openExternal(url),
  })
  renderWindows.attachTo(mainWindow)

  void mainWindow.loadURL(rendererUrl)
}

ipcMain.handle('renderizer-window-ready', (event${ipcTypes}) => {
  renderWindows?.show(event, windowId)
})

ipcMain.handle('renderizer-window-control', (event${ipcTypes}${actionTypes}) => {
  renderWindows?.control(event, windowId, action)
})

ipcMain.handle('renderizer-window-state', (event${ipcTypes}) =>
  renderWindows?.getState(event, windowId) ?? { isMaximized: false, isFullScreen: false },
)

app.whenReady().then(createMainWindow)

app.on('before-quit', () => {
  renderWindows?.closeAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
})
`
}

function electronPreloadSource(): string {
  return `import { exposeRenderizerBridge } from '@renderizer/vue/preload'

exposeRenderizerBridge()
`
}

function electronTsConfigSource(): string {
  return `{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist-electron",
    "noEmit": false,
    "allowImportingTsExtensions": false,
    "types": ["node"]
  },
  "include": ["electron/**/*.ts", "renderizer.config.ts"]
}
`
}

function packageJsonSource(projectName: string, language: ScriptLanguage): string {
  const packageJson = {
    name: projectName,
    private: true,
    version: '0.0.0',
    type: 'module',
    main: language === 'ts' ? 'dist-electron/electron/main.js' : 'electron/main.js',
    scripts: {
      dev: 'vite --host 127.0.0.1',
      'dev:electron': language === 'ts'
        ? 'concurrently -k "vite --host 127.0.0.1" "npm run build:electron && wait-on http://127.0.0.1:5173 && electron ."'
        : 'concurrently -k "vite --host 127.0.0.1" "wait-on http://127.0.0.1:5173 && electron ."',
      build: language === 'ts' ? 'vite build && npm run build:electron' : 'vite build',
      ...(language === 'ts' ? { 'build:electron': 'tsc -p tsconfig.electron.json' } : {}),
      'type-check': language === 'ts' ? 'vue-tsc --noEmit && tsc -p tsconfig.electron.json --noEmit' : 'vite build',
    },
    dependencies: {
      '@renderizer/vue': '^0.1.0-alpha.6',
      '@vitejs/plugin-vue': '^6.0.1',
      vite: '^7.0.6',
      vue: '^3.5.18',
    },
    devDependencies: {
      concurrently: '^9.2.0',
      electron: '^43.2.0',
      'wait-on': '^8.0.3',
      ...(language === 'ts'
        ? {
            typescript: '^5.9.2',
            'vue-tsc': '^3.0.4',
          }
        : {}),
    },
  }
  return `${JSON.stringify(packageJson, null, 2)}\n`
}

function indexHtmlSource(projectName: string, language: ScriptLanguage): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.${language}"></script>
  </body>
</html>
`
}

function viteConfigSource(language: ScriptLanguage): string {
  return `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
})
`
}

function tsConfigSource(): string {
  return `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue", "renderizer.config.ts", "vite.config.ts"]
}
`
}

function vueShimSource(): string {
  return `declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

declare module '*.svg?raw' {
  const content: string
  export default content
}
`
}

async function createTemplateProject(projectRoot: string, language: ScriptLanguage): Promise<void> {
  const s = spinner()
  const projectName = path.basename(projectRoot)

  s.start('Writing Renderizer template')
  await mkdir(path.join(projectRoot, 'src'), { recursive: true })
  await mkdir(path.join(projectRoot, 'src', 'assets'), { recursive: true })
  await mkdir(path.join(projectRoot, 'electron'), { recursive: true })
  await writeFile(path.join(projectRoot, 'package.json'), packageJsonSource(projectName, language), 'utf8')
  await writeFile(path.join(projectRoot, 'index.html'), indexHtmlSource(projectName, language), 'utf8')
  await writeFile(path.join(projectRoot, `vite.config.${language}`), viteConfigSource(language), 'utf8')
  s.stop('Created Renderizer template')

  s.start('Installing dependencies')
  await run('npm', ['install', '--silent', '--no-audit', '--no-fund'], projectRoot, { silent: true })
  s.stop('Installed dependencies')

  const configFormat: ConfigFormat = language
  await writeFile(path.join(projectRoot, `renderizer.config.${configFormat}`), configSource('vue', {
    renderer: '.',
    electron: '.',
  }), 'utf8')
  await mkdir(path.join(projectRoot, 'electron'), { recursive: true })
  await writeFile(path.join(projectRoot, 'electron', `main.${language}`), electronMainSource(language), 'utf8')
  await writeFile(path.join(projectRoot, 'electron', `preload.${language}`), electronPreloadSource(), 'utf8')
  await writeFile(path.join(projectRoot, 'src', `main.${language}`), vueMainSource(language), 'utf8')
  await writeFile(path.join(projectRoot, 'src', 'App.vue'), vueAppSource(language), 'utf8')
  await writeFile(path.join(projectRoot, 'src', 'style.css'), vueStyleSource(), 'utf8')
  await writeFile(path.join(projectRoot, 'src', 'assets', 'renderizer_logo.svg'), renderizerLogoSvg, 'utf8')
  await writeFile(path.join(projectRoot, 'src', 'assets', 'vue-js.svg'), vueLogoSvg, 'utf8')
  if (language === 'ts') {
    await writeFile(path.join(projectRoot, 'tsconfig.electron.json'), electronTsConfigSource(), 'utf8')
    await writeFile(path.join(projectRoot, 'tsconfig.json'), tsConfigSource(), 'utf8')
    await writeFile(path.join(projectRoot, 'src', 'env.d.ts'), vueShimSource(), 'utf8')
  }
}

async function main(): Promise<void> {
  intro('Renderizer')

  const defaultRoot = process.cwd()
  const mode = cancelIfNeeded(await select<CliMode>({
    message: 'What do you want to do?',
    options: [
      { value: 'template', label: 'Create template project', hint: 'Vue + Vite + Electron + Renderizer' },
      { value: 'existing', label: 'Add to existing project', hint: 'Install and configure Renderizer' },
    ],
  }))

  const projectRootInput = cancelIfNeeded(await text({
    message: mode === 'template' ? 'Where should the template project be created?' : 'Where is your project root?',
    placeholder: '.',
    defaultValue: '.',
  }))
  const projectRoot = resolveProjectRoot(String(projectRootInput), defaultRoot)

  if (mode === 'template') {
    const language = cancelIfNeeded(await select<ScriptLanguage>({
      message: 'Use JavaScript or TypeScript?',
      options: [
        { value: 'ts', label: 'TypeScript' },
        { value: 'js', label: 'JavaScript' },
      ],
    }))
    if (existsSync(projectRoot)) {
      const overwrite = cancelIfNeeded(await confirm({
        message: `${projectRoot} already exists. Continue and let Vite handle it?`,
        initialValue: false,
      }))
      if (!overwrite) {
        outro('No files changed.')
        return
      }
    }
    await createTemplateProject(projectRoot, language)
    const shouldStart = cancelIfNeeded(await confirm({
      message: 'Start Renderizer now?',
      initialValue: true,
    }))
    if (shouldStart) {
      outro(`Starting Renderizer in ${projectRoot}.`)
      await run('npm', ['run', 'dev:electron'], projectRoot)
      return
    }
    outro('Renderizer template project is ready.')
    return
  }

  const packageName = await readPackageName(projectRoot)

  const adapter = cancelIfNeeded(await select<Adapter>({
    message: packageName ? `Add Renderizer to ${packageName} using which adapter?` : 'Which adapter should Renderizer install?',
    options: [
      { value: 'vue', label: '@renderizer/vue', hint: 'Vue Teleport adapter' },
      { value: 'js', label: '@renderizer/js', hint: 'coming soon' },
      { value: 'react', label: '@renderizer/react', hint: 'coming soon' },
    ],
  }))

  const rendererRootInput = cancelIfNeeded(await text({
    message: 'Where is your renderer app?',
    placeholder: '.',
    defaultValue: '.',
  }))
  const rendererRoot = resolveProjectRoot(String(rendererRootInput), projectRoot)

  const electronRootInput = cancelIfNeeded(await text({
    message: 'Where is your Electron app?',
    placeholder: '.',
    defaultValue: '.',
  }))
  const electronRoot = resolveProjectRoot(String(electronRootInput), projectRoot)

  const configFormat = cancelIfNeeded(await select<ConfigFormat>({
    message: 'Create which config file?',
    options: [
      { value: 'ts', label: 'renderizer.config.ts' },
      { value: 'js', label: 'renderizer.config.js' },
    ],
  }))

  const adapterPackage = adapterPackages[adapter]
  if (!adapterPackage) {
    cancel(`@renderizer/${adapter} is not published yet. Choose Vue for the current alpha.`)
    process.exit(1)
  }

  const configPath = path.join(projectRoot, `renderizer.config.${configFormat}`)
  if (existsSync(configPath)) {
    const overwrite = cancelIfNeeded(await confirm({
      message: `${path.basename(configPath)} already exists. Overwrite it?`,
      initialValue: false,
    }))
    if (!overwrite) {
      outro('No files changed.')
      return
    }
  }

  const s = spinner()
  s.start('Writing Renderizer config')
  await mkdir(projectRoot, { recursive: true })
  await writeFile(configPath, configSource(adapter, {
    renderer: relativePath(projectRoot, rendererRoot),
    electron: relativePath(projectRoot, electronRoot),
  }), 'utf8')
  s.stop(`Created ${path.basename(configPath)}`)

  const packageManager = resolvePackageManager()
  const installRoots = [...new Set([rendererRoot, electronRoot])]
  for (const installRoot of installRoots) {
    const packagePath = path.join(installRoot, 'package.json')
    if (!existsSync(packagePath)) {
      cancel(`No package.json found in ${installRoot}.`)
      process.exit(1)
    }
    s.start(`Installing ${adapterPackage} in ${relativePath(projectRoot, installRoot)}`)
    await run(packageManager, installArgs(packageManager, adapterPackage), installRoot, { silent: true })
    s.stop(`Installed ${adapterPackage} in ${relativePath(projectRoot, installRoot)}`)
  }

  outro('Renderizer is ready.')
}

main().catch((error: unknown) => {
  cancel(error instanceof Error ? error.message : 'Renderizer setup failed.')
  process.exit(1)
})
