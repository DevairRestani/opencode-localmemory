# AGENTS.md — opencode-localmemory

This file provides guidance for agentic coding agents working in this repository.

## Project Overview

opencode-localmemory is a **TypeScript plugin** for [OpenCode](https://opencode.ai) that provides persistent local memory for AI coding agents. It stores memories as **Markdown files with YAML frontmatter** organized per-project under `~/.config/opencode/localmemory/` — no external services, no API keys, zero cost.

The architecture is modeled after the Claude Code memory system (v2.1.88) with 4 memory types, a `MEMORY.md` index file, keyword-based relevance recall, age-based freshness warnings, and agent-assisted extraction/consolidation — without team sync.

The plugin is built with **Bun** and uses the `@opencode-ai/plugin` SDK.

## Build & Run Commands

```bash
# Install dependencies
bun install

# Build the plugin (outputs to dist/)
bun run build

# Type-check only (no emit)
bun run typecheck

# Watch mode (rebuild on changes)
bun run dev

# Register plugin into ~/.config/opencode/opencode.jsonc
bun run install-plugin
```

### Running a Single Test

There is currently **no test framework** configured in this project. There are no test scripts in `package.json` and no test files exist. If you add tests:

- Place test files alongside source files or in a `tests/` directory
- Use `bun:test` (Bun's built-in test runner): `bun test` or `bun test path/to/file.test.ts`
- Add a `"test"` script to `package.json` once a test runner is set up

## Project Structure

```
.
├── index.ts                    # Plugin entry point — hooks + tool definition
├── install.ts                  # CLI installer (registers plugin in opencode config)
├── package.json                # ESM module, Bun runtime
├── tsconfig.json               # Strict mode, ESNext target, includes src/
├── README.md                   # User-facing documentation (in Portuguese)
├── MEMORIA_TECNICA.md          # Technical reference (Claude Code memory system analysis)
├── src/
│   ├── types.ts                # Shared types + constants (MemoryType, limits)
│   ├── storage/
│   │   ├── paths.ts            # Directory resolution (user/project), slugify
│   │   ├── frontmatter.ts      # YAML frontmatter parser/serializer
│   │   ├── MemoryFile.ts       # CRUD operations on .md memory files
│   │   ├── MemoryIndex.ts      # MEMORY.md index management (200 lines / 25KB)
│   │   └── MemoryScanner.ts    # Recursive directory scan with mtime sorting
│   ├── recall/
│   │   ├── search.ts           # Keyword search + recency scoring + truncation
│   │   └── freshness.ts        # Age calculation + warnings (>1 day)
│   ├── extract/
│   │   └── prompts.ts          # Instructional prompts for extraction/consolidation
│   └── migration.ts            # Auto-migration from legacy JSON format to .md
└── dist/                       # Build output (gitignored)
```

### Storage Layout on Disk

```
~/.config/opencode/localmemory/
├── user/
│   └── memory/
│       ├── MEMORY.md           # Index file (always loaded in system prompt)
│       ├── user_role.md        # Memory files with frontmatter
│       └── ...
└── projects/
    └── <sha256-hash>/
        └── memory/
            ├── MEMORY.md
            ├── project_context.md
            └── ...
```

- User memories: cross-project, always available
- Project memories: isolated per git repository (hash of `git rev-parse --show-toplevel`)
- Legacy `.json` files are auto-migrated to `.md` on first load (original backed up as `.json.bak`)

## Memory Architecture

### Memory Types (4 types)

| Type | What it stores | Example |
|------|---------------|---------|
| `user` | Role, goals, preferences, knowledge level | "User is a senior backend engineer" |
| `feedback` | Corrections about how to work with this user | "Always run tests after changes" |
| `project` | Work context not derivable from code | "Deploy deadline is April 15" |
| `reference` | Pointers to external systems | "Monitoring: https://grafana.example.com/d/abc" |

### File Format

Each memory is a `.md` file with YAML frontmatter:

```markdown
---
name: User Role
description: User is a data scientist focused on observability
type: user
created: 2026-04-02T10:00:00Z
updated: 2026-04-02T10:00:00Z
tags: [observability, python]
---

Content of the memory goes here.
```

### MEMORY.md Index

Always loaded in the system prompt. Contains one-line pointers:

```markdown
- [User Role](user_role.md) — data scientist focused on observability
- [Feedback Testing](feedback_testing.md) — integration tests must hit real DB
```

Limits: 200 lines, 25KB, ~150 chars per entry.

### Tool Modes

| Mode | Purpose |
|------|---------|
| `save` | Create/update a memory file + update index |
| `search` | Keyword search with recency scoring |
| `list` | List all memories in a scope |
| `forget` | Remove a memory by name |
| `recall` | Top-5 relevant memories with freshness warnings |
| `extract` | Return instructions for extracting memories from conversation |
| `consolidate` | Return instructions for reviewing/merging/pruning memories |

### Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| `MAX_INDEX_LINES` | 200 | `src/types.ts` |
| `MAX_INDEX_BYTES` | 25000 | `src/types.ts` |
| `MAX_MEMORY_FILES` | 200 | `src/types.ts` |
| `MAX_MEMORY_LINES` | 200 | `src/types.ts` |
| `MAX_MEMORY_BYTES` | 4096 | `src/types.ts` |
| `RELEVANT_MEMORIES_PER_TURN` | 5 | `src/types.ts` |
| `INDEX_ENTRY_MAX_LENGTH` | 150 | `src/types.ts` |

## Code Style Guidelines

### Language & Syntax

- **TypeScript** with `strict: true` — always use strict type checking
- **ESNext** target with **ESNext** modules — use modern JS features
- **ESM** module system (`"type": "module"` in package.json) — use `import`/`export`, never `require()`
- **Bun runtime** — you may use Bun-specific APIs when available

### Imports

- Use **Node.js built-in modules** directly (`crypto`, `fs`, `os`, `path`, `child_process`)
- Import types with `import type { ... }` syntax (separate type-only imports)
- Import values and types from `@opencode-ai/plugin` as needed
- Local imports use `.js` extension: `import { foo } from './src/bar.js'`
- Group imports logically:
  1. External packages / plugin SDK
  2. Node.js built-ins
  3. Local modules (`src/...`)
- Use named imports, not namespace imports (`import { join }` not `import * as path`)

### Formatting

- **2-space indentation**
- **Single quotes** for strings
- **Semicolons** at end of statements
- **Trailing commas** in multi-line structures (arrays, objects, function params)
- Max line length ~100 characters — break long chains or arrays across lines

### Types & Interfaces

- Define **type aliases** for unions: `type MemoryType = 'user' | 'feedback' | 'project' | 'reference'`
- Define **interfaces** for object shapes: `interface MemoryHeader { ... }`, `interface MemoryFile { ... }`
- Use **string literal types** and **union types** for constrained values (not enums)
- Use `as` assertions sparingly — prefer type narrowing where possible
- Always type function parameters and return types for exported functions

### Naming Conventions

- **PascalCase** for types, interfaces, and exported plugin function: `LocalMemoryPlugin`, `MemoryHeader`
- **camelCase** for functions, variables, and methods: `getMemoryDir`, `relevanceScore`
- **UPPER_SNAKE_CASE** for constants: `MAX_INDEX_LINES`, `SAVE_TRIGGERS`
- **Descriptive names** — avoid abbreviations except well-known ones (`dir`, `fm`, `mem`)
- File names: **PascalCase** for storage modules (`MemoryFile.ts`, `MemoryScanner.ts`)

### Error Handling

- Use **try/catch with empty catch** for non-critical file reads — return a safe default
- Return **user-friendly error strings** from tool execution (not thrown errors): `"Error: name is required for mode=save"`
- Use **existence checks** before file operations: `if (!existsSync(file)) return null`
- Never throw from the `execute` function of a tool — always return a descriptive string

### Code Organization

- Separate concerns into `src/` subdirectories: `storage/`, `recall/`, `extract/`
- Keep helper functions **pure** where possible — separate disk I/O from logic
- Storage layer handles all filesystem operations
- Recall layer handles search/relevance/freshness
- Extract layer handles prompt generation for agent-assisted tasks

### Plugin SDK Patterns

- Use `tool()` from `@opencode-ai/plugin` to define tools
- Use `tool.schema.enum()`, `tool.schema.string()`, `tool.schema.array()` for arg definitions
- The plugin default export is an async function: `export default async function({ directory }) => ({ tool, event, ... })`
- Tool `execute` functions must be async and return strings
- Use `experimental.chat.system.transform` to inject MEMORY.md + recent memories into system prompt
- Use `experimental.session.compacting` to inject context that survives compaction

### Comments

- Comments in this codebase are primarily in **English**
- User-facing error messages and tool output are in **English**
- The README is in **Portuguese** (user-facing documentation)

## Important Notes

- **No linter or formatter** is configured (no ESLint, Prettier, or Biome config files)
- **No CI/CD** pipeline is configured
- **No test framework** is configured yet
- The entry point is `index.ts` at root level, which imports from `src/`
- The `tsconfig.json` includes both `index.ts`, `install.ts`, and `src/**/*.ts`
- Memories are stored as plain Markdown — there is no encryption or access control
- The search is keyword-based token overlap with recency bonus — no embeddings or vector search
- Migration from v1 JSON format is automatic on plugin load (backs up `.json` as `.json.bak`)
- The `MEMORIA_TECNICA.md` file is a reference document describing the Claude Code memory system — it is NOT part of the plugin code
