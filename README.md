# opencode-localmemory

Plugin de memória persistente **local** para [OpenCode](https://opencode.ai) — sem assinatura, sem serviço externo, zero custo adicional.

Inspirado no [opencode-supermemory](https://github.com/supermemoryai/opencode-supermemory), mas com armazenamento 100% local usando arquivos JSON em `~/.config/opencode/localmemory/`.

---

## Instalação

### 1. Clone ou baixe

```bash
git clone https://github.com/seu-usuario/opencode-localmemory
cd opencode-localmemory
```

### 2. Instale dependências e compile

```bash
bun install
bun run build
```

### 3. Registre o plugin

```bash
bun run install-plugin
```

Ou manualmente, adicione ao `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugin": ["file:///caminho/absoluto/para/opencode-localmemory"]
}
```

### 4. Reinicie o OpenCode

O plugin `memory` aparecerá na lista de ferramentas disponíveis.

---

## Como funciona

### Ferramenta `memory`

O agente tem acesso direto à ferramenta `memory` com quatro modos:

| Modo     | Argumentos            | Descrição                              |
|----------|-----------------------|----------------------------------------|
| `add`    | `content`, `scope?`, `type?`, `tags?` | Salva uma memória nova |
| `search` | `query`               | Busca memórias por palavras-chave      |
| `list`   | `scope?`              | Lista todas as memórias de um escopo   |
| `forget` | `id`, `scope?`        | Remove uma memória pelo ID             |

### Escopos

| Escopo    | Arquivo                              | Persiste em          |
|-----------|--------------------------------------|----------------------|
| `user`    | `localmemory/user_<hash>.json`       | Todos os projetos    |
| `project` | `localmemory/project_<hash>.json`    | Este diretório       |

O hash é derivado do usuário do SO (`user`) ou do caminho absoluto do projeto (`project`).

### Tipos de memória

`preference` · `project-config` · `architecture` · `error-solution` · `learned-pattern` · `conversation` · `general`

### Busca local

A busca usa **sobreposição de tokens** (sem embeddings, sem API externa). Funciona bem para recuperar memórias por palavras-chave relevantes.

### Compactação de contexto

Quando a janela de contexto atinge o limite, o hook `experimental.session.compacting` injeta automaticamente todas as memórias no prompt de continuação, garantindo que nada seja perdido entre compactações.

---

## Uso

### Frases que ativam o salvamento automático

O agente reconhece frases como:

- *"lembre que prefiro respostas concisas"*
- *"salva que este projeto usa Bun, não Node"*
- *"remember to always use TypeScript strict mode here"*
- *"não esqueça: o deploy é via GitHub Actions"*

### Direto pela ferramenta

```
Adicione à memória do projeto: este projeto usa Vue 3 com Composition API.
```

```
Busque na memória o que você sabe sobre o deploy deste projeto.
```

---

## Arquivos gerados

```
~/.config/opencode/localmemory/
  user_<sha256>.json        ← memórias cross-project
  project_<sha256>.json     ← memórias deste projeto
```

Formato:

```json
{
  "version": 1,
  "memories": [
    {
      "id": "a1b2c3d4",
      "content": "Prefere respostas concisas em português",
      "type": "preference",
      "scope": "user",
      "createdAt": "2026-04-02T10:00:00.000Z",
      "updatedAt": "2026-04-02T10:00:00.000Z",
      "tags": []
    }
  ]
}
```

---

## Diferenças do opencode-supermemory

| Feature               | opencode-supermemory       | opencode-localmemory     |
|-----------------------|----------------------------|--------------------------|
| Armazenamento         | Nuvem (Supermemory API)    | Local (`~/.config/...`)  |
| Busca semântica       | Embeddings vetoriais       | Keyword overlap          |
| Custo                 | Assinatura paga            | Zero                     |
| Privacidade           | Dados enviados para API    | 100% local               |
| Sync entre máquinas   | Sim (via API)              | Não (mas portável via git)|
| Funciona offline      | Não                        | Sim                      |

---

## Licença

MIT
