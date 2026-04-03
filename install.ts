#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

const PLUGIN_DIR = resolve(join(import.meta.dir, '..'))
const CONFIG_DIR = join(homedir(), '.config', 'opencode')
const CONFIG_FILE = join(CONFIG_DIR, 'opencode.jsonc')
const BASE_DIR = join(CONFIG_DIR, 'localmemory')
const PLUGIN_REF = `file://${PLUGIN_DIR}`

function stripJsonComments(src: string): string {
  return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

function loadConfig(): Record<string, unknown> {
  if (!existsSync(CONFIG_FILE)) return {}
  try {
    return JSON.parse(stripJsonComments(readFileSync(CONFIG_FILE, 'utf-8')))
  } catch {
    return {}
  }
}

function saveConfig(cfg: Record<string, unknown>): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8')
}

console.log('\nopencode-localmemory v2 — installer\n')

const dirs = [
  join(BASE_DIR, 'user', 'memory'),
  join(BASE_DIR, 'projects'),
]

for (const dir of dirs) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`Created: ${dir}`)
  } else {
    console.log(`Exists: ${dir}`)
  }
}

const cfg = loadConfig()
const plugins: string[] = Array.isArray(cfg.plugin) ? (cfg.plugin as string[]) : []

if (plugins.includes(PLUGIN_REF)) {
  console.log(`Plugin already registered in ${CONFIG_FILE}`)
} else {
  plugins.push(PLUGIN_REF)
  cfg.plugin = plugins
  saveConfig(cfg)
  console.log(`Plugin registered in ${CONFIG_FILE}`)
}

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Installation complete!

Memory structure:
  User memories:     ${dirs[0]}
  Project memories:  ${dirs[1]}/<project-hash>/memory/

Usage:
  Say: "remember I prefer TypeScript strict mode"
  Say: "save that this project uses Bun"
  Or use the 'memory' tool directly with mode=save

Modes: save, search, list, forget, recall, extract, consolidate
Types: user, feedback, project, reference

Restart OpenCode to activate the plugin.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
