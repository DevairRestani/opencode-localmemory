import type { MemoryFrontmatter } from '../types.js'

export interface ParsedMemory {
  frontmatter: MemoryFrontmatter
  body: string
}

export function parseFrontmatter(content: string): ParsedMemory | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return null

  const yaml = match[1]
  const body = match[2] || ''

  const fm: Partial<MemoryFrontmatter> = {}
  const lines = yaml.split(/\r?\n/)

  for (const line of lines) {
    const m = line.match(/^(\w+):\s*(.*)$/)
    if (!m) continue
    const [, key, rawVal] = m
    let val: string | string[] = rawVal.trim()

    if (val.startsWith('[') && val.endsWith(']')) {
      val = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter((s) => s.length > 0)
    }

    if (key === 'tags' && Array.isArray(val)) {
      fm.tags = val
    } else if (key === 'name') {
      fm.name = String(val)
    } else if (key === 'description') {
      fm.description = String(val)
    } else if (key === 'type') {
      fm.type = String(val) as MemoryFrontmatter['type']
    } else if (key === 'created') {
      fm.created = String(val)
    } else if (key === 'updated') {
      fm.updated = String(val)
    }
  }

  if (!fm.name || !fm.type) return null

  return {
    frontmatter: {
      name: fm.name,
      description: fm.description || '',
      type: fm.type,
      created: fm.created || new Date().toISOString(),
      updated: fm.updated || new Date().toISOString(),
      tags: fm.tags || [],
    },
    body: body.trim(),
  }
}

export function serializeFrontmatter(fm: MemoryFrontmatter, body: string): string {
  const tagsStr = fm.tags.length > 0 ? `[${fm.tags.map((t) => t).join(', ')}]` : '[]'
  const lines = [
    '---',
    `name: ${fm.name}`,
    `description: ${fm.description}`,
    `type: ${fm.type}`,
    `created: ${fm.created}`,
    `updated: ${fm.updated}`,
    `tags: ${tagsStr}`,
    '---',
    '',
    body.trim(),
    '',
  ]
  return lines.join('\n')
}
