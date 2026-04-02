# AGENTS.md — opencode-localmemory

This file provides guidance for agentic coding agents working in this repository.

## Project Overview

opencode-localmemory is a **TypeScript plugin** for [OpenCode](https://opencode.ai) that provides persistent local memory for AI coding agents. It stores memories as JSON files under `~/.config/opencode/localmemory/` — no external services, no API keys, zero cost.

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
├── index.ts          # Main plugin source (all logic lives here)
├── install.ts        # CLI installer script (registers plugin in opencode config)
├── package.json      # Project manifest — ESM module, Bun runtime
├── tsconfig.json     # TypeScript config — strict mode, ESNext target
├── README.md         # User-facing documentation (in Portuguese)
└── dist/             # Build output (gitignored)
```

The `package.json` build script references `src/index.ts` but the actual source lives in `index.ts` at the root. The `tsconfig.json` includes `src/` — there is a mismatch. When working on this project, be aware the source file is `index.ts` at root level.

## Code Style Guidelines

### Language & Syntax

- **TypeScript** with `strict: true` — always use strict type checking
- **ESNext** target with **ESNext** modules — use modern JS features
- **ESM** module system (`"type": "module"` in package.json) — use `import`/`export`, never `require()`
- **Bun runtime** — you may use Bun-specific APIs when available

### Imports

- Use **Node.js built-in modules** directly (`crypto`, `fs`, `os`, `path`)
- Import types with `import type { ... }` syntax (separate type-only imports)
- Import values and types from `@opencode-ai/plugin` as needed
- Group imports logically:
  1. External packages / plugin SDK
  2. Node.js built-ins
  3. Local modules (none currently, but follow this if added)
- Use named imports, not namespace imports (`import { join }` not `import * as path`)

### Formatting

- **2-space indentation**
- **Single quotes** for strings (seen in codebase: `'utf-8'`, `'user'`, etc.)
- **Semicolons** at end of statements
- **Trailing commas** in multi-line structures (arrays, objects, function params)
- Use **parenthesized arrow function bodies** for returned objects: `() => ({ ... })`
- Max line length ~100 characters — break long chains or arrays across lines

### Types & Interfaces

- Define **type aliases** for unions: `type MemoryType = "preference" | "project-config" | ...`
- Define **interfaces** for object shapes: `interface Memory { ... }`, `interface MemoryStore { ... }`
- Use **string literal types** and **union types** for constrained values (not enums)
- Use `as` assertions sparingly — prefer type narrowing where possible
- Always type function parameters and return types for exported functions

### Naming Conventions

- **PascalCase** for types, interfaces, and exported plugin function: `LocalMemoryPlugin`, `MemoryStore`
- **camelCase** for functions, variables, and methods: `getMemoryDir`, `relevanceScore`
- **UPPER_SNAKE_CASE** for constants: `SAVE_TRIGGERS`
- **Descriptive names** — avoid abbreviations except well-known ones (`dir`, `cfg`, `mem`)
- File names: **kebab-case** for new files if added

### Error Handling

- Use **try/catch with empty catch** for non-critical file reads — return a safe default: `catch { return { version: 1, memories: [] } }`
- Return **user-friendly error strings** from tool execution (not thrown errors): `"Erro: content é obrigatório para mode=add"`
- Use **existence checks** before file operations: `if (!existsSync(file)) return defaultStore`
- Never throw from the `execute` function of a tool — always return a descriptive string

### Code Organization

- Use **section comments** with separators: `// ─── Section Name ─────────────...`
- Group related functions together under a section header
- Order sections logically:
  1. Types & interfaces
  2. Storage helpers (file I/O)
  3. Business logic (search, scoring, detection)
  4. Formatting utilities
  5. Plugin definition (the main export)
- Keep helper functions **pure** where possible — separate disk I/O from logic

### Plugin SDK Patterns

- Use `tool()` from `@opencode-ai/plugin` to define tools
- Use `tool.schema.enum()`, `tool.schema.string()`, `tool.schema.array()` for arg definitions
- The plugin default export is an async function: `export default async function({ directory }) => ({ tool, event, ... })`
- Tool `execute` functions must be async and return strings
- Use the `experimental.session.compacting` hook to inject context that survives compaction

### Comments

- Comments in this codebase are primarily in **Portuguese** — follow the existing language in any user-facing strings
- Code comments and section headers can be in **English**
- Add section separators for logical grouping (see existing pattern with `─` characters)

## Important Notes

- **No linter or formatter** is configured (no ESLint, Prettier, or Biome config files)
- **No CI/CD** pipeline is configured
- The `package.json` build script references `src/index.ts` but the file lives at `./index.ts` — this may need fixing
- The `tsconfig.json` includes `["src"]` but no `src/` directory exists — files are at root level
- Memories are stored as plain JSON — there is no encryption or access control
- The search is keyword-based token overlap — no embeddings or vector search
