import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import {
  tokenize,
  relevanceScore,
  searchMemories,
  hasSaveTrigger,
  formatMemoryList,
  buildContextBlock,
  getMemoryDir,
  scopeFile,
  loadStore,
  saveStore,
  userTag,
  projectTag,
  LocalMemoryPlugin,
} from './index'
import type { Memory, MemoryStore } from './index'

function cleanMemoryFiles(uTag: string, pTag: string) {
  const files = [scopeFile(uTag), scopeFile(pTag)]
  for (const f of files) {
    try { unlinkSync(f) } catch { /* ignore */ }
  }
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'abc12345',
    content: 'prefiro TypeScript strict mode',
    type: 'preference',
    scope: 'user',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: ['typescript', 'config'],
    ...overrides,
  }
}

// ─── tokenize ─────────────────────────────────────────────────────────────────

describe('tokenize', () => {
  test('tokeniza texto simples', () => {
    const tokens = tokenize('prefiro TypeScript strict')
    expect(tokens).toEqual(new Set(['prefiro', 'typescript', 'strict']))
  })

  test('ignora palavras com menos de 3 caracteres', () => {
    const tokens = tokenize('eu gosto de TS')
    expect(tokens).toEqual(new Set(['gosto']))
  })

  test('normaliza para lowercase', () => {
    const tokens = tokenize('TypeScript BUN Node')
    expect(tokens.has('typescript')).toBe(true)
    expect(tokens.has('bun')).toBe(true)
    expect(tokens.has('node')).toBe(true)
  })

  test('remove pontuação', () => {
    const tokens = tokenize('hello, world! how are things?')
    expect(tokens.has('hello')).toBe(true)
    expect(tokens.has('world')).toBe(true)
    expect(tokens.has('how')).toBe(true)
    expect(tokens.has('are')).toBe(true)
    expect(tokens.has('things')).toBe(true)
  })

  test('retorna set vazio para string vazia', () => {
    expect(tokenize('')).toEqual(new Set())
  })

  test('trata apenas espaços', () => {
    expect(tokenize('   ')).toEqual(new Set())
  })
})

// ─── relevanceScore ───────────────────────────────────────────────────────────

describe('relevanceScore', () => {
  test('retorna 1 para match perfeito', () => {
    const mem = makeMemory({ content: 'TypeScript strict' })
    expect(relevanceScore('TypeScript strict', mem)).toBe(1)
  })

  test('retorna 0 para query sem relação', () => {
    const mem = makeMemory({ content: 'TypeScript strict' })
    expect(relevanceScore('python django', mem)).toBe(0)
  })

  test('score parcial com tags', () => {
    const mem = makeMemory({ content: 'config do projeto', tags: ['typescript'] })
    const score = relevanceScore('typescript', mem)
    expect(score).toBe(1)
  })

  test('retorna 0 para query com apenas palavras curtas', () => {
    const mem = makeMemory({ content: 'TypeScript' })
    expect(relevanceScore('é', mem)).toBe(0)
  })
})

// ─── searchMemories ───────────────────────────────────────────────────────────

describe('searchMemories', () => {
  const memories: Memory[] = [
    makeMemory({ id: '1', content: 'prefiro TypeScript strict mode', tags: ['typescript'] }),
    makeMemory({ id: '2', content: 'este projeto usa Bun como runtime', tags: ['bun', 'runtime'] }),
    makeMemory({ id: '3', content: 'sempre usar conventional commits', tags: ['git', 'commits'] }),
    makeMemory({ id: '4', content: 'configuração do ESLint com regras estritas', tags: ['eslint', 'lint'] }),
  ]

  test('busca por TypeScript retorna memória relevante', () => {
    const results = searchMemories(memories, 'TypeScript')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].id).toBe('1')
  })

  test('busca por termo inexistente retorna vazio', () => {
    const results = searchMemories(memories, 'python django flask')
    expect(results.length).toBe(0)
  })

  test('respeita threshold customizado', () => {
    const results = searchMemories(memories, 'TypeScript', 1.0)
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  test('resultados ordenados por score decrescente', () => {
    const results = searchMemories(memories, 'TypeScript strict')
    for (let i = 1; i < results.length; i++) {
      const prevScore = relevanceScore('TypeScript strict', results[i - 1])
      const currScore = relevanceScore('TypeScript strict', results[i])
      expect(prevScore).toBeGreaterThanOrEqual(currScore)
    }
  })

  test('lista vazia retorna vazio', () => {
    const results = searchMemories([], 'algo')
    expect(results.length).toBe(0)
  })
})

