import type { Plugin } from '@opencode-ai/plugin'
import { tool } from '@opencode-ai/plugin'
import type { MemoryScope } from './src/types.js'
import { getMemoryDir, getUserMemoryDir, getProjectMemoryDir } from './src/storage/paths.js'
import { createMemory, readMemory, deleteMemoryByName, listMemoryFilenames, readMemoryByName } from './src/storage/MemoryFile.js'
import { loadIndex, rebuildIndex } from './src/storage/MemoryIndex.js'
import { scanMemoryFiles } from './src/storage/MemoryScanner.js'
import { searchMemories, recallTopMemories, formatSearchResults } from './src/recall/search.js'
import { formatAge } from './src/recall/freshness.js'
import { buildExtractPrompt, buildConsolidatePrompt } from './src/extract/prompts.js'
import { needsMigration, migrateFromJSON } from './src/migration.js'

const SAVE_TRIGGERS = [
  /\blembra\b/i,
  /\blembre\b/i,
  /\bremember\b/i,
  /\bsave this\b/i,
  /\bsalva isso\b/i,
  /\bnão esqueça\b/i,
  /\bdon'?t forget\b/i,
  /\bkeep in mind\b/i,
  /\bguarda isso\b/i,
  /\badd to memory\b/i,
]

export function hasSaveTrigger(text: string): boolean {
  return SAVE_TRIGGERS.some((r) => r.test(text))
}

function resolveDir(scope: string | undefined, directory: string): string {
  return getMemoryDir((scope as MemoryScope) || 'user', directory)
}

