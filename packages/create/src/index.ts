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
      width: 1180,
      height: 780,
      popup: true,
    },
    presets: [
      {
        id: 'todos',
        title: 'Renderizer Todos',
        width: 940,
        height: 680,
        popup: true,
        minWidth: 720,
        minHeight: 480,
        frame: true,
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

function vueAppSource(language: ScriptLanguage): string {
  return `<script setup${language === 'ts' ? ' lang="ts"' : ''}>
import { computed, ref } from 'vue'
import { RenderWindow } from '@renderizer/vue'
import RenderizerLogo from './assets/renderizer_logo.svg?raw'
import VueLogo from './assets/vue-js.svg?raw'

const open = ref(false)
const theme = ref${language === 'ts' ? "<'dark' | 'light'>" : ''}('light')
const newTodo = ref('')
const todos = ref([
  { id: 1, text: 'Open a native Electron window', done: true },
  { id: 2, text: 'Share Vue state between windows', done: false },
  { id: 3, text: 'Toggle the theme live', done: false },
])
const remainingTodos = computed(() => todos.value.filter((todo) => !todo.done).length)

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme.value
}

function addTodo() {
  const text = newTodo.value.trim()
  if (!text) return
  todos.value.push({ id: Date.now(), text, done: false })
  newTodo.value = ''
}

function removeTodo(id${language === 'ts' ? ': number' : ''}) {
  todos.value = todos.value.filter((todo) => todo.id !== id)
}
</script>

<template>
  <main class="renderizer-demo">
    <section class="hero">
      <div class="brand-lockup" aria-label="Renderizer plus Vue">
        <span class="brand-mark brand-mark--renderizer" v-html="RenderizerLogo" />
        <span class="brand-plus">+</span>
        <span class="brand-mark brand-mark--vue" v-html="VueLogo" />
      </div>
      <h1>Render Vue interfaces across native Electron windows.</h1>
      <div class="actions">
        <button type="button" @click="open = true">Open Todo Window</button>
        <button type="button" class="secondary" @click="toggleTheme">Toggle Theme</button>
      </div>
      <p class="status">{{ remainingTodos }} tasks left in shared memory</p>
    </section>
  </main>

  <RenderWindow
    v-model:open="open"
    window-id="renderizer-todos"
    config-id="todos"
    fallback="none"
  >
    <section class="todo-window">
      <div class="todo-header">
        <span>Renderizer Todos</span>
        <strong>{{ remainingTodos }} left</strong>
      </div>
      <form class="todo-form" @submit.prevent="addTodo">
        <input v-model="newTodo" placeholder="Add a task shared by both windows" />
        <button type="submit">Add</button>
      </form>
      <ul class="todo-list">
        <li v-for="todo in todos" :key="todo.id" class="todo-card" :class="{ 'is-done': todo.done }">
          <label>
            <input v-model="todo.done" type="checkbox" />
            <span>{{ todo.text }}</span>
          </label>
          <button type="button" class="icon-button" @click="removeTodo(todo.id)">Remove</button>
        </li>
      </ul>
    </section>
  </RenderWindow>
</template>
`
}

function vueStyleSource(): string {
  return `:root {
  color: #262422;
  background: #FEF9F4;
  font-family: "Aptos", "Segoe UI", sans-serif;
  color-scheme: light;
}

:root[data-theme="dark"] {
  color: #FEF9F4;
  background: #262422;
  color-scheme: dark;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: #FEF9F4;
  color: inherit;
}

:root[data-theme="dark"] body {
  background: #262422;
}

button {
  min-height: 48px;
  padding: 0 18px;
  border: 1px solid #262422;
  border-radius: 0;
  background: #262422;
  color: #FEF9F4;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

:root[data-theme="dark"] button {
  border-color: #FEF9F4;
  background: #FEF9F4;
  color: #262422;
}

button.secondary {
  background: transparent;
  color: #262422;
}

:root[data-theme="dark"] button.secondary {
  background: transparent;
  color: #FEF9F4;
}

.renderizer-demo {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 32px;
}

.hero {
  display: grid;
  gap: 28px;
  width: min(860px, 100%);
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: clamp(18px, 4vw, 34px);
}

.brand-mark {
  display: grid;
  place-items: center;
  width: clamp(92px, 18vw, 164px);
  aspect-ratio: 1;
}

.brand-mark svg {
  display: block;
  width: 100%;
  height: 100%;
}

.brand-mark--renderizer svg path {
  fill: #262422;
}

:root[data-theme="dark"] .brand-mark--renderizer svg path {
  fill: #FEF9F4;
}

.brand-plus {
  font-size: clamp(42px, 8vw, 84px);
  font-weight: 900;
  line-height: 1;
}

h1 {
  margin: 0;
  max-width: 780px;
  font-size: clamp(44px, 8vw, 88px);
  line-height: 0.96;
  letter-spacing: -0.06em;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.status {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.todo-window {
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 16px;
  width: 100vw;
  height: 100vh;
  box-sizing: border-box;
  padding: 24px;
  background: inherit;
  color: inherit;
}

.todo-header,
.todo-form,
.todo-card {
  border: 1px solid currentColor;
  background: transparent;
}

.todo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64px;
  padding: 0 20px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.todo-form {
  display: grid;
  grid-template-columns: 1fr auto;
}

.todo-form input {
  min-width: 0;
  border: 0;
  border-right: 1px solid currentColor;
  background: transparent;
  color: inherit;
  padding: 0 18px;
  font: inherit;
  outline: none;
}

.todo-form input::placeholder {
  color: color-mix(in srgb, currentColor 52%, transparent);
}

.todo-list {
  display: grid;
  gap: 12px;
  align-content: start;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: auto;
}

.todo-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 64px;
  padding: 0 14px 0 18px;
}

.todo-card label {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  font-weight: 800;
}

.todo-card input {
  width: 18px;
  height: 18px;
  accent-color: currentColor;
}

.todo-card.is-done span {
  text-decoration: line-through;
  opacity: 0.58;
}

.icon-button {
  min-height: 36px;
  padding: 0 10px;
  background: transparent;
  color: inherit;
}

@media (max-width: 640px) {
  .todo-form {
    grid-template-columns: 1fr;
  }

  .todo-form input {
    min-height: 48px;
    border-right: 0;
    border-bottom: 1px solid currentColor;
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
  return `import { app, BrowserWindow, ipcMain, shell } from 'electron'
${typeImport}import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RenderWindowManager } from '@renderizer/vue/electron'
import renderizerConfig from '${configImport}'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rendererUrl = process.env.RENDERIZER_EXAMPLE_URL ?? 'http://127.0.0.1:5173'

${variableTypes}

function defaultRenderWindowOptions()${returnType} {
  const options${optionsType} = {
    backgroundColor: '#10141c',
  }
  const width = renderizerConfig.windows?.default?.width
  const height = renderizerConfig.windows?.default?.height
  if (width !== undefined) options.width = width
  if (height !== undefined) options.height = height
  return options
}

function createMainWindow()${functionReturn} {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#10141c',
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
      '@renderizer/vue': '^0.1.0-alpha.4',
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
