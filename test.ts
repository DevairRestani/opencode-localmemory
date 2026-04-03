import { describe, test, expect, beforeAll } from 'bun:test'
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { slugify, filenameFromSlug, getUserMemoryDir, getMemoryDir, getIndexPath } from './src/storage/paths.js'
import { parseFrontmatter, serializeFrontmatter } from './src/storage/frontmatter.js'
import { createMemory, readMemory, readMemoryByName, updateMemory, deleteMemory, deleteMemoryByName, listMemoryFilenames, memoryExists } from './src/storage/MemoryFile.js'
import { loadIndex, addIndexEntry, removeIndexEntry, rebuildIndex, saveIndex } from './src/storage/MemoryIndex.js'
import { scanMemoryFiles } from './src/storage/MemoryScanner.js'
import { searchMemories, recallTopMemories, formatSearchResults } from './src/recall/search.js'
import { ageDays, ageWarning, formatAge } from './src/recall/freshness.js'
import { buildExtractPrompt, buildConsolidatePrompt } from './src/extract/prompts.js'

const TEST_DIR = join(tmpdir(), 'localmemory-test-' + Date.now())

function makeTestDir(name: string): string {
  const dir = join(TEST_DIR, name)
  mkdirSync(dir, { recursive: true })
  return dir
}

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true })
})

describe('slugify', () => {
  test('converts names to slugs', () => {
    expect(slugify('User Role')).toBe('user_role')
    expect(slugify('Feedback Testing')).toBe('feedback_testing')
    expect(slugify('My Cool Project!')).toBe('my_cool_project')
    expect(slugify('  spaces  ')).toBe('spaces')
  })
})

describe('filenameFromSlug', () => {
  test('appends .md', () => {
    expect(filenameFromSlug('user_role')).toBe('user_role.md')
  })
})

describe('frontmatter', () => {
  const fm = {
    name: 'User Role',
    description: 'Senior backend engineer',
    type: 'user' as const,
    created: '2026-04-02T10:00:00Z',
    updated: '2026-04-02T10:00:00Z',
    tags: ['backend', 'typescript'],
  }

  test('serialize + parse roundtrip', () => {
    const raw = serializeFrontmatter(fm, 'User prefers functional style.')
    const parsed = parseFrontmatter(raw)
    expect(parsed).not.toBeNull()
    expect(parsed!.frontmatter.name).toBe('User Role')
    expect(parsed!.frontmatter.type).toBe('user')
    expect(parsed!.frontmatter.tags).toEqual(['backend', 'typescript'])
    expect(parsed!.body).toBe('User prefers functional style.')
  })

  test('returns null for content without frontmatter', () => {
    expect(parseFrontmatter('just some text')).toBeNull()
    expect(parseFrontmatter('---\nno valid yaml\n---\nbody')).toBeNull()
  })

  test('handles empty tags', () => {
    const fmNoTags = { ...fm, tags: [] }
    const raw = serializeFrontmatter(fmNoTags, 'content')
    const parsed = parseFrontmatter(raw)
    expect(parsed!.frontmatter.tags).toEqual([])
  })
})

describe('MemoryFile CRUD', () => {
  let dir: string

  beforeAll(() => {
    dir = makeTestDir('crud')
  })

  test('create + read', () => {
    const mem = createMemory(dir, 'User Role', 'user', 'Senior backend engineer who likes FP.', ['backend'])
    expect(mem.filename).toBe('user_role.md')
    expect(mem.frontmatter.name).toBe('User Role')
    expect(mem.frontmatter.type).toBe('user')
    expect(mem.body).toBe('Senior backend engineer who likes FP.')

    const read = readMemory(dir, 'user_role.md')
    expect(read).not.toBeNull()
    expect(read!.frontmatter.name).toBe('User Role')
    expect(read!.body).toBe('Senior backend engineer who likes FP.')
  })

  test('readMemoryByName', () => {
    const mem = readMemoryByName(dir, 'User Role')
    expect(mem).not.toBeNull()
    expect(mem!.frontmatter.name).toBe('User Role')
  })

  test('memoryExists', () => {
    expect(memoryExists(dir, 'User Role')).toBe(true)
    expect(memoryExists(dir, 'Nonexistent')).toBe(false)
  })

  test('update', () => {
    const updated = updateMemory(dir, 'user_role.md', { content: 'Updated content', tags: ['new-tag'] })
    expect(updated).not.toBeNull()
    expect(updated!.body).toBe('Updated content')
    expect(updated!.frontmatter.tags).toEqual(['new-tag'])
  })

  test('listMemoryFilenames', () => {
    createMemory(dir, 'Project Context', 'project', 'Deadline is April 15')
    const files = listMemoryFilenames(dir)
    expect(files.length).toBe(2)
    expect(files).toContain('user_role.md')
    expect(files).toContain('project_context.md')
  })

  test('delete', () => {
    const ok = deleteMemoryByName(dir, 'Project Context')
    expect(ok).toBe(true)
    expect(memoryExists(dir, 'Project Context')).toBe(false)
    expect(readMemoryByName(dir, 'Project Context')).toBeNull()
  })

  test('delete nonexistent returns false', () => {
    const ok = deleteMemoryByName(dir, 'Nothing')
    expect(ok).toBe(false)
  })
})

