import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const targets = [
  'packages/core/dist',
  'packages/vue/dist',
  'packages/create/dist',
]

await Promise.all(targets.map(async (target) => {
  const absoluteTarget = path.resolve(root, target)
  if (!absoluteTarget.startsWith(root + path.sep)) {
    throw new Error(`Refusing to remove path outside repository: ${absoluteTarget}`)
  }
  await rm(absoluteTarget, { recursive: true, force: true })
}))
