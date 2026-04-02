import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { createHash, randomUUID } from "crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"

// ─── Types ────────────────────────────────────────────────────────────────────

type MemoryType =
  | "preference"
  | "project-config"
  | "architecture"
  | "error-solution"
  | "learned-pattern"
  | "conversation"
  | "general"

type MemoryScope = "user" | "project"

interface Memory {
  id: string
  content: string
  type: MemoryType
  scope: MemoryScope
  createdAt: string
  updatedAt: string
  tags: string[]
}

interface MemoryStore {
  version: 1
  memories: Memory[]
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

export function getMemoryDir(): string {
  const dir = join(homedir(), ".config", "opencode", "localmemory")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function scopeFile(tag: string): string {
  return join(getMemoryDir(), `${tag}.json`)
}

export function loadStore(tag: string): MemoryStore {
  const file = scopeFile(tag)
  if (!existsSync(file)) return { version: 1, memories: [] }
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as MemoryStore
  } catch {
    return { version: 1, memories: [] }
  }
}

export function saveStore(tag: string, store: MemoryStore): void {
  writeFileSync(scopeFile(tag), JSON.stringify(store, null, 2), "utf-8")
}

// ─── Tag helpers ──────────────────────────────────────────────────────────────

export function userTag(): string {
  // stable key for the current OS user
  const user = process.env.USER ?? process.env.USERNAME ?? "default"
  return `user_${createHash("sha256").update(user).digest("hex").slice(0, 12)}`
}

export function projectTag(directory: string): string {
  return `project_${createHash("sha256").update(directory).digest("hex").slice(0, 12)}`
}

// ─── Search (keyword overlap, no external service) ────────────────────────────

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  )
}

export function relevanceScore(query: string, memory: Memory): number {
  const qTokens = tokenize(query)
  const mTokens = tokenize(memory.content + " " + memory.tags.join(" "))
  if (qTokens.size === 0) return 0
  let matches = 0
  for (const t of qTokens) if (mTokens.has(t)) matches++
  return matches / qTokens.size
}

export function searchMemories(memories: Memory[], query: string, threshold = 0.2): Memory[] {
  return memories
    .map((m) => ({ memory: m, score: relevanceScore(query, m) }))
    .filter(({ score }) => score >= threshold)
    .sort((a, b) => b.score - a.score)
    .map(({ memory }) => memory)
}

// ─── Keyword detection for auto-save ─────────────────────────────────────────

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

// ─── Format helpers ───────────────────────────────────────────────────────────

export function formatMemoryList(memories: Memory[]): string {
  if (memories.length === 0) return "(nenhuma memória)"
  return memories
    .map((m) => `• [${m.type}] ${m.content}${m.tags.length ? ` [${m.tags.join(", ")}]` : ""}`)
    .join("\n")
}