describe('MemoryIndex', () => {
  let dir: string

  beforeAll(() => {
    dir = makeTestDir('index')
    createMemory(dir, 'User Role', 'user', 'Backend engineer')
    createMemory(dir, 'Feedback Test', 'feedback', 'Always run tests')
  })

  test('MEMORY.md is created and contains entries', () => {
    const indexPath = getIndexPath(dir)
    expect(existsSync(indexPath)).toBe(true)
    const content = readFileSync(indexPath, 'utf-8')
    expect(content).toContain('user_role.md')
    expect(content).toContain('feedback_test.md')
  })

  test('addIndexEntry adds line', () => {
    addIndexEntry(dir, 'new_file.md', 'New File', 'A new entry')
    const content = loadIndex(dir)
    expect(content).toContain('new_file.md')
  })

  test('addIndexEntry updates existing', () => {
    addIndexEntry(dir, 'user_role.md', 'User Role', 'Updated description')
    const content = loadIndex(dir)
    expect(content).toContain('Updated description')
  })

  test('removeIndexEntry removes line', () => {
    addIndexEntry(dir, 'temp.md', 'Temp', 'To be removed')
    removeIndexEntry(dir, 'temp.md')
    const content = loadIndex(dir)
    expect(content).not.toContain('temp.md')
  })

  test('rebuildIndex', () => {
    saveIndex(dir, 'garbage\n')
    rebuildIndex(dir)
    const content = loadIndex(dir)
    expect(content).toContain('user_role.md')
    expect(content).toContain('feedback_test.md')
    expect(content).not.toContain('garbage')
  })
})

describe('MemoryScanner', () => {
  let dir: string

  beforeAll(() => {
    dir = makeTestDir('scanner')
    createMemory(dir, 'Alpha', 'user', 'First memory')
    createMemory(dir, 'Beta', 'feedback', 'Second memory')
    createMemory(dir, 'Gamma', 'project', 'Third memory')
  })

  test('scans all .md files except MEMORY.md', () => {
    const headers = scanMemoryFiles(dir)
    expect(headers.length).toBe(3)
    const names = headers.map((h) => h.filename)
    expect(names).toContain('alpha.md')
    expect(names).toContain('beta.md')
    expect(names).toContain('gamma.md')
  })

  test('sorted by mtime descending', () => {
    const headers = scanMemoryFiles(dir)
    expect(headers[0]!.mtimeMs).toBeGreaterThanOrEqual(headers[1]!.mtimeMs)
    expect(headers[1]!.mtimeMs).toBeGreaterThanOrEqual(headers[2]!.mtimeMs)
  })

  test('parses frontmatter correctly', () => {
    const headers = scanMemoryFiles(dir)
    const alpha = headers.find((h) => h.filename === 'alpha.md')
    expect(alpha).toBeDefined()
    expect(alpha!.type).toBe('user')
    expect(alpha!.description).toBeTruthy()
  })
})

