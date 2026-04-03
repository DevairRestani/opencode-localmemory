import { readFileSync } from 'fs'
import { join } from 'path'
import type { MemoryHeader } from '../types.js'
import { MAX_MEMORY_LINES, MAX_MEMORY_BYTES, RELEVANT_MEMORIES_PER_TURN } from '../types.js'
import { scanMemoryFiles } from '../storage/MemoryScanner.js'
import { parseFrontmatter } from '../storage/frontmatter.js'
import { formatAge, ageWarning } from './freshness.js'

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  )
}

function relevanceScore(query: string, header: MemoryHeader): number {
  const qTokens = tokenize(query)
  if (qTokens.size === 0) return 0

  const searchable = `${header.filename} ${header.description || ''} ${header.type || ''}`
  const hTokens = tokenize(searchable)

  let matches = 0
  for (const t of qTokens) {
    if (hTokens.has(t)) matches++
  }

  const tokenScore = matches / qTokens.size
  if (tokenScore === 0) return 0

  const ageMs = Date.now() - header.mtimeMs
  const dayMs = 24 * 60 * 60 * 1000
  const recencyBonus = Math.max(0, 1 - ageMs / (30 * dayMs)) * 0.2

  return tokenScore + recencyBonus
}

export interface SearchResult {
  filename: string
  header: MemoryHeader
  content: string
  score: number
  ageWarning: string | null
}

export function searchMemories(memoryDir: string, query: string, limit = RELEVANT_MEMORIES_PER_TURN): SearchResult[] {
  const headers = scanMemoryFiles(memoryDir)

  const scored = headers
    .map((h) => ({ header: h, score: relevanceScore(query, h) }))
    .filter(({ score }) => score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored.map(({ header, score }) => {
    const filePath = join(memoryDir, header.filename)
    let content = ''
    try {
      content = readFileSync(filePath, 'utf-8')
      const parsed = parseFrontmatter(content)
      if (parsed) content = parsed.body
    } catch {
      content = ''
    }

    const lines = content.split('\n')
    if (lines.length > MAX_MEMORY_LINES) {
      content = lines.slice(0, MAX_MEMORY_LINES).join('\n') + '\n... (truncated)'
    }
    if (Buffer.byteLength(content, 'utf-8') > MAX_MEMORY_BYTES) {
      content = content.slice(0, MAX_MEMORY_BYTES) + '\n... (truncated)'
    }

    return {
      filename: header.filename,
      header,
      content,
      score,
      ageWarning: ageWarning(header.mtimeMs),
    }
  })
}

export function recallTopMemories(memoryDir: string, limit = RELEVANT_MEMORIES_PER_TURN): SearchResult[] {
  const headers = scanMemoryFiles(memoryDir).slice(0, limit)

  return headers.map((header) => {
    const filePath = join(memoryDir, header.filename)
    let content = ''
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const parsed = parseFrontmatter(raw)
      if (parsed) content = parsed.body
    } catch {
      content = ''
    }

    const lines = content.split('\n')
    if (lines.length > MAX_MEMORY_LINES) {
      content = lines.slice(0, MAX_MEMORY_LINES).join('\n') + '\n... (truncated)'
    }
    if (Buffer.byteLength(content, 'utf-8') > MAX_MEMORY_BYTES) {
      content = content.slice(0, MAX_MEMORY_BYTES) + '\n... (truncated)'
    }

    return {
      filename: header.filename,
      header,
      content,
      score: 1,
      ageWarning: ageWarning(header.mtimeMs),
    }
  })
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return 'Nenhuma memória relevante encontrada.'

  return results
    .map((r) => {
      const parts = [
        `### ${r.header.filename.replace(/\.md$/, '').replace(/_/g, ' ')} [${r.header.type}] (${formatAge(r.header.mtimeMs)})`,
        r.content,
      ]
      if (r.ageWarning) parts.push(`> ${r.ageWarning}`)
      return parts.join('\n')
    })
    .join('\n\n---\n\n')
}
