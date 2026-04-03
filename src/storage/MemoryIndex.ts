import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { MemoryFile, MemoryFrontmatter } from '../types.js'
import { MAX_INDEX_LINES, MAX_INDEX_BYTES, INDEX_ENTRY_MAX_LENGTH } from '../types.js'
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.js'
import { getIndexPath } from './paths.js'
import { scanMemoryFiles } from './MemoryScanner.js'

function truncateDescription(desc: string, maxLen: number): string {
  if (desc.length <= maxLen) return desc
  return desc.slice(0, maxLen - 3) + '...'
}

export function loadIndex(memoryDir: string): string {
  const indexPath = getIndexPath(memoryDir)
  if (!existsSync(indexPath)) return ''
  try {
    return readFileSync(indexPath, 'utf-8')
  } catch {
    return ''
  }
}

export function saveIndex(memoryDir: string, content: string): void {
  const indexPath = getIndexPath(memoryDir)
  writeFileSync(indexPath, content, 'utf-8')
}

export function addIndexEntry(
  memoryDir: string,
  filename: string,
  name: string,
  description: string,
): void {
  const current = loadIndex(memoryDir)
  const desc = truncateDescription(description, INDEX_ENTRY_MAX_LENGTH)
  const entry = `- [${name}](${filename}) — ${desc}`
  const lines = current ? current.split('\n').filter((l) => l.trim().length > 0) : []

  const existingIdx = lines.findIndex((l) => l.includes(`(${filename})`))
  if (existingIdx >= 0) {
    lines[existingIdx] = entry
  } else {
    lines.push(entry)
  }

  let result = lines.join('\n') + '\n'

  if (result.split('\n').length > MAX_INDEX_LINES) {
    result = result.split('\n').slice(0, MAX_INDEX_LINES).join('\n') + '\n'
  }
  if (Buffer.byteLength(result, 'utf-8') > MAX_INDEX_BYTES) {
    while (Buffer.byteLength(result, 'utf-8') > MAX_INDEX_BYTES && result.includes('\n')) {
      result = result.split('\n').slice(0, -1).join('\n') + '\n'
    }
  }

  saveIndex(memoryDir, result)
}

export function removeIndexEntry(memoryDir: string, filename: string): void {
  const current = loadIndex(memoryDir)
  if (!current) return

  const lines = current.split('\n').filter((l) => !l.includes(`(${filename})`))
  saveIndex(memoryDir, lines.join('\n') + '\n')
}

export function rebuildIndex(memoryDir: string): void {
  const headers = scanMemoryFiles(memoryDir)
  const lines: string[] = []

  for (const h of headers) {
    const name = h.filename.replace(/\.md$/, '').replace(/_/g, ' ')
    const desc = truncateDescription(h.description || name, INDEX_ENTRY_MAX_LENGTH)
    lines.push(`- [${name}](${h.filename}) — ${desc}`)
  }

  saveIndex(memoryDir, lines.join('\n') + '\n')
}