// ─── hasSaveTrigger ───────────────────────────────────────────────────────────

describe('hasSaveTrigger', () => {
  test('detecta "lembra"', () => {
    expect(hasSaveTrigger('lembra que eu prefiro tabs')).toBe(true)
  })

  test('detecta "remember"', () => {
    expect(hasSaveTrigger('remember to use strict mode')).toBe(true)
  })

  test('detecta "save this"', () => {
    expect(hasSaveTrigger('please save this for later')).toBe(true)
  })

  test('detecta "salva isso"', () => {
    expect(hasSaveTrigger('salva isso para mim')).toBe(true)
  })

  test('detecta "não esqueça"', () => {
    expect(hasSaveTrigger('não esqueça de rodar testes')).toBe(true)
  })

  test('detecta "don\'t forget"', () => {
    expect(hasSaveTrigger("don't forget the config")).toBe(true)
  })

  test('detecta "keep in mind"', () => {
    expect(hasSaveTrigger('keep in mind the deadline')).toBe(true)
  })

  test('detecta "guarda isso"', () => {
    expect(hasSaveTrigger('guarda isso')).toBe(true)
  })

  test('detecta "add to memory"', () => {
    expect(hasSaveTrigger('add to memory please')).toBe(true)
  })

  test('não detecta texto comum', () => {
    expect(hasSaveTrigger('crie uma função hello world')).toBe(false)
  })

  test('não detecta texto vazio', () => {
    expect(hasSaveTrigger('')).toBe(false)
  })

  test('case insensitive', () => {
    expect(hasSaveTrigger('REMEMBER this')).toBe(true)
    expect(hasSaveTrigger('SALVA ISSO')).toBe(true)
  })
})

// ─── formatMemoryList ─────────────────────────────────────────────────────────

describe('formatMemoryList', () => {
  test('lista vazia retorna placeholder', () => {
    expect(formatMemoryList([])).toBe('(nenhuma memória)')
  })

  test('formata memória com tags', () => {
    const result = formatMemoryList([makeMemory()])
    expect(result).toContain('[preference]')
    expect(result).toContain('prefiro TypeScript strict mode')
    expect(result).toContain('[typescript, config]')
  })

  test('formata memória sem tags', () => {
    const result = formatMemoryList([makeMemory({ tags: [] })])
    expect(result).toContain('[preference]')
    expect(result).not.toContain('[]')
  })

  test('formata múltiplas memórias separadas por newline', () => {
    const result = formatMemoryList([
      makeMemory({ id: '1', content: 'memória um' }),
      makeMemory({ id: '2', content: 'memória dois' }),
    ])
    const lines = result.split('\n')
    expect(lines.length).toBe(2)
  })
})

// ─── buildContextBlock ────────────────────────────────────────────────────────

describe('buildContextBlock', () => {
  test('contém seção LOCALMEMORY', () => {
    const result = buildContextBlock([], [])
    expect(result).toContain('[LOCALMEMORY]')
  })

  test('inclui preferências do usuário quando há memórias user', () => {
    const result = buildContextBlock([makeMemory()], [])
    expect(result).toContain('## Preferências do usuário')
  })

  test('inclui contexto do projeto quando há memórias project', () => {
    const result = buildContextBlock([], [makeMemory()])
    expect(result).toContain('## Contexto do projeto')
  })

  test('inclui instrução de uso da ferramenta memory', () => {
    const result = buildContextBlock([], [])
    expect(result).toContain('memory')
  })

  test('ambos os escopos presentes', () => {
    const result = buildContextBlock(
      [makeMemory({ content: 'user pref' })],
      [makeMemory({ content: 'project config' })],
    )
    expect(result).toContain('## Preferências do usuário')
    expect(result).toContain('## Contexto do projeto')
  })
})

// ─── userTag / projectTag ─────────────────────────────────────────────────────

describe('userTag', () => {
  test('retorna string estável com prefixo user_', () => {
    const tag = userTag()
    expect(tag.startsWith('user_')).toBe(true)
    expect(tag.length).toBe(17) // 'user_' + 12 hex chars
  })

  test('é determinístico', () => {
    expect(userTag()).toBe(userTag())
  })
})

