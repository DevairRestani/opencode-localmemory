import { existsSync, readdirSync, statSync, readFileSync } from 'fs'
import { join } from 'path'
import type { MemoryHeader } from '../types.js'
import { MAX_MEMORY_FILES } from '../types.js'
import { parseFrontmatter } from './frontmatter.js'

export function scanMemoryFiles(memoryDir: string): MemoryHeader[] {
  if (!existsSync(memoryDir)) return []

  const files = readdirSync(memoryDir)
    .filter((f) => f.endsWith('.md') && f !== 'MEMORY.md')
    .map((f) => {
      const filePath = join(memoryDir, f)
      try {
        const stat = statSync(filePath)
        const content = readFileSync(filePath, 'utf-8')
        const parsed = parseFrontmatter(content)
        return {
          filename: f,
          filePath,
          mtimeMs: stat.mtimeMs,
          description: parsed?.frontmatter.description ?? null,
          type: parsed?.frontmatter.type,
        } satisfies MemoryHeader
      } catch {
        return null
      }
    })
    .filter((h): h is MemoryHeader => h !== null)

  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files.slice(0, MAX_MEMORY_FILES)
}
