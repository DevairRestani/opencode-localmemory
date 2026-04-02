#!/usr/bin/env bun
/**
 * opencode-localmemory installer
 * Registra o plugin no opencode.jsonc global e mostra instruções de uso.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join, resolve } from "path"

const PLUGIN_DIR = resolve(join(import.meta.dir, ".."))
const CONFIG_DIR = join(homedir(), ".config", "opencode")
const CONFIG_FILE = join(CONFIG_DIR, "opencode.jsonc")
const MEMORY_DIR = join(CONFIG_DIR, "localmemory")
const PLUGIN_REF = `file://${PLUGIN_DIR}`

function stripJsonComments(src: string): string {
  return src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
}

function loadConfig(): Record<string, unknown> {
  if (!existsSync(CONFIG_FILE)) return {}
  try {
    return JSON.parse(stripJsonComments(readFileSync(CONFIG_FILE, "utf-8")))
  } catch {
    return {}
  }
}

function saveConfig(cfg: Record<string, unknown>): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8")
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log("\n🧠 opencode-localmemory — instalador\n")

// Ensure memory directory exists
if (!existsSync(MEMORY_DIR)) {
  mkdirSync(MEMORY_DIR, { recursive: true })
  console.log(`✓ Diretório de memórias criado: ${MEMORY_DIR}`)
} else {
  console.log(`✓ Diretório de memórias: ${MEMORY_DIR}`)
}

// Register plugin in config
const cfg = loadConfig()
const plugins: string[] = Array.isArray(cfg.plugin) ? (cfg.plugin as string[]) : []

if (plugins.includes(PLUGIN_REF)) {
  console.log(`✓ Plugin já registrado em ${CONFIG_FILE}`)
} else {
  plugins.push(PLUGIN_REF)
  cfg.plugin = plugins
  saveConfig(cfg)
  console.log(`✓ Plugin registrado em ${CONFIG_FILE}`)
}

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Instalação concluída!

Como usar:
  Diga ao agente:  "lembre que prefiro TypeScript strict"
  Diga ao agente:  "salva que este projeto usa Bun, não Node"
  Ou diretamente:  use a ferramenta 'memory' com mode=add

O agente usará automaticamente a ferramenta 'memory' para:
  • Salvar preferências e contexto de projeto
  • Buscar memórias relevantes quando necessário
  • Preservar contexto entre compactações de sessão

Memórias ficam em:
  ${MEMORY_DIR}/

Reinicie o OpenCode para ativar o plugin.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
