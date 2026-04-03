import type { MemoryHeader } from '../types.js'
import { formatAge, ageDays } from '../recall/freshness.js'

export function buildExtractPrompt(existingMemories: MemoryHeader[]): string {
  const memList = existingMemories.length > 0
    ? existingMemories
        .map((h) => `  - [${h.type}] ${h.filename}: ${h.description || '(sem descrição)'}`)
        .join('\n')
    : '  (nenhuma memória existente)'

  return [
    '## Memory Extraction Instructions',
    '',
    'Analyze the current conversation and extract memories that capture information NOT derivable from the current codebase state.',
    '',
    '### Memory Types (save ONLY these 4 types):',
    '',
    '- **user** — User role, goals, preferences, knowledge level. Always private.',
    '- **feedback** — Corrections/validations about how to work with this user. Structure as: **Why:** reason | **How to apply:** when this guidance applies.',
    '- **project** — Work context not derivable from code: deadlines, external decisions, constraints.',
    '- **reference** — Pointers to external systems (Jira, Grafana, Slack, docs URLs).',
    '',
    '### What NOT to save:',
    '- Code patterns, architecture, file structure → derivable via grep/git',
    '- Git history → `git log` is the authority',
    '- Debug solutions → the fix is in the code',
    '- Ephemeral task details',
    '',
    '### Existing memories (avoid duplicates):',
    memList,
    '',
    '### How to save:',
    'Use `memory save` with a descriptive `name` (2-4 words), appropriate `type`, and the `content`.',
    'The name becomes the filename — choose something stable and recognizable.',
    '',
    'If no meaningful new memories are found, respond saying so — do not force extraction.',
  ].join('\n')
}

export function buildConsolidatePrompt(
  memories: MemoryHeader[],
  oldestAge: number,
  newestAge: number,
  totalBytes: number,
): string {
  const memList = memories
    .map((h) => `  - [${h.type}] ${h.filename} (${formatAge(h.mtimeMs)}): ${h.description || '(sem descrição)'}`)
    .join('\n')

  const stats = [
    `Total memories: ${memories.length}`,
    `Age range: ${formatAge(newestAge * 24 * 60 * 60 * 1000)} to ${formatAge(oldestAge * 24 * 60 * 60 * 1000)}`,
    `Total size: ~${Math.round(totalBytes / 1024)}KB`,
  ].join('\n')

  return [
    '## Memory Consolidation (Dream)',
    '',
    'Review and consolidate the following memories. This is a periodic maintenance task.',
    '',
    '### Stats:',
    stats,
    '',
    '### Current memories:',
    memList,
    '',
    '### Consolidation tasks:',
    '',
    '1. **Merge** — If multiple memories cover the same topic, merge into one file.',
    '2. **Prune** — Remove memories that are stale, contradicted, or no longer relevant. Use `memory forget`.',
    '3. **Update** — If a memory has outdated info, update it with `memory save` (same name = update).',
    '4. **Reorganize** — Ensure each memory file has a clear, specific focus.',
    '',
    '### Rules:',
    '- Keep MEMORY.md under 200 lines / 25KB',
    '- Each memory file under 4KB',
    '- Prefer specific over generic',
    '- Convert relative dates to absolute dates where applicable',
    '',
    'Start by reviewing each memory, then decide what to merge, prune, or update.',
    'If everything looks good, respond saying so — no changes needed.',
  ].join('\n')
}
