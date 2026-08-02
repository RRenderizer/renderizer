#!/usr/bin/env node
import { cancel, confirm, intro, isCancel, outro, select, spinner, text } from '@clack/prompts'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

type Adapter = 'js' | 'vue' | 'react'
type ConfigFormat = 'ts' | 'js'
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

async function main(): Promise<void> {
  intro('Renderizer')

  const defaultRoot = process.cwd()
  const projectRootInput = cancelIfNeeded(await text({
    message: 'Where is your project root?',
    placeholder: '.',
    defaultValue: '.',
  }))
  const projectRoot = resolveProjectRoot(String(projectRootInput), defaultRoot)
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