export const LocalMemoryPlugin: Plugin = async ({ directory }) => {
  try {
    if (needsMigration()) {
      const count = migrateFromJSON()
      if (count > 0) console.log(`[localmemory] Migrated ${count} memories from legacy JSON format`)
    }
  } catch {}

  const userDir = getUserMemoryDir()
  const projectDir = getProjectMemoryDir(directory)

  return {
    tool: {
      memory: tool({
        description: [
          'Manages persistent memories across sessions (stored locally as Markdown files).',
          '',
          'Modes:',
          '  save        — Create or update a memory (name + content required)',
          '  search      — Search memories by keywords (query required)',
          '  list        — List all memories in a scope',
          '  forget      — Remove a memory by name',
          '  recall      — Get top relevant memories for a query with freshness info',
          '  extract     — Get instructions for extracting memories from conversation',
          '  consolidate — Get instructions for reviewing and consolidating memories',
          '',
          "scope: 'user' (cross-project, default) or 'project' (this directory only).",
          'type: user | feedback | project | reference',
        ].join('\n'),
        args: {
          mode: tool.schema.enum(['save', 'search', 'list', 'forget', 'recall', 'extract', 'consolidate']),
          name: tool.schema.string().optional().describe('Memory name (2-4 words, becomes filename). Required for save/forget.'),
          content: tool.schema.string().optional().describe('Memory content (for save)'),
          query: tool.schema.string().optional().describe('Keywords for search/recall'),
          scope: tool.schema
            .enum(['user', 'project'])
            .optional()
            .default('user')
            .describe("Scope: 'user' (cross-project) or 'project'"),
          type: tool.schema
            .enum(['user', 'feedback', 'project', 'reference'])
            .optional()
            .default('user')
            .describe('Memory type'),
          tags: tool.schema
            .array(tool.schema.string())
            .optional()
            .default([])
            .describe('Optional tags'),
        },
        async execute(args) {
          const dir = resolveDir(args.scope, directory)

          switch (args.mode) {
            case 'save': {
              if (!args.name) return 'Error: name is required for mode=save'
              if (!args.content) return 'Error: content is required for mode=save'
              const mem = createMemory(dir, args.name, (args.type ?? 'user') as 'user' | 'feedback' | 'project' | 'reference', args.content, args.tags ?? [])
              return `Memory saved [${args.scope ?? 'user'}] "${mem.frontmatter.name}" (${mem.filename})\nType: ${mem.frontmatter.type}\n"${args.content.slice(0, 100)}${args.content.length > 100 ? '...' : ''}"`
            }

            case 'search': {
              if (!args.query) return 'Error: query is required for mode=search'
              const results = searchMemories(dir, args.query)
              if (results.length === 0) return 'No relevant memories found.'
              return `Found ${results.length} memory(s) in [${args.scope ?? 'user'}]:\n\n${formatSearchResults(results)}`
            }

            case 'list': {
              const filenames = listMemoryFilenames(dir)
              if (filenames.length === 0) return `No memories in scope '${args.scope ?? 'user'}'.`
              const headers = scanMemoryFiles(dir)
              const lines = headers.map((h) => {
                const age = formatAge(h.mtimeMs)
                return `[${h.type}] ${h.filename} (${age}) — ${h.description || '(no description)'}`
              })
              return `Memories (${args.scope ?? 'user'}) — ${filenames.length} total:\n\n${lines.join('\n')}`
            }

            case 'forget': {
              if (!args.name) return 'Error: name is required for mode=forget'
              const ok = deleteMemoryByName(dir, args.name)
              if (!ok) return `Memory '${args.name}' not found in scope '${args.scope ?? 'user'}'.`
              return `Memory '${args.name}' removed from '${args.scope ?? 'user'}'.`
            }

            case 'recall': {
              if (!args.query) return 'Error: query is required for mode=recall'
              const results = searchMemories(dir, args.query, 5)
              if (results.length === 0) return 'No relevant memories found.'
              return formatSearchResults(results)
            }

            case 'extract': {
              const existing = scanMemoryFiles(dir)
              return buildExtractPrompt(existing)
            }

            case 'consolidate': {
              const memories = scanMemoryFiles(dir)
              if (memories.length === 0) return 'No memories to consolidate.'
              let oldestAge = 0
              let newestAge = Infinity
              let totalBytes = 0
              for (const m of memories) {
                const days = (Date.now() - m.mtimeMs) / (24 * 60 * 60 * 1000)
                if (days > oldestAge) oldestAge = days
                if (days < newestAge) newestAge = days
                try {
                  const fs = await import('fs')
                  const stat = fs.statSync(m.filePath)
                  totalBytes += stat.size
                } catch {}
              }
              return buildConsolidatePrompt(memories, oldestAge, newestAge, totalBytes)
            }
          }
        },
      }),
    },

    'experimental.chat.system.transform': async (_input, output) => {
      const userIndex = loadIndex(userDir)
      const projectIndex = loadIndex(projectDir)

      const userHeaders = scanMemoryFiles(userDir)
      const projectHeaders = scanMemoryFiles(projectDir)

      const recentUser = recallTopMemories(userDir, 3)
      const recentProject = recallTopMemories(projectDir, 2)

      const lines: string[] = [
        '',
        '# Auto Memory — Persistent Memory System',
        '',
        'You have access to a `memory` tool that manages persistent memories across sessions.',
        'Memories are stored locally as Markdown files — no external services, no API keys, zero cost.',
        '',
        '## When to Save Memories',
        '',
        'Save memories that capture information NOT derivable from the current codebase state:',
        '- User says "remember", "save this", "don\'t forget", "keep in mind", "lembra", "salva isso"',
        '- User preferences, role, goals, or knowledge level',
        '- Corrections about how to work with this user (feedback)',
        '- Project context not in code: deadlines, external decisions, constraints',
        '- Pointers to external systems (Jira, Grafana, Slack, docs)',
        '',
        '## Memory Types',
        '',
        '| Type | What to store | Example |',
        '|------|--------------|---------|',
        '| user | Role, goals, preferences, knowledge | "User is a senior backend engineer who prefers functional style" |',
        '| feedback | Corrections/validations about working style | "Always run tests after changes — Why: user wants confidence / How to apply: after every code edit" |',
        '| project | Work context not derivable from code | "Deploy deadline is April 15, must support legacy API v2" |',
        '| reference | External system pointers | "Monitoring dashboard: https://grafana.example.com/d/abc" |',
        '',
        '## What NOT to Save',
        '',
        '- Code patterns, architecture, file structure → derivable via grep/git',
        '- Git history → `git log` is the authority',
        '- Debug solutions → the fix is in the code',
        '- Ephemeral task details that won\'t matter tomorrow',
        '',
        '## Before Recommending from Memory',
        '',
        '- Memories are point-in-time observations, not live state',
        '- Verify that the memory is still relevant before acting on it',
        '- If a memory contradicts current code, trust the code',
        '',
        '## Periodic Tasks',
        '',
        '- After productive conversations, consider using `memory extract` to save new learnings',
        '- Periodically use `memory consolidate` to review, merge, and prune stale memories',
        '',
      ]

      if (userIndex.trim()) {
        lines.push('## User Memory Index (cross-project)')
        lines.push('```')
        lines.push(userIndex.trim())
        lines.push('```')
        lines.push('')
      }

      if (projectIndex.trim()) {
        lines.push('## Project Memory Index')
        lines.push('```')
        lines.push(projectIndex.trim())
        lines.push('```')
        lines.push('')
      }

      if (recentUser.length > 0 || recentProject.length > 0) {
        lines.push('## Recent Memories')
        lines.push('')
        for (const r of [...recentUser, ...recentProject]) {
          const scope = recentUser.includes(r) ? 'user' : 'project'
          lines.push(`[${scope}/${r.header.type}] ${r.filename.replace(/\.md$/, '').replace(/_/g, ' ')} (${formatAge(r.header.mtimeMs)}):`)
          if (r.content) lines.push(`  ${r.content.split('\n')[0]?.slice(0, 120)}`)
          if (r.ageWarning) lines.push(`  > ${r.ageWarning}`)
          lines.push('')
        }
      }

      if (!userIndex.trim() && !projectIndex.trim()) {
        lines.push('(No memories saved yet.)')
        lines.push('')
      }

      output.system.push(lines.join('\n'))
    },

    'experimental.session.compacting': async (_input, output) => {
      const userIndex = loadIndex(userDir)
      const projectIndex = loadIndex(projectDir)
      const userHeaders = scanMemoryFiles(userDir)
      const projectHeaders = scanMemoryFiles(projectDir)

      if (userHeaders.length === 0 && projectHeaders.length === 0) return

      const parts: string[] = [
        '[LOCALMEMORY] The following memories were explicitly saved and MUST be preserved in the summary.',
        '',
      ]

      if (userIndex.trim()) {
        parts.push('### User Memory Index')
        parts.push(userIndex.trim())
        parts.push('')
      }

      if (projectIndex.trim()) {
        parts.push('### Project Memory Index')
        parts.push(projectIndex.trim())
        parts.push('')
      }

      const recentUser = recallTopMemories(userDir, 3)
      const recentProject = recallTopMemories(projectDir, 2)
      for (const r of [...recentUser, ...recentProject]) {
        parts.push(`- [${r.header.type}] ${r.filename}: ${r.content.split('\n')[0]?.slice(0, 120)}`)
      }

      parts.push('')
      parts.push('When generating the continuation summary, include a [LOCALMEMORY] section with these memories intact.')

      output.context.push(parts.join('\n'))
    },

    event: async ({ event }) => {
      if (event.type === 'session.idle') {
        // no-op — memories persisted via tool calls
      }
    },
  }
}

export default LocalMemoryPlugin
