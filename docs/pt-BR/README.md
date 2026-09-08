> **Tradução.** Esta página está atrás da versão em inglês. A fonte autoritativa é [README.md](../../README.md).

**Idioma:** [English](../../README.md) | [简体中文](../../README.zh-CN.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | Português (Brasil) | [Türkçe](../tr/README.md) | [Русский](../ru/README.md) | [Tiếng Việt](../vi-VN/README.md) | [ไทย](../th/README.md) | [Deutsch](../de-DE/README.md) | [Українська](../uk-UA/README.md)

# FORGE

[![Stars](https://img.shields.io/github/stars/carlcastanas/forge?style=flat)](https://github.com/carlcastanas/forge/stargazers)
[![Forks](https://img.shields.io/github/forks/carlcastanas/forge?style=flat)](https://github.com/carlcastanas/forge/network/members)
[![Contributors](https://img.shields.io/github/contributors/carlcastanas/forge?style=flat)](https://github.com/carlcastanas/forge/graphs/contributors)
[![npm forge-universal](https://img.shields.io/npm/dw/forge-universal?label=forge-universal%20weekly%20downloads&logo=npm)](https://www.npmjs.com/package/forge-universal)
[![npm forge-shield](https://img.shields.io/npm/dw/forge-shield?label=forge-shield%20weekly%20downloads&logo=npm)](https://www.npmjs.com/package/forge-shield)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)
![Shell](https://img.shields.io/badge/-Shell-4EAA25?logo=gnu-bash&logoColor=white)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/-Python-3776AB?logo=python&logoColor=white)
![Go](https://img.shields.io/badge/-Go-00ADD8?logo=go&logoColor=white)
![Java](https://img.shields.io/badge/-Java-ED8B00?logo=openjdk&logoColor=white)
![Markdown](https://img.shields.io/badge/-Markdown-000000?logo=markdown&logoColor=white)

> **140K+ estrelas** | **21K+ forks** | **170+ contribuidores** | **12+ ecossistemas de linguagem**

---

<div align="center">

**Idioma / Language / 语言 / Dil / Язык / Ngôn ngữ**

[**English**](../../README.md) | [简体中文](../../README.zh-CN.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | [Português (Brasil)](README.md) | [Türkçe](../tr/README.md) | [Русский](../ru/README.md) | [Tiếng Việt](../vi-VN/README.md) | [ไทย](../th/README.md) | [Deutsch](../de-DE/README.md) | [Українська](../uk-UA/README.md)
</div>

---

**O sistema de otimização de desempenho para harnesses de agentes de IA.**

Não são apenas configurações. Um sistema completo: skills, instincts, otimização de memória, aprendizado contínuo, varredura de segurança e desenvolvimento com pesquisa em primeiro lugar. Agentes, hooks, comandos, regras e configurações MCP prontos para produção, desenvolvidos ao longo de 10+ meses de uso intensivo diário construindo produtos reais.

Funciona com **Claude Code**, **Codex**, **Cursor**, **OpenCode**, **Gemini** e outros harnesses de agentes de IA.

---

## Os Guias

Este repositório contém apenas o código. Os guias explicam tudo.

<table>
<tr>
<td align="center"><b>Guia Resumido</b><br/>Configuração, fundamentos, filosofia. <b>Leia este primeiro.</b></td>
<td align="center"><b>Guia Completo</b><br/>Otimização de tokens, persistência de memória, evals, paralelização.</td>
<td align="center"><b>Guia de Segurança</b><br/>Vetores de ataque, sandboxing, sanitização, CVEs, Forge Shield.</td>
</tr>
</table>

| Tópico | O Que Você Aprenderá |
|--------|----------------------|
| Otimização de Tokens | Seleção de modelo, redução de prompt de sistema, processos em segundo plano |
| Persistência de Memória | Hooks que salvam/carregam contexto entre sessões automaticamente |
| Aprendizado Contínuo | Extração automática de padrões das sessões em skills reutilizáveis |
| Loops de Verificação | Checkpoint vs evals contínuos, tipos de avaliador, métricas pass@k |
| Paralelização | Git worktrees, método cascade, quando escalar instâncias |
| Orquestração de Subagentes | O problema de contexto, padrão de recuperação iterativa |

---

## O Que Há de Novo

## Início Rápido

Comece em menos de 2 minutos:

### Passo 1: Instalar o Plugin

```bash
# Adicionar marketplace
/plugin marketplace add https://github.com/carlcastanas/forge

# Instalar plugin
/plugin install forge@forge
```

### Passo 2: Instalar as Regras (Obrigatório)

> WARNING: **Importante:** Plugins do Claude Code não podem distribuir `rules` automaticamente. Instale-as manualmente:

```bash
# Clone o repositório primeiro
git clone https://github.com/carlcastanas/forge.git
cd forge

# Instalar dependências (escolha seu gerenciador de pacotes)
npm install        # ou: pnpm install | yarn install | bun install

# macOS/Linux
./install.sh typescript    # ou python ou golang ou swift ou php
# ./install.sh typescript python golang swift php
# ./install.sh --target cursor typescript
# ./install.sh --target antigravity typescript
```

```powershell
# Windows PowerShell
.\install.ps1 typescript   # ou python ou golang ou swift ou php
# .\install.ps1 typescript python golang swift php
# .\install.ps1 --target cursor typescript
# .\install.ps1 --target antigravity typescript

# O ponto de entrada do pacote npm publicado também funciona multiplataforma
npx forge-universal install typescript
```

### Passo 3: Começar a Usar

```bash
# Experimente um comando (a instalação do plugin usa forma com namespace)
/forge:plan "Adicionar autenticação de usuário"

# Instalação manual (Opção 2) usa a forma mais curta:
# /plan "Adicionar autenticação de usuário"

# Verificar comandos disponíveis
/plugin list forge@forge
```

**Pronto!** Você agora tem acesso a 28 agentes, 116 skills e 59 comandos.

---

## Suporte Multiplataforma

Este plugin agora suporta totalmente **Windows, macOS e Linux**, com integração estreita em principais IDEs (Cursor, OpenCode, Antigravity) e harnesses CLI. Todos os hooks e scripts foram reescritos em Node.js para máxima compatibilidade.

### Detecção de Gerenciador de Pacotes

O plugin detecta automaticamente seu gerenciador de pacotes preferido (npm, pnpm, yarn ou bun) com a seguinte prioridade:

1. **Variável de ambiente**: `CLAUDE_PACKAGE_MANAGER`
2. **Config do projeto**: `.claude/package-manager.json`
3. **package.json**: campo `packageManager`
4. **Arquivo de lock**: Detecção por package-lock.json, yarn.lock, pnpm-lock.yaml ou bun.lockb
5. **Config global**: `~/.claude/package-manager.json`
6. **Fallback**: Primeiro gerenciador disponível (pnpm > bun > yarn > npm)

Para definir seu gerenciador de pacotes preferido:

```bash
# Via variável de ambiente
export CLAUDE_PACKAGE_MANAGER=pnpm

# Via config global
node scripts/setup-package-manager.js --global pnpm

# Via config do projeto
node scripts/setup-package-manager.js --project bun

# Detectar configuração atual
node scripts/setup-package-manager.js --detect
```

Ou use o comando `/setup-pm` no Claude Code.

### Controles de Runtime de Hooks

Use flags de runtime para ajustar rigor ou desabilitar hooks específicos temporariamente:

```bash
# Perfil de rigor de hooks (padrão: standard)
export FORGE_HOOK_PROFILE=standard

# IDs de hooks separados por vírgula para desabilitar
export FORGE_DISABLED_HOOKS="pre:bash:tmux-reminder,post:edit:typecheck"
```

---

## O Que Está Incluído

```
forge/
|-- agents/           # 28 subagentes especializados para delegação
|-- skills/           # Definições de fluxo de trabalho e conhecimento de domínio
|-- commands/         # Comandos slash para execução rápida
|-- rules/            # Diretrizes sempre seguidas (copiar para ~/.claude/rules/)
|-- hooks/            # Automações baseadas em gatilhos
|-- scripts/          # Scripts Node.js multiplataforma
|-- tests/            # Suíte de testes
|-- contexts/         # Contextos de injeção de prompt de sistema
|-- examples/         # Configurações e sessões de exemplo
|-- mcp-configs/      # Configurações de servidor MCP
```

---

## Ferramentas do Ecossistema

### Criador de Skills

Use o comando `/skill-create` para gerar skills do Claude Code a partir do seu repositório, com análise local e sem serviços externos:

```bash
/skill-create                    # Analisar repositório atual
/skill-create --instincts        # Também gerar instincts para continuous-learning
```

### Forge Shield — Auditor de Segurança

> 1282 testes, 98% de cobertura, 102 regras de análise estática.

```bash
# Verificação rápida (sem instalação necessária)
npx forge-shield scan

# Corrigir automaticamente problemas seguros
npx forge-shield scan --fix

# Análise profunda com três agentes Opus 4.6
npx forge-shield scan --opus --stream

# Gerar configuração segura do zero
npx forge-shield init
```

### Aprendizado Contínuo v2

O sistema de aprendizado baseado em instincts aprende automaticamente seus padrões:

```bash
/instinct-status        # Mostrar instincts aprendidos com confiança
/instinct-import <file> # Importar instincts de outros
/instinct-export        # Exportar seus instincts para compartilhar
/evolve                 # Agrupar instincts relacionados em skills
```

---

## Requisitos

### Versão do Claude Code CLI

**Versão mínima: v2.1.0 ou posterior**

Verifique sua versão:
```bash
claude --version
```

---

## Instalação

### Opção 1: Instalar como Plugin (Recomendado)

```bash
# Adicionar este repositório como marketplace
/plugin marketplace add https://github.com/carlcastanas/forge

# Instalar o plugin
/plugin install forge@forge
```

Ou adicione diretamente ao seu `~/.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "forge": {
      "source": {
        "source": "github",
        "repo": "carlcastanas/forge"
      }
    }
  },
  "enabledPlugins": {
    "forge@forge": true
  }
}
```

> **Nota:** O sistema de plugins do Claude Code não suporta distribuição de `rules` via plugins. Você precisa instalar as regras manualmente:
>
> ```bash
> # Clone o repositório primeiro
> git clone https://github.com/carlcastanas/forge.git
>
> # Opção A: Regras no nível do usuário (aplica a todos os projetos)
> mkdir -p ~/.claude/rules
> cp -r forge/rules/common ~/.claude/rules/common
> cp -r forge/rules/typescript ~/.claude/rules/typescript   # escolha sua stack
>
> # Opção B: Regras no nível do projeto (aplica apenas ao projeto atual)
> mkdir -p .claude/rules
> cp -r forge/rules/common .claude/rules/common
> ```

---

### Opção 2: Instalação Manual

```bash
# Clonar o repositório
git clone https://github.com/carlcastanas/forge.git

# Copiar agentes para sua config Claude
cp forge/agents/*.md ~/.claude/agents/

# Copiar regras (comuns + específicas da linguagem)
cp -r forge/rules/common ~/.claude/rules/common
cp -r forge/rules/typescript ~/.claude/rules/typescript

# Copiar comandos
cp forge/commands/*.md ~/.claude/commands/

# Copiar skills (core vs nicho)
cp -r forge/.agents/skills/* ~/.claude/skills/
```

---

## Conceitos-Chave

### Agentes

Subagentes lidam com tarefas delegadas com escopo limitado.

### Skills

Skills são definições de fluxo de trabalho invocadas por comandos ou agentes.

### Hooks

Hooks disparam em eventos de ferramenta. Exemplo — avisar sobre console.log:

```json
{
  "matcher": "tool == \"Edit\" && tool_input.file_path matches \"\\\\.(ts|tsx|js|jsx)$\"",
  "hooks": [{
    "type": "command",
    "command": "#!/bin/bash\ngrep -n 'console\\.log' \"$file_path\" && echo '[Hook] Remova o console.log' >&2"
  }]
}
```

### Regras

Regras são diretrizes sempre seguidas, organizadas em `common/` (agnóstico à linguagem) + diretórios específicos por linguagem.

---

## Qual Agente Devo Usar?

| Quero... | Use este comando | Agente usado |
|----------|-----------------|--------------|
| Planejar um novo recurso | `/forge:plan "Adicionar auth"` | planner |
| Projetar arquitetura de sistema | `/forge:plan` + agente architect | architect |
| Escrever código com testes primeiro | `/tdd` | tdd-guide |
| Revisar código que acabei de escrever | `/code-review` | code-reviewer |
| Corrigir build com falha | `/build-fix` | build-error-resolver |
| Executar testes end-to-end | `/e2e` | e2e-runner |
| Encontrar vulnerabilidades de segurança | `/security-scan` | security-reviewer |
| Remover código morto | `/refactor-clean` | refactor-cleaner |
| Atualizar documentação | `/update-docs` | doc-updater |
| Revisar código Go | `/go-review` | go-reviewer |
| Revisar código Python | `/python-review` | python-reviewer |

### Fluxos de Trabalho Comuns

**Começando um novo recurso:**
```
/forge:plan "Adicionar autenticação de usuário com OAuth"
                                              → planner cria blueprint de implementação
/tdd                                          → tdd-guide aplica escrita de testes primeiro
/code-review                                  → code-reviewer verifica seu trabalho
```

**Corrigindo um bug:**
```
/tdd                                          → tdd-guide: escrever teste falhando que reproduz o bug
                                              → implementar a correção, verificar se o teste passa
/code-review                                  → code-reviewer: detectar regressões
```

**Preparando para produção:**
```
/security-scan                                → security-reviewer: auditoria OWASP Top 10
/e2e                                          → e2e-runner: testes de fluxo crítico do usuário
/test-coverage                                → verificar cobertura 80%+
```

---

## FAQ

<details>
<summary><b>Como verificar quais agentes/comandos estão instalados?</b></summary>

```bash
/plugin list forge@forge
```
</details>

<details>
<summary><b>Meus hooks não estão funcionando / Vejo erros "Duplicate hooks file"</b></summary>

Este é o problema mais comum. **NÃO adicione um campo `"hooks"` ao `.claude-plugin/plugin.json`.** O Claude Code v2.1+ carrega automaticamente `hooks/hooks.json` de plugins instalados. Declarar explicitamente causa erros de detecção de duplicatas.
</details>

<details>
<summary><b>Posso usar o FORGE com Cursor / OpenCode / Codex / Antigravity?</b></summary>

Sim. O FORGE é multiplataforma:
- **Cursor**: Configs pré-traduzidas em `.cursor/`
- **OpenCode**: Suporte completo a plugins em `.opencode/`
- **Codex**: Suporte de primeira classe para app macOS e CLI
- **Antigravity**: Configuração integrada em `.agents/`
- **Claude Code**: Nativo — este é o alvo principal
</details>

<details>
<summary><b>Como contribuir com uma nova skill ou agente?</b></summary>

Veja [CONTRIBUTING.md](CONTRIBUTING.md). Em resumo:
1. Faça um fork do repositório
2. Crie sua skill em `skills/seu-nome-de-skill/SKILL.md` (com frontmatter YAML)
3. Ou crie um agente em `agents/seu-agente.md`
4. Envie um PR com uma descrição clara do que faz e quando usar
</details>

---

## Executando Testes

```bash
# Executar todos os testes
node tests/run-all.js

# Executar arquivos de teste individuais
node tests/lib/utils.test.js
node tests/lib/package-manager.test.js
node tests/hooks/hooks.test.js
```

---

## Contribuindo

**Contribuições são bem-vindas e incentivadas.**

Este repositório é um recurso para a comunidade. Se você tem:
- Agentes ou skills úteis
- Hooks inteligentes
- Melhores configurações MCP
- Regras aprimoradas

Por favor contribua! Veja [CONTRIBUTING.md](CONTRIBUTING.md) para diretrizes.

---

### v1.0.0 — Lançamento inicial (setembro de 2026)

- Catálogo completo: agentes, skills, comandos, regras e hooks de ciclo de vida.
- Adaptadores para Claude Code, Codex, Cursor, OpenCode e outros harnesses.
- Documentação de referência, guias longos e o scanner Forge Shield.

## Licença

MIT — consulte o [arquivo LICENSE](../../LICENSE) para detalhes.
