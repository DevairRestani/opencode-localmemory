export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

export type MemoryScope = 'user' | 'project'

export interface MemoryFrontmatter {
  name: string
  description: string
  type: MemoryType
  created: string
  updated: string
  tags: string[]
}

export interface MemoryFile {
  filename: string
  frontmatter: MemoryFrontmatter
  body: string
}

export interface MemoryHeader {
  filename: string
  filePath: string
  mtimeMs: number
  description: string | null
  type: MemoryType | undefined
}

export const MAX_INDEX_LINES = 200
export const MAX_INDEX_BYTES = 25000
export const MAX_MEMORY_FILES = 200
export const MAX_MEMORY_LINES = 200
export const MAX_MEMORY_BYTES = 4096
export const RELEVANT_MEMORIES_PER_TURN = 5
export const MIN_HOURS_DREAM = 24
export const INDEX_ENTRY_MAX_LENGTH = 150