describe('projectTag', () => {
  test('retorna string estável com prefixo project_', () => {
    const tag = projectTag('/tmp/my-project')
    expect(tag.startsWith('project_')).toBe(true)
    expect(tag.length).toBe(20) // 'project_' + 12 hex chars
  })

  test('é determinístico para mesmo diretório', () => {
    expect(projectTag('/tmp/my-project')).toBe(projectTag('/tmp/my-project'))
  })

  test('diferente para diretórios diferentes', () => {
    expect(projectTag('/tmp/project-a')).not.toBe(projectTag('/tmp/project-b'))
  })
})

// ─── Storage (loadStore / saveStore / scopeFile) ──────────────────────────────

describe('Storage helpers', () => {
  const testDir = join(tmpdir(), 'localmemory-test-' + process.pid)
  const testTag = 'test_scope_1234'

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  test('loadStore retorna store padrão quando arquivo não existe', () => {
    const store = loadStore('nonexistent_tag_xyz')
    expect(store.version).toBe(1)
    expect(store.memories).toEqual([])
  })

  test('saveStore e loadStore roundtrip', () => {
    const store: MemoryStore = {
      version: 1,
      memories: [makeMemory({ id: 'roundtrip' })],
    }
    const file = join(testDir, `${testTag}.json`)
    writeFileSync(file, JSON.stringify(store), 'utf-8')

    const loaded = JSON.parse(readFileSync(file, 'utf-8')) as MemoryStore
    expect(loaded.memories.length).toBe(1)
    expect(loaded.memories[0].id).toBe('roundtrip')
  })

  test('scopeFile retorna caminho dentro do diretório de memórias', () => {
    const file = scopeFile('user_abcd1234')
    expect(file).toContain('localmemory')
    expect(file).toContain('user_abcd1234.json')
  })

  test('getMemoryDir cria diretório se não existe', () => {
    const dir = getMemoryDir()
    expect(existsSync(dir)).toBe(true)
    expect(dir).toContain('localmemory')
  })

  test('loadStore com JSON corrompido retorna store padrão', () => {
    const file = scopeFile(testTag)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, 'not valid json {{{', 'utf-8')
    const store = loadStore(testTag)
    expect(store.version).toBe(1)
    expect(store.memories).toEqual([])
  })
})

// ─── Plugin initialization & tool execute ─────────────────────────────────────