export function buildContextBlock(
  userMemories: Memory[],
  projectMemories: Memory[],
): string {
  const lines: string[] = ["[LOCALMEMORY]", ""]
  if (userMemories.length > 0) {
    lines.push("## Preferências do usuário (cross-project)")
    lines.push(formatMemoryList(userMemories))
    lines.push("")
  }
  if (projectMemories.length > 0) {
    lines.push("## Contexto do projeto")
    lines.push(formatMemoryList(projectMemories))
    lines.push("")
  }
  lines.push(
    "Use a ferramenta `memory` para adicionar, buscar, listar ou remover memórias.",
  )
  return lines.join("\n")
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const LocalMemoryPlugin: Plugin = async ({ directory }) => {
  const uTag = userTag()
  const pTag = projectTag(directory)

  // Load both stores once at plugin init
  const uStore = loadStore(uTag)
  const pStore = loadStore(pTag)

  // Helpers that operate on mutable stores (reloaded from disk each call
  // so concurrent sessions don't clobber each other)
  function getStore(scope: MemoryScope) {
    return scope === "user" ? loadStore(uTag) : loadStore(pTag)
  }
  function persistStore(scope: MemoryScope, store: MemoryStore) {
    return scope === "user" ? saveStore(uTag, store) : saveStore(pTag, store)
  }

  return {
    // ── Custom tool ──────────────────────────────────────────────────────────
    tool: {
      memory: tool({
        description: [
          "Gerencia memórias persistentes entre sessões (armazenadas localmente).",
          "Modos:",
          "  add    – salva uma memória nova (content obrigatório)",
          "  search – busca memórias relevantes por palavras-chave (query obrigatório)",
          "  list   – lista todas as memórias de um escopo",
          "  forget – remove uma memória pelo id",
          "",
          "scope: 'user' (cross-project, padrão) ou 'project' (só este diretório).",
          "type: preference | project-config | architecture | error-solution | learned-pattern | conversation | general",
        ].join("\n"),
        args: {
          mode: tool.schema.enum(["add", "search", "list", "forget"]),
          content: tool.schema.string().optional().describe("Texto da memória (para add)"),
          query: tool.schema.string().optional().describe("Palavras-chave para busca (para search)"),
          id: tool.schema.string().optional().describe("ID da memória (para forget)"),
          scope: tool.schema
            .enum(["user", "project"])
            .optional()
            .default("user")
            .describe("Escopo da memória"),
          type: tool.schema
            .enum([
              "preference",
              "project-config",
              "architecture",
              "error-solution",
              "learned-pattern",
              "conversation",
              "general",
            ])
            .optional()
            .default("general")
            .describe("Tipo da memória"),
          tags: tool.schema
            .array(tool.schema.string())
            .optional()
            .default([])
            .describe("Tags opcionais"),
        },
        async execute(args) {
          const scope = (args.scope ?? "user") as MemoryScope
          const store = getStore(scope)

          switch (args.mode) {
            case "add": {
              if (!args.content) return "Erro: content é obrigatório para mode=add"
              const mem: Memory = {
                id: randomUUID().slice(0, 8),
                content: args.content,
                type: (args.type ?? "general") as MemoryType,
                scope,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                tags: args.tags ?? [],
              }
              store.memories.push(mem)
              persistStore(scope, store)
              return `✓ Memória salva [${scope}] id=${mem.id}\n"${mem.content}"`
            }

            case "search": {
              if (!args.query) return "Erro: query é obrigatório para mode=search"
              // Search in both scopes so the agent sees everything relevant
              const uResults = searchMemories(loadStore(uTag).memories, args.query)
              const pResults = searchMemories(loadStore(pTag).memories, args.query)
              const all = [...uResults, ...pResults]
              if (all.length === 0) return "Nenhuma memória relevante encontrada."
              return (
                `Encontradas ${all.length} memória(s):\n\n` +
                all
                  .map(
                    (m) =>
                      `[${m.id}] [${m.scope}/${m.type}] ${m.content}` +
                      (m.tags.length ? ` [${m.tags.join(", ")}]` : ""),
                  )
                  .join("\n")
              )
            }

            case "list": {
              const memories = store.memories
              if (memories.length === 0)
                return `Nenhuma memória no escopo '${scope}'.`
              return (
                `Memórias (${scope}) — ${memories.length} total:\n\n` +
                memories
                  .map(
                    (m) =>
                      `[${m.id}] [${m.type}] ${m.content}` +
                      (m.tags.length ? ` [${m.tags.join(", ")}]` : ""),
                  )
                  .join("\n")
              )
            }

            case "forget": {
              if (!args.id) return "Erro: id é obrigatório para mode=forget"
              const before = store.memories.length
              store.memories = store.memories.filter((m) => m.id !== args.id)
              if (store.memories.length === before)
                return `Memória '${args.id}' não encontrada no escopo '${scope}'.`
              persistStore(scope, store)
              return `✓ Memória '${args.id}' removida de '${scope}'.`
            }
          }
        },
      }),
    },

    // ── Events ───────────────────────────────────────────────────────────────
    event: async ({ event }) => {
      // Keyword auto-save: when the user sends a message with a trigger phrase
      // we can't intercept the message content here (no chat.message hook in
      // official API), so we expose the tool and instruct the model to use it.

      // Session cleanup: nothing to do locally, stores persist by design.
      if (event.type === "session.idle") {
        // no-op — memories already persisted via tool calls
      }
    },

    // ── Compaction hook: inject memories so they survive context reset ────────
    "experimental.session.compacting": async (_input, output) => {
      const freshU = loadStore(uTag).memories
      const freshP = loadStore(pTag).memories
      if (freshU.length === 0 && freshP.length === 0) return

      output.context.push(`
## 🧠 Memórias persistentes (localmemory)

Estas memórias foram salvas explicitamente e DEVEM ser preservadas no resumo.

### Preferências do usuário (cross-project)
${formatMemoryList(freshU)}

### Contexto do projeto
${formatMemoryList(freshP)}

Ao gerar o resumo de continuação, inclua uma seção [LOCALMEMORY] com estas memórias intactas.
`)
    },
  }
}

// ─── Default export (required by OpenCode) ────────────────────────────────────
export default LocalMemoryPlugin
