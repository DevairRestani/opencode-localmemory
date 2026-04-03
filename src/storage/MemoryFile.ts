import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs'
import { join } from 'path'
import type { MemoryFile, MemoryFrontmatter } from '../types.js'
import { parseFrontmatter, serializeFrontmatter } from './frontmatter.js'
import { slugify, filenameFromSlug } from './paths.js'
import { addIndexEntry, removeIndexEntry } from './MemoryIndex.js'

function resolveFilename(memoryDir: string, name: string): string {
  const slug = slugify(name)
  return filenameFromSlug(slug)
}

export function createMemory(
  memoryDir: string,
  name: string,
  type: MemoryFrontmatter['type'],
  content: string,
  tags: string[] = [],
): MemoryFile {
  const filename = resolveFilename(memoryDir, name)
  const now = new Date().toISOString()

  const existing = readMemory(memoryDir, filename)
  const fm: MemoryFrontmatter = {
    name,
    description: content.split('\n')[0]?.slice(0, 120) || name,
    type,
    created: existing?.frontmatter.created || now,
    updated: now,
    tags: [...new Set([...(existing?.frontmatter.tags || []), ...tags])],
  }

  const file: MemoryFile = { filename, frontmatter: fm, body: content }
  const raw = serializeFrontmatter(fm, content)
  writeFileSync(join(memoryDir, filename), raw, 'utf-8')

  addIndexEntry(memoryDir, filename, name, fm.description)
  return file
}

export function readMemory(memoryDir: string, filename: string): MemoryFile | null {
  const filePath = join(memoryDir, filename)
  if (!existsSync(filePath)) return null

  try {
    const content = readFileSync(filePath, 'utf-8')
    const parsed = parseFrontmatter(content)
    if (!parsed) return null
    return { filename, frontmatter: parsed.frontmatter, body: parsed.body }
  } catch {
    return null
  }
}

export function readMemoryByName(memoryDir: string, name: string): MemoryFile | null {
  const filename = resolveFilename(memoryDir, name)
  return readMemory(memoryDir, filename)
}

export function updateMemory(
  memoryDir: string,
  filename: string,
  updates: Partial<{ content: string; name: string; type: MemoryFrontmatter['type']; tags: string[] }>,
): MemoryFile | null {
  const existing = readMemory(memoryDir, filename)
  if (!existing) return null

  const now = new Date().toISOString()
  const fm = { ...existing.frontmatter, updated: now }

  if (updates.name) fm.name = updates.name
  if (updates.type) fm.type = updates.type
  if (updates.tags) fm.tags = [...new Set(updates.tags)]
  if (updates.content !== undefined) {
    fm.description = updates.content.split('\n')[0]?.slice(0, 120) || fm.name
  }

  const body = updates.content !== undefined ? updates.content : existing.body
  const raw = serializeFrontmatter(fm, body)
  writeFileSync(join(memoryDir, filename), raw, 'utf-8')

  addIndexEntry(memoryDir, filename, fm.name, fm.description)
  return { filename, frontmatter: fm, body }
}

export function deleteMemory(memoryDir: string, filename: string): boolean {
  const filePath = join(memoryDir, filename)
  if (!existsSync(filePath)) return false

  unlinkSync(filePath)
  removeIndexEntry(memoryDir, filename)
  return true
}

export function deleteMemoryByName(memoryDir: string, name: string): boolean {
  const filename = resolveFilename(memoryDir, name)
  return deleteMemory(memoryDir, filename)
}

export function listMemoryFilenames(memoryDir: string): string[] {
  if (!existsSync(memoryDir)) return []
  return readdirSync(memoryDir).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md')
}

export function memoryExists(memoryDir: string, name: string): boolean {
  const filename = resolveFilename(memoryDir, name)
  return existsSync(join(memoryDir, filename))
}
