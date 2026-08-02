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

function configSource(adapter: Adapter): string {
  return `import { defineRenderizerConfig } from '@renderizer/${adapter}'

export default defineRenderizerConfig({
  adapter: '${adapter}',
  electron: {
    bridgeName: 'renderizer',
    framePrefix: 'renderizer',
  },
  windows: {
    defaultFeatures: {
      width: 1180,
      height: 780,
      popup: true,
    },
  },
})
`
}

async function main(): Promise<void> {
  intro('Renderizer')

  const defaultRoot = process.cwd()
  const projectRootInput = cancelIfNeeded(await text({
    message: 'Where is your project root?',
    placeholder: defaultRoot,
    defaultValue: defaultRoot,
  }))
  const projectRoot = path.resolve(String(projectRootInput || defaultRoot))
  const packageName = await readPackageName(projectRoot)

  const adapter = cancelIfNeeded(await select<Adapter>({
    message: packageName ? `Add Renderizer to ${packageName} using which adapter?` : 'Which adapter should Renderizer install?',
    options: [
      { value: 'vue', label: '@renderizer/vue', hint: 'Vue Teleport adapter' },
      { value: 'js', label: '@renderizer/js', hint: 'planned vanilla DOM adapter' },
      { value: 'react', label: '@renderizer/react', hint: 'planned React portal adapter' },
    ],
  }))

  const configFormat = cancelIfNeeded(await select<ConfigFormat>({
    message: 'Create which config file?',
    options: [
      { value: 'ts', label: 'renderizer.config.ts' },
      { value: 'js', label: 'renderizer.config.js' },
    ],
  }))

  const adapterPackage = adapterPackages[adapter]
  const shouldInstall = adapterPackage
    ? cancelIfNeeded(await confirm({
        message: `Install ${adapterPackage} now?`,
        initialValue: true,
      }))
    : false

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
  await writeFile(configPath, configSource(adapter), 'utf8')
  s.stop(`Created ${path.basename(configPath)}`)

  if (shouldInstall) {
    const packageManager = resolvePackageManager()
    const installPackage = adapterPackage
    if (!installPackage) return
    s.start(`Installing ${installPackage}`)
    await run(packageManager, installArgs(packageManager, installPackage), projectRoot)
    s.stop(`Installed ${installPackage}`)
  }

  outro('Renderizer is ready.')
}

main().catch((error: unknown) => {
  cancel(error instanceof Error ? error.message : 'Renderizer setup failed.')
  process.exit(1)
})
