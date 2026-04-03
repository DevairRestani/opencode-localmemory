import { existsSync, readdirSync, readFileSync, renameSync } from 'fs'
import { join } from 'path'
import { getUserMemoryDir, getBaseDir } from './storage/paths.js'
import { createMemory } from './storage/MemoryFile.js'
import { rebuildIndex } from './storage/MemoryIndex.js'

interface LegacyMemory {
  id: string
  content: string
  type: string
  scope: string
  createdAt: string
  updatedAt: string
  tags: string[]
}

interface LegacyStore {
  version: number
  memories: LegacyMemory[]
}

function mapLegacyType(type: string): 'user' | 'feedback' | 'project' | 'reference' {
  const mapping: Record<string, 'user' | 'feedback' | 'project' | 'reference'> = {
    preference: 'user',
    'project-config': 'project',
    architecture: 'project',
    'error-solution': 'reference',
    'learned-pattern': 'feedback',
    conversation: 'reference',
    general: 'reference',
  }
  return mapping[type] || 'reference'
}

function findLegacyStores(baseDir: string): string[] {
  if (!existsSync(baseDir)) return []
  return readdirSync(baseDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(baseDir, f))
}

export function needsMigration(): boolean {
  const stores = findLegacyStores(getBaseDir())
  return stores.length > 0
}

export function migrateFromJSON(): number {
  const baseDir = getBaseDir()
  const stores = findLegacyStores(baseDir)
  let total = 0

  for (const storePath of stores) {
    try {
      const raw = readFileSync(storePath, 'utf-8')
      const store: LegacyStore = JSON.parse(raw)
      if (!store.memories || !Array.isArray(store.memories)) continue

      const isUserScope = storePath.includes('user_')
      const memoryDir = getUserMemoryDir()

      for (const mem of store.memories) {
        try {
          const type = mapLegacyType(mem.type)
          const name = mem.content.slice(0, 40).replace(/[^\w\s]/g, '').replace(/\s+/g, '_').slice(0, 30)

          if (isUserScope || mem.scope === 'user') {
            createMemory(memoryDir, name, type, mem.content, mem.tags)
          }
          total++
        } catch {}
      }

      const backupPath = storePath + '.bak'
      if (!existsSync(backupPath)) {
        renameSync(storePath, backupPath)
      }
    } catch {}
  }

  const userDir = getUserMemoryDir()
  rebuildIndex(userDir)

  return total
}
