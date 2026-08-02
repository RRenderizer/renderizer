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

const adapterPackages: Record<Adapter, string | null> = {
  js: null,
  vue: '@renderizer/vue',
  react: null,
}

function resolvePackageManager(): PackageManager {
  const userAgent = process.env.npm_config_user_agent ?? ''
  if (userAgent.startsWith('pnpm')) return 'pnpm'
  if (userAgent.startsWith('yarn')) return 'yarn'
  return 'npm'
}

function installArgs(packageManager: PackageManager, packageName: string): string[] {
  if (packageManager === 'pnpm') return ['add', packageName]
  if (packageManager === 'yarn') return ['add', packageName]
  return ['install', packageName]
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

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        CI: 'true',
        npm_config_yes: 'true',
        npm_config_update_notifier: 'false',
      },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
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
import { ref } from 'vue'
import { RenderWindow } from '@renderizer/vue'

const open = ref(false)
const theme = ref${language === 'ts' ? "<'dark' | 'light'>" : ''}('dark')

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme.value
}
</script>

<template>
  <main class="renderizer-demo">
    <section class="hero">
      <p class="eyebrow">Renderizer</p>
      <h1>One Vue runtime. Multiple native windows.</h1>
      <p>
        Open a native Electron window rendered by the same Vue app, then toggle the theme
        to see document styles sync live.
      </p>
      <div class="actions">
        <button type="button" @click="open = true">Open Inspector</button>
        <button type="button" class="secondary" @click="toggleTheme">Toggle Theme</button>
      </div>
    </section>
  </main>

  <RenderWindow
    v-model:open="open"
    window-id="renderizer-inspector"
    config-id="inspector"
    fallback="none"
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
</template>
`
}

function vueStyleSource(): string {
  return `:root {
  color: #e8edf5;
  background: #10141c;
  font-family: "Aptos", "Segoe UI", sans-serif;
}

:root[data-theme="light"] {
  color: #18202d;
  background: #f4f7fb;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background:
    linear-gradient(135deg, rgba(45, 180, 145, 0.18), transparent 32rem),
    linear-gradient(315deg, rgba(80, 120, 255, 0.14), transparent 28rem),
    var(--page-bg, #10141c);
  color: inherit;
}

:root[data-theme="light"] body {
  --page-bg: #f4f7fb;
}

button {
  height: 40px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: #39d39f;
  color: #07120f;
  font-weight: 700;
  cursor: pointer;
}

button.secondary {
  background: transparent;
  color: inherit;
}

.renderizer-demo {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 32px;
}

.hero {
  width: min(760px, 100%);
}

.eyebrow {
  margin: 0 0 12px;
  color: #39d39f;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  max-width: 680px;
  font-size: clamp(42px, 8vw, 82px);
  line-height: 0.96;
}

.hero p:not(.eyebrow) {
  max-width: 620px;
  color: color-mix(in srgb, currentColor 72%, transparent);
  font-size: 18px;
  line-height: 1.65;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.inspector {
  display: grid;
  gap: 18px;
  width: 100vw;
  height: 100vh;
  box-sizing: border-box;
  padding: 28px;
  background: inherit;
  color: inherit;
}

.inspector header,
.inspector article {
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 6%, transparent);
}

.inspector header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 18px;
}

.inspector-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.inspector article {
  display: grid;
  gap: 8px;
  align-content: start;
  padding: 18px;
}

.inspector span {
  color: color-mix(in srgb, currentColor 62%, transparent);
  font-size: 13px;
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
      '@renderizer/vue': '^0.1.0-alpha.2',
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
`
}

async function createTemplateProject(projectRoot: string, language: ScriptLanguage): Promise<void> {
  const s = spinner()
  const projectName = path.basename(projectRoot)

  s.start('Writing Renderizer template')
  await mkdir(path.join(projectRoot, 'src'), { recursive: true })
  await mkdir(path.join(projectRoot, 'electron'), { recursive: true })
  await writeFile(path.join(projectRoot, 'package.json'), packageJsonSource(projectName, language), 'utf8')
  await writeFile(path.join(projectRoot, 'index.html'), indexHtmlSource(projectName, language), 'utf8')
  await writeFile(path.join(projectRoot, `vite.config.${language}`), viteConfigSource(language), 'utf8')
  s.stop('Created Renderizer template')

  s.start('Installing dependencies')
  await run('npm', ['install'], projectRoot)
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
    await run(packageManager, installArgs(packageManager, adapterPackage), installRoot)
    s.stop(`Installed ${adapterPackage} in ${relativePath(projectRoot, installRoot)}`)
  }

  outro('Renderizer is ready.')
}

main().catch((error: unknown) => {
  cancel(error instanceof Error ? error.message : 'Renderizer setup failed.')
  process.exit(1)
})
