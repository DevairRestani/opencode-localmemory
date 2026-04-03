import { createHash } from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'

const BASE_DIR = join(homedir(), '.config', 'opencode', 'localmemory')

export function getBaseDir(): string {
  return BASE_DIR
}

export function getUserMemoryDir(): string {
  const dir = join(BASE_DIR, 'user', 'memory')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function resolveGitRoot(directory: string): string {
  try {
    const gitDir = execSync('git rev-parse --show-toplevel 2>/dev/null', {
      cwd: directory,
      encoding: 'utf-8',
    }).trim()
    if (gitDir) return gitDir
  } catch {}
  return directory
}

function sanitizePath(p: string): string {
  return createHash('sha256').update(p).digest('hex').slice(0, 16)
}

export function getProjectMemoryDir(directory: string): string {
  const gitRoot = resolveGitRoot(directory)
  const hash = sanitizePath(gitRoot)
  const dir = join(BASE_DIR, 'projects', hash, 'memory')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function getMemoryDir(scope: 'user' | 'project', directory: string): string {
  return scope === 'user' ? getUserMemoryDir() : getProjectMemoryDir(directory)
}

export function getIndexPath(memoryDir: string): string {
  return join(memoryDir, 'MEMORY.md')
}

export function getConsolidateLockPath(memoryDir: string): string {
  return join(memoryDir, '.consolidate-lock')
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '_')
    .replace(/^_|_$/g, '')
}

export function filenameFromSlug(slug: string): string {
  return `${slug}.md`
}

export function slugFromFilename(filename: string): string {
  return filename.replace(/\.md$/, '')
}