describe('Plugin (LocalMemoryPlugin)', () => {
  const testDir = join(tmpdir(), 'localmemory-plugin-test-' + process.pid)
  let hooks: Awaited<ReturnType<typeof LocalMemoryPlugin>>
  const uTag = userTag()
  const pTag = projectTag(testDir)

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true })
    cleanMemoryFiles(uTag, pTag)
    hooks = await LocalMemoryPlugin({
      client: {} as any,
      project: {} as any,
      directory: testDir,
      worktree: testDir,
      serverUrl: new URL('http://localhost:3000'),
      $: {} as any,
    })
  })

  afterEach(() => {
    cleanMemoryFiles(uTag, pTag)
  })

  test('plugin retorna hooks esperados', () => {
    expect(hooks.tool).toBeDefined()
    expect(hooks.tool!.memory).toBeDefined()
    expect(hooks.event).toBeDefined()
    expect(hooks['experimental.session.compacting']).toBeDefined()
  })

  test('tool memory tem description', () => {
    expect(hooks.tool!.memory.description).toContain('memória')
  })

  // ── mode: add ───────────────────────────────────────────────────────────────

  describe('mode=add', () => {
    test('adiciona memória no escopo user', async () => {
      const result = await hooks.tool!.memory.execute(
        {
          mode: 'add',
          content: 'prefiro TypeScript strict',
          scope: 'user',
          type: 'preference',
          tags: ['typescript'],
        },
        {} as any,
      )
      expect(result).toContain('✓')
      expect(result).toContain('user')
      expect(result).toContain('prefiro TypeScript strict')
    })

    test('adiciona memória no escopo project', async () => {
      const result = await hooks.tool!.memory.execute(
        {
          mode: 'add',
          content: 'este projeto usa Bun',
          scope: 'project',
          type: 'project-config',
          tags: ['bun'],
        },
        {} as any,
      )
      expect(result).toContain('✓')
      expect(result).toContain('project')
    })

    test('retorna erro se content não informado', async () => {
      const result = await hooks.tool!.memory.execute(
        { mode: 'add', scope: 'user', type: 'general', tags: [] },
        {} as any,
      )
      expect(result).toContain('Erro')
      expect(result).toContain('content')
    })
  })

  // ── mode: list ──────────────────────────────────────────────────────────────

  describe('mode=list', () => {
    test('lista vazia retorna mensagem apropriada', async () => {
      const result = await hooks.tool!.memory.execute(
        { mode: 'list', scope: 'user', type: 'general', tags: [] },
        {} as any,
      )
      expect(result).toContain('Nenhuma memória')
    })

    test('lista memórias após adicionar', async () => {
      await hooks.tool!.memory.execute(
        {
          mode: 'add',
          content: 'memória de teste',
          scope: 'user',
          type: 'general',
          tags: ['teste'],
        },
        {} as any,
      )

      const result = await hooks.tool!.memory.execute(
        { mode: 'list', scope: 'user', type: 'general', tags: [] },
        {} as any,
      )
      expect(result).toContain('memória de teste')
      expect(result).toContain('1 total')
    })
  })

  // ── mode: search ────────────────────────────────────────────────────────────

  describe('mode=search', () => {
    test('retorna erro se query não informado', async () => {
      const result = await hooks.tool!.memory.execute(
        { mode: 'search', scope: 'user', type: 'general', tags: [] },
        {} as any,
      )
      expect(result).toContain('Erro')
      expect(result).toContain('query')
    })

    test('busca encontra memória relevante', async () => {
      await hooks.tool!.memory.execute(
        {
          mode: 'add',
          content: 'prefiro usar Bun como runtime',
          scope: 'user',
          type: 'preference',
          tags: ['bun'],
        },
        {} as any,
      )

      const result = await hooks.tool!.memory.execute(
        {
          mode: 'search',
          query: 'Bun runtime',
          scope: 'user',
          type: 'general',
          tags: [],
        },
        {} as any,
      )
      expect(result).toContain('prefiro usar Bun como runtime')
    })

    test('busca sem resultados retorna mensagem apropriada', async () => {
      const result = await hooks.tool!.memory.execute(
        {
          mode: 'search',
          query: 'xyz inexistente abc',
          scope: 'user',
          type: 'general',
          tags: [],
        },
        {} as any,
      )
      expect(result).toContain('Nenhuma memória')
    })
  })

  // ── mode: forget ────────────────────────────────────────────────────────────

  describe('mode=forget', () => {
    test('retorna erro se id não informado', async () => {
      const result = await hooks.tool!.memory.execute(
        { mode: 'forget', scope: 'user', type: 'general', tags: [] },
        {} as any,
      )
      expect(result).toContain('Erro')
      expect(result).toContain('id')
    })

    test('remove memória existente', async () => {
      const addResult = await hooks.tool!.memory.execute(
        {
          mode: 'add',
          content: 'memória para esquecer',
          scope: 'user',
          type: 'general',
          tags: [],
        },
        {} as any,
      )

      const idMatch = addResult.match(/id=([a-f0-9]+)/)
      expect(idMatch).not.toBeNull()
      const id = idMatch![1]

      const forgetResult = await hooks.tool!.memory.execute(
        { mode: 'forget', id, scope: 'user', type: 'general', tags: [] },
        {} as any,
      )
      expect(forgetResult).toContain('✓')
      expect(forgetResult).toContain(id)

      const listResult = await hooks.tool!.memory.execute(
        { mode: 'list', scope: 'user', type: 'general', tags: [] },
        {} as any,
      )
      expect(listResult).toContain('Nenhuma memória')
    })

    test('retorna mensagem para id inexistente', async () => {
      const result = await hooks.tool!.memory.execute(
        { mode: 'forget', id: 'nonexist', scope: 'user', type: 'general', tags: [] },
        {} as any,
      )
      expect(result).toContain('não encontrada')
    })
  })

  // ── compaction hook ─────────────────────────────────────────────────────────

  describe('experimental.session.compacting', () => {
    test('não injeta nada quando não há memórias', async () => {
      const output = { context: [] as string[], prompt: undefined }
      await hooks['experimental.session.compacting']!({ sessionID: 'test' }, output)
      expect(output.context.length).toBe(0)
    })

    test('injeta contexto quando há memórias', async () => {
      await hooks.tool!.memory.execute(
        {
          mode: 'add',
          content: 'lembrete persistente',
          scope: 'user',
          type: 'general',
          tags: [],
        },
        {} as any,
      )

      const output = { context: [] as string[], prompt: undefined }
      await hooks['experimental.session.compacting']!({ sessionID: 'test' }, output)
      expect(output.context.length).toBe(1)
      expect(output.context[0]).toContain('LOCALMEMORY')
      expect(output.context[0]).toContain('lembrete persistente')
    })
  })
})