describe('search', () => {
  let dir: string

  beforeAll(() => {
    dir = makeTestDir('search')
    createMemory(dir, 'User Role', 'user', 'Senior backend engineer who prefers TypeScript strict mode', ['typescript'])
    createMemory(dir, 'Feedback Testing', 'feedback', 'Always run integration tests after making changes')
    createMemory(dir, 'Project Deadline', 'project', 'Deploy must happen before April 15 2026')
    createMemory(dir, 'Reference Grafana', 'reference', 'Monitoring dashboard at grafana.example.com')
  })

  test('finds by keyword in content', () => {
    const results = searchMemories(dir, 'TypeScript')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0]!.filename).toBe('user_role.md')
  })

  test('finds by keyword in description', () => {
    const results = searchMemories(dir, 'integration tests')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some((r) => r.filename === 'feedback_testing.md')).toBe(true)
  })

  test('finds by type', () => {
    const results = searchMemories(dir, 'project')
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  test('returns empty for no match', () => {
    const results = searchMemories(dir, 'xyznonexistent zzzqqq')
    expect(results.length).toBe(0)
  })

  test('recallTopMemories returns recent', () => {
    const results = recallTopMemories(dir, 3)
    expect(results.length).toBe(3)
    expect(results[0]!.content).toBeTruthy()
  })

  test('formatSearchResults produces readable output', () => {
    const results = searchMemories(dir, 'testing')
    const formatted = formatSearchResults(results)
    expect(formatted).toContain('feedback testing')
    expect(formatted).toContain('integration tests')
  })
})

describe('freshness', () => {
  test('ageDays for now is <1', () => {
    expect(ageDays(Date.now())).toBeLessThan(1)
  })

  test('ageWarning returns null for fresh memory', () => {
    expect(ageWarning(Date.now())).toBeNull()
  })

  test('ageWarning returns warning for old memory', () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000
    const warning = ageWarning(twoDaysAgo)
    expect(warning).not.toBeNull()
    expect(warning).toContain('2 days old')
  })

  test('formatAge returns human readable', () => {
    expect(formatAge(Date.now())).toContain('just now')
    expect(formatAge(Date.now() - 2 * 60 * 60 * 1000)).toContain('2h')
    expect(formatAge(Date.now() - 3 * 24 * 60 * 60 * 1000)).toContain('3 days')
  })
})

describe('extract prompts', () => {
  test('buildExtractPrompt includes types and instructions', () => {
    const headers = scanMemoryFiles(makeTestDir('extract'))
    const prompt = buildExtractPrompt(headers)
    expect(prompt).toContain('user')
    expect(prompt).toContain('feedback')
    expect(prompt).toContain('project')
    expect(prompt).toContain('reference')
    expect(prompt).toContain('NOT to save')
    expect(prompt).toContain('memory save')
  })

  test('buildConsolidatePrompt includes stats and tasks', () => {
    const prompt = buildConsolidatePrompt([], 0, 0, 1024)
    expect(prompt).toContain('Consolidation')
    expect(prompt).toContain('Merge')
    expect(prompt).toContain('Prune')
    expect(prompt).toContain('200 lines')
  })
})

import { needsMigration } from './src/migration.js'

describe('migration', () => {
  test('needsMigration checks for JSON files', () => {
    expect(typeof needsMigration()).toBe('boolean')
  })
})

describe('end-to-end flow', () => {
  let dir: string

  beforeAll(() => {
    dir = makeTestDir('e2e')
  })

  test('create, search, recall, forget', () => {
    createMemory(dir, 'User Preferences', 'user', 'Prefers dark theme, vim keybindings, strict TypeScript', ['ui', 'typescript'])
    createMemory(dir, 'Project Context', 'project', 'This is a Bun project, not Node. Use bun test for testing.')
    createMemory(dir, 'Feedback Style', 'feedback', 'User wants concise explanations without unnecessary preamble')

    const all = scanMemoryFiles(dir)
    expect(all.length).toBe(3)

    const search = searchMemories(dir, 'TypeScript strict')
    expect(search.length).toBeGreaterThanOrEqual(1)
    expect(search.some((r) => r.filename === 'user_preferences.md')).toBe(true)

    const recall = recallTopMemories(dir, 5)
    expect(recall.length).toBe(3)

    const deleted = deleteMemoryByName(dir, 'Feedback Style')
    expect(deleted).toBe(true)

    const afterDelete = scanMemoryFiles(dir)
    expect(afterDelete.length).toBe(2)

    const indexContent = loadIndex(dir)
    expect(indexContent).toContain('user_preferences.md')
    expect(indexContent).toContain('project_context.md')
    expect(indexContent).not.toContain('feedback_style')
  })
})
