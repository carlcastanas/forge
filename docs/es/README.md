> **Traducción.** Esta página va por detrás de la versión en inglés. La fuente autoritativa es [README.md](../../README.md).

**Idioma:** [English](../../README.md) | [Português (Brasil)](../pt-BR/README.md) | [简体中文](../../README.zh-CN.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md) | [Türkçe](../tr/README.md) | [Русский](../ru/README.md) | [Tiếng Việt](../vi-VN/README.md) | [ไทย](../th/README.md) | [Deutsch](../de-DE/README.md) | **Español** | [Українська](../uk-UA/README.md)

# FORGE

![FORGE - el sistema operativo nativo del harness para trabajo agentivo](../../assets/hero.png)

[![Contributors](https://img.shields.io/github/contributors/carlcastanas/FORGE?style=flat)](https://github.com/carlcastanas/forge/graphs/contributors)
[![npm forge-universal](https://img.shields.io/npm/dw/forge-universal?label=forge-universal%20weekly%20downloads&logo=npm)](https://www.npmjs.com/package/forge-universal)
[![npm forge-shield](https://img.shields.io/npm/dw/forge-shield?label=forge-shield%20weekly%20downloads&logo=npm)](https://www.npmjs.com/package/forge-shield)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Shell](https://img.shields.io/badge/-Shell-4EAA25?logo=gnu-bash&logoColor=white)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/-Python-3776AB?logo=python&logoColor=white)
![Go](https://img.shields.io/badge/-Go-00ADD8?logo=go&logoColor=white)
![Java](https://img.shields.io/badge/-Java-ED8B00?logo=openjdk&logoColor=white)
![Perl](https://img.shields.io/badge/-Perl-39457E?logo=perl&logoColor=white)
![Markdown](https://img.shields.io/badge/-Markdown-000000?logo=markdown&logoColor=white)

> **182K+ estrellas** | **28K+ forks** | **170+ contribuidores** | **12+ ecosistemas de lenguajes** | **Flujos de trabajo de agentes multi-harness**

---

<div align="center">

**Language / 语言 / 語言 / Dil / Язык / Ngôn ngữ / Idioma**

[**English**](../../README.md) | [Português (Brasil)](../pt-BR/README.md) | [简体中文](../../README.zh-CN.md) | [繁體中文](../zh-TW/README.md) | [日本語](../ja-JP/README.md) | [한국어](../ko-KR/README.md)
 | [Türkçe](../tr/README.md) | [Русский](../ru/README.md) | [Tiếng Việt](../vi-VN/README.md) | [ไทย](../th/README.md) | [Deutsch](../de-DE/README.md) | **Español** | [Українська](../uk-UA/README.md)

</div>

---

**El sistema operativo nativo del harness para trabajo agentivo. Construido a partir de flujos de trabajo de ingeniería multi-harness del mundo real.**

No son solo configuraciones. Es un sistema completo: skills, instintos, optimización de memoria, aprendizaje continuo, análisis de seguridad y desarrollo orientado a la investigación. Agentes listos para producción, skills, hooks, reglas, configuraciones de MCP y comandos legados, evolucionados durante más de 10 meses de uso diario intensivo construyendo productos reales.

Funciona en **Codex**, **Claude Code**, **Cursor**, **OpenCode**, **Gemini**, **Zed**, **GitHub Copilot** y otros harnesses de agentes de IA.

FORGE v2.0.0-rc.1 añade la historia pública del operador Hermes sobre esa capa reutilizable: comienza con la [guía de configuración de Hermes](../HERMES-SETUP.md), luego revisa las [notas de la versión rc.1](../releases/2.0.0-rc.1/release-notes.md) y la [arquitectura multi-harness](../architecture/cross-harness.md).

---

<table>
<tr>
<td width="100%" align="center">
  <a href="https://github.com/carlcastanas/forge/discussions">
    <strong>Comunidad</strong>
    <br />
    <sub>Discusiones · Preguntas · Showcase</sub>
  </a>
</td>
</tr>
</table>

<sub>Este repositorio tiene licencia MIT permanente.</sub>

---

## Las Guías

Este repositorio contiene solo el código. Las guías explican todo.

<table>
<tr>
<td align="center"><b>Guía Resumida</b><br/>Configuración, fundamentos, filosofía. <b>Empieza aquí.</b></td>
<td align="center"><b>Guía Extensa</b><br/>Optimización de tokens, persistencia de memoria, evaluaciones, paralelización.</td>
<td align="center"><b>Guía de Seguridad</b><br/>Vectores de ataque, sandboxing, sanitización, CVEs, Forge Shield.</td>
</tr>
</table>

| Tema | Qué aprenderás |
|------|----------------|
| Optimización de Tokens | Selección de modelos, reducción de system prompts, procesos en segundo plano |
| Persistencia de Memoria | Hooks que guardan/cargan contexto entre sesiones automáticamente |
| Aprendizaje Continuo | Extrae patrones de las sesiones y los convierte en skills reutilizables |
| Bucles de Verificación | Evaluaciones de checkpoint vs. continuas, tipos de evaluadores, métricas pass@k |
| Paralelización | Git worktrees, método cascada, cuándo escalar instancias |
| Orquestación de Subagentes | El problema del contexto, patrón de recuperación iterativa |

---

## Novedades

## Inicio Rápido

Empieza a trabajar en menos de 2 minutos:

### Elige solo un camino

La mayoría de los usuarios de Claude Code deben usar exactamente un método de instalación:

- **Opción recomendada por defecto:** instala el plugin de Claude Code, luego copia solo las carpetas de reglas que realmente necesites.
- **Usa el instalador manual solo si** quieres un control más granular, deseas evitar completamente la ruta del plugin o tu build de Claude Code tiene problemas para resolver la entrada del marketplace autoalojado.
- **No combines métodos de instalación.** La configuración rota más común es: `/plugin install` primero, luego `install.sh --profile full` o `npx forge-universal install --profile full` después.

Si ya combinaste múltiples instalaciones y hay duplicados, salta directamente a [Restablecer / Desinstalar FORGE](#restablecer--desinstalar-forge).

### Ruta sin contexto / sin hooks

Si los hooks te parecen demasiado globales o solo quieres las reglas, agentes, comandos y skills principales de FORGE, omite el plugin y usa el perfil manual mínimo:

```bash
./install.sh --profile minimal --target claude
```

```powershell
.\install.ps1 --profile minimal --target claude
# o
npx forge-universal install --profile minimal --target claude
```

Este perfil excluye intencionalmente `hooks-runtime`.

Si quieres el perfil core normal pero necesitas desactivar los hooks, usa:

```bash
./install.sh --profile core --without baseline:hooks --target claude
```

Añade hooks después solo si quieres aplicación en tiempo de ejecución:

```bash
./install.sh --target claude --modules hooks-runtime
```

### Encuentra primero los componentes correctos

Si no estás seguro de qué perfil o componente de FORGE instalar, consulta al asesor empaquetado desde cualquier proyecto:

```bash
npx forge-universal consult "security reviews" --target claude
```

Devuelve los componentes coincidentes, los perfiles relacionados y los comandos de vista previa/instalación. Usa el comando de vista previa antes de instalar si quieres inspeccionar el plan de archivos exacto.

Para flujos de trabajo de ML/MLOps en producción, mantén la instalación opt-in y con alcance de componentes:

```bash
npx forge-universal consult "mlops training model deployment" --target claude
npx forge-universal install --profile minimal --target claude --with capability:machine-learning
```

### Paso 1: Instalar el Plugin (Recomendado)

> NOTA: El plugin es conveniente, pero el instalador OSS de abajo sigue siendo la ruta más confiable si tu build de Claude Code tiene problemas para resolver entradas del marketplace autoalojado.

```bash
# Agregar marketplace
/plugin marketplace add https://github.com/carlcastanas/forge

# Instalar plugin
/plugin install forge@forge
```

### Nota de Nombres y Migración

FORGE tiene tres identificadores públicos que no son intercambiables:

- Repositorio fuente de GitHub: `carlcastanas/FORGE`
- Identificador de marketplace/plugin de Claude: `forge@forge`
- Paquete npm: `forge-universal`

Esto es intencional. Las instalaciones del marketplace/plugin de Anthropic se identifican por un identificador de plugin canónico, por lo que FORGE usa `forge@forge` para mantener los nombres de herramientas y los espacios de nombres de comandos slash lo suficientemente cortos para los validadores estrictos de Desktop/API. Las publicaciones antiguas pueden mostrar el anterior identificador largo del marketplace; trátalo solo como un alias heredado. Por su parte, el paquete npm se mantuvo en `forge-universal`, por lo que las instalaciones de npm y las del marketplace usan intencionalmente nombres diferentes.

### Paso 2: Instalar Reglas Solo Si Las Necesitas

> ADVERTENCIA: **Importante:** Los plugins de Claude Code no pueden distribuir `rules` automáticamente.
>
> Si ya instalaste FORGE mediante `/plugin install`, **no ejecutes `./install.sh --profile full`, `.\install.ps1 --profile full`, ni `npx forge-universal install --profile full` después**. El plugin ya carga las skills, comandos y hooks de FORGE. Ejecutar el instalador completo tras una instalación del plugin copia esas mismas superficies en tus directorios de usuario y puede crear skills duplicadas más comportamiento duplicado en tiempo de ejecución.
>
> Para instalaciones de plugin, copia manualmente solo los directorios `rules/` que quieras bajo `~/.claude/rules/forge/`. Empieza con `rules/common` más un pack de lenguaje o framework que uses realmente. No copies todos los directorios de reglas a menos que quieras explícitamente todo ese contexto en Claude.
>
> Usa el instalador completo solo cuando hagas una instalación completamente manual de FORGE en lugar de la ruta del plugin.
>
> Si tu configuración local de Claude fue eliminada o restablecida, empieza con `node scripts/forge.js list-installed`, luego ejecuta `node scripts/forge.js doctor` y `node scripts/forge.js repair` antes de reinstalar cualquier cosa. Eso generalmente restaura los archivos gestionados por FORGE sin reconstruir tu configuración.

```bash
# Clonar el repo primero
git clone https://github.com/carlcastanas/forge.git
cd FORGE

# Instalar dependencias (elige tu gestor de paquetes)
npm install        # o: pnpm install | yarn install | bun install

# Ruta de plugin: copiar solo las reglas de FORGE en un espacio de nombres propio
mkdir -p ~/.claude/rules/forge
cp -R rules/common ~/.claude/rules/forge/
cp -R rules/typescript ~/.claude/rules/forge/

# Ruta de instalación completamente manual (usa esto en lugar de /plugin install)
# ./install.sh --profile full
```

```powershell
# Windows PowerShell

# Ruta de plugin: copiar solo las reglas de FORGE en un espacio de nombres propio
New-Item -ItemType Directory -Force -Path "$HOME/.claude/rules/forge" | Out-Null
Copy-Item -Recurse rules/common "$HOME/.claude/rules/forge/"
Copy-Item -Recurse rules/typescript "$HOME/.claude/rules/forge/"

# Ruta de instalación completamente manual (usa esto en lugar de /plugin install)
# .\install.ps1 --profile full
# npx forge-universal install --profile full
```

Para instrucciones de instalación manual consulta el README en la carpeta `rules/`. Al copiar reglas manualmente, copia el directorio completo del lenguaje (por ejemplo `rules/common` o `rules/golang`), no los archivos dentro de él, para que las referencias relativas sigan funcionando y los nombres de archivo no colisionen.

### Instalación completamente manual (Alternativa)

Usa esto solo si estás omitiendo intencionalmente la ruta del plugin:

```bash
./install.sh --profile full
```

```powershell
.\install.ps1 --profile full
# o
npx forge-universal install --profile full
```

Si eliges esta ruta, detente aquí. No ejecutes también `/plugin install`.

### Restablecer / Desinstalar FORGE

Si FORGE parece duplicado, intrusivo o roto, no lo reinstales encima de sí mismo.

- **Ruta del plugin:** elimina el plugin de Claude Code, luego borra las carpetas de reglas específicas que copiaste manualmente bajo `~/.claude/rules/forge/`.
- **Ruta del instalador manual / CLI:** desde la raíz del repo, previsualiza la eliminación primero:

```bash
node scripts/uninstall.js --dry-run
```

Luego elimina los archivos gestionados por FORGE:

```bash
node scripts/uninstall.js
```

También puedes usar el wrapper del ciclo de vida:

```bash
node scripts/forge.js list-installed
node scripts/forge.js doctor
node scripts/forge.js repair
node scripts/forge.js uninstall --dry-run
```

FORGE solo elimina los archivos registrados en su estado de instalación. No borrará archivos no relacionados que no haya instalado.

Si combinaste métodos, limpia en este orden:

1. Elimina la instalación del plugin de Claude Code.
2. Ejecuta el comando de desinstalación de FORGE desde la raíz del repo para eliminar los archivos gestionados por el estado de instalación.
3. Borra las carpetas de reglas adicionales que copiaste manualmente y ya no necesites.
4. Reinstala una vez, usando un único método.

### Paso 3: Empezar a Usar

```bash
# Las skills son la superficie principal de flujo de trabajo.
# Los nombres de comandos estilo slash existentes siguen funcionando mientras FORGE migra fuera de commands/.

# La instalación por plugin usa la forma canónica con espacio de nombres
/forge:plan "Añadir autenticación de usuario"

# La instalación manual mantiene la forma slash más corta:
# /plan "Añadir autenticación de usuario"

# Ver comandos disponibles
/plugin list forge@forge
```

**¡Listo!** Ahora tienes acceso a 63 agentes, 249 skills y 79 shims de comandos legados.

### Dashboard GUI

Lanza el dashboard de escritorio para explorar visualmente los componentes de FORGE:

```bash
npm run dashboard
# o
python3 ./forge_dashboard.py
```

**Características:**
- Interfaz con pestañas: Agentes, Skills, Comandos, Reglas, Configuración
- Alternancia de tema oscuro/claro
- Personalización de fuente (familia y tamaño)
- Logo del proyecto en el encabezado y la barra de tareas
- Búsqueda y filtrado en todos los componentes

### Los comandos multi-modelo requieren configuración adicional

> ADVERTENCIA: Los comandos `multi-*` **no** están cubiertos por la instalación base del plugin/reglas anterior.
>
> Para usar `/multi-plan`, `/multi-execute`, `/multi-backend`, `/multi-frontend` y `/multi-workflow`, también debes instalar el runtime `ccg-workflow`.
>
> Inicialízalo con `npx ccg-workflow`.
>
> Ese runtime proporciona las dependencias externas que esperan estos comandos, incluyendo:
> - `~/.claude/bin/codeagent-wrapper`
> - `~/.claude/.ccg/prompts/*`
>
> Sin `ccg-workflow`, estos comandos `multi-*` no funcionarán correctamente.

---

## Soporte Multiplataforma

Este plugin ahora es totalmente compatible con **Windows, macOS y Linux**, junto con una integración estrecha en los principales IDEs (Cursor, Zed, OpenCode, Antigravity) y harnesses de CLI. Todos los hooks y scripts han sido reescritos en Node.js para máxima compatibilidad.

### Detección del Gestor de Paquetes

El plugin detecta automáticamente tu gestor de paquetes preferido (npm, pnpm, yarn o bun) con la siguiente prioridad:

1. **Variable de entorno**: `CLAUDE_PACKAGE_MANAGER`
2. **Configuración del proyecto**: `.claude/package-manager.json`
3. **package.json**: campo `packageManager`
4. **Archivo de bloqueo**: Detección desde package-lock.json, yarn.lock, pnpm-lock.yaml o bun.lockb
5. **Configuración global**: `~/.claude/package-manager.json`
6. **Alternativa**: Primer gestor de paquetes disponible

Para establecer tu gestor de paquetes preferido:

```bash
# Mediante variable de entorno
export CLAUDE_PACKAGE_MANAGER=pnpm

# Mediante configuración global
node scripts/setup-package-manager.js --global pnpm

# Mediante configuración del proyecto
node scripts/setup-package-manager.js --project bun

# Detectar configuración actual
node scripts/setup-package-manager.js --detect
```

O usa el comando `/setup-pm` en Claude Code.

### Controles de Ejecución de Hooks

Usa flags de ejecución para ajustar la estrictez o deshabilitar hooks específicos temporalmente:

```bash
# Perfil de estrictez del hook (por defecto: standard)
export FORGE_HOOK_PROFILE=standard

# IDs de hooks separados por coma para deshabilitar
export FORGE_DISABLED_HOOKS="pre:bash:tmux-reminder,post:edit:typecheck"

# Limitar el contexto adicional de SessionStart (por defecto: 8000 caracteres)
export FORGE_SESSION_START_MAX_CHARS=4000

# Deshabilitar completamente el contexto adicional de SessionStart para configuraciones de bajo contexto/modelo local
export FORGE_SESSION_START_CONTEXT=off

# Mantener advertencias de contexto/alcance/bucle pero suprimir estimaciones de costo por tasa de API
export FORGE_CONTEXT_MONITOR_COST_WARNINGS=off
```

Windows PowerShell:

```powershell
[Environment]::SetEnvironmentVariable('FORGE_CONTEXT_MONITOR_COST_WARNINGS', 'off', 'User')
```

---

## Qué Incluye

Este repo es un **plugin de Claude Code** — instálalo directamente o copia componentes manualmente.

```
FORGE/
|-- .claude-plugin/   # Manifiestos del plugin y marketplace
|   |-- plugin.json         # Metadatos del plugin y rutas de componentes
|   |-- marketplace.json    # Catálogo del marketplace para /plugin marketplace add
|
|-- agents/           # 63 subagentes especializados para delegación
|   |-- planner.md           # Planificación de implementación de features
|   |-- architect.md         # Decisiones de diseño del sistema
|   |-- tdd-guide.md         # Desarrollo guiado por pruebas
|   |-- code-reviewer.md     # Revisión de calidad y seguridad
|   |-- security-reviewer.md # Análisis de vulnerabilidades
|   |-- build-error-resolver.md
|   |-- e2e-runner.md        # Pruebas E2E con Playwright
|   |-- refactor-cleaner.md  # Limpieza de código muerto
|   |-- doc-updater.md       # Sincronización de documentación
|   |-- docs-lookup.md       # Búsqueda de documentación/API
|   |-- chief-of-staff.md    # Clasificación de comunicaciones y borradores
|   |-- loop-operator.md     # Ejecución autónoma de bucles
|   |-- harness-optimizer.md # Ajuste de configuración del harness
|   |-- cpp-reviewer.md      # Revisión de código C++
|   |-- cpp-build-resolver.md # Resolución de errores de build en C++
|   |-- fsharp-reviewer.md   # Revisión de código funcional en F#
|   |-- go-reviewer.md       # Revisión de código Go
|   |-- go-build-resolver.md # Resolución de errores de build en Go
|   |-- python-reviewer.md   # Revisión de código Python
|   |-- database-reviewer.md # Revisión de base de datos/Supabase
|   |-- typescript-reviewer.md # Revisión de código TypeScript/JavaScript
|   |-- java-reviewer.md     # Revisión de código Java/Spring Boot
|   |-- java-build-resolver.md # Errores de build en Java/Maven/Gradle
|   |-- kotlin-reviewer.md   # Revisión de código Kotlin/Android/KMP
|   |-- kotlin-build-resolver.md # Errores de build en Kotlin/Gradle
|   |-- harmonyos-app-resolver.md # Desarrollo de apps HarmonyOS/ArkTS
|   |-- rust-reviewer.md     # Revisión de código Rust
|   |-- rust-build-resolver.md # Resolución de errores de build en Rust
|   |-- pytorch-build-resolver.md # Errores de entrenamiento PyTorch/CUDA
|   |-- mle-reviewer.md      # Revisión de pipeline de ML en producción, evaluación, serving y monitoreo
|
|-- skills/           # Definiciones de flujos de trabajo y conocimiento de dominio
|   |-- coding-standards/           # Mejores prácticas por lenguaje
|   |-- clickhouse-io/              # Analytics en ClickHouse, consultas, ingeniería de datos
|   |-- backend-patterns/           # Patrones de API, base de datos, caché
|   |-- frontend-patterns/          # Patrones de React, Next.js
|   |-- frontend-slides/            # Presentaciones HTML y flujos de trabajo de conversión PPTX a web (NUEVO)
|   |-- article-writing/            # Escritura de formato largo con voz propia sin tono genérico de IA (NUEVO)
|   |-- content-engine/             # Contenido social multiplataforma y flujos de reutilización (NUEVO)
|   |-- market-research/            # Investigación de mercado, competidores e inversores con fuentes (NUEVO)
|   |-- investor-materials/         # Pitch decks, one-pagers, memos y modelos financieros (NUEVO)
|   |-- investor-outreach/          # Alcance personalizado de fundraising y seguimiento (NUEVO)
|   |-- continuous-learning/        # Patrón legado v1 de extracción con hook Stop
|   |-- continuous-learning-v2/     # Aprendizaje basado en instintos con puntuación de confianza
|   |-- iterative-retrieval/        # Refinamiento progresivo de contexto para subagentes
|   |-- strategic-compact/          # Sugerencias de compactación manual (Guía Extensa)
|   |-- tdd-workflow/               # Metodología TDD
|   |-- security-review/            # Lista de verificación de seguridad
|   |-- eval-harness/               # Evaluación de bucle de verificación (Guía Extensa)
|   |-- verification-loop/          # Verificación continua (Guía Extensa)
|   |-- videodb/                   # Video y audio: ingestión, búsqueda, edición, generación, streaming (NUEVO)
|   |-- golang-patterns/            # Modismos y mejores prácticas de Go
|   |-- golang-testing/             # Patrones de pruebas en Go, TDD, benchmarks
|   ...
|
|-- commands/         # Compatibilidad mantenida de entradas slash; preferir skills/
|-- rules/            # Directrices de cumplimiento obligatorio (copiar a ~/.claude/rules/forge/)
|-- hooks/            # Automatizaciones basadas en eventos
|-- scripts/          # Scripts Node.js multiplataforma (NUEVO)
|-- tests/            # Suite de pruebas (NUEVO)
|-- contexts/         # Inyección dinámica de contexto en el system prompt
|-- examples/         # Configuraciones y sesiones de ejemplo
|-- mcp-configs/      # Configuraciones de servidores MCP
|-- forge_dashboard.py  # Dashboard GUI de escritorio (Tkinter)
|-- marketplace.json  # Configuración del marketplace autoalojado
```

---

## Herramientas del Ecosistema

### Creador de Skills

Genera skills de Claude Code desde tu repositorio con el comando `/skill-create`, mediante análisis local y sin servicios externos:

```bash
/skill-create                    # Analizar el repo actual
/skill-create --instincts        # También generar instintos para continuous-learning-v2
```

Esto analiza tu historial de git localmente y crea:
- **Archivos SKILL.md** - Skills listas para usar en Claude Code
- **Colecciones de instintos** - Para continuous-learning-v2
- **Extracción de patrones** - Aprende de tu historial de commits

### Forge Shield — Auditor de Seguridad

> 1282 pruebas, 98% de cobertura, 102 reglas de análisis estático.

Analiza tu configuración de Claude Code en busca de vulnerabilidades, configuraciones incorrectas y riesgos de inyección.

```bash
# Análisis rápido (sin instalación necesaria)
npx forge-shield scan

# Corrección automática de problemas seguros
npx forge-shield scan --fix

# Análisis profundo con tres agentes Opus 4.6
npx forge-shield scan --opus --stream

# Generar configuración segura desde cero
npx forge-shield init
```

**Qué analiza:** CLAUDE.md, settings.json, configuraciones de MCP, hooks, definiciones de agentes y skills en 5 categorías — detección de secretos (14 patrones), auditoría de permisos, análisis de inyección en hooks, perfilado de riesgo de servidores MCP y revisión de configuración de agentes.

**El flag `--opus`** ejecuta tres agentes Claude Opus 4.6 en un pipeline red-team/blue-team/auditor. El atacante encuentra cadenas de exploits, el defensor evalúa las protecciones y el auditor sintetiza ambos en una evaluación de riesgo priorizada. Razonamiento adversarial, no solo coincidencia de patrones.

**Formatos de salida:** Terminal (color graduado A-F), JSON (pipelines de CI), Markdown, HTML. Código de salida 2 en hallazgos críticos para puertas de build.

Usa `/security-scan` en Claude Code para ejecutarlo, o añádelo a CI con la [GitHub Action](https://github.com/carlcastanas/forge-shield).

[GitHub](https://github.com/carlcastanas/forge-shield) | [npm](https://www.npmjs.com/package/forge-shield)

### Aprendizaje Continuo v2

El sistema de aprendizaje basado en instintos aprende tus patrones automáticamente:

```bash
/instinct-status        # Ver instintos aprendidos con confianza
/instinct-import <file> # Importar instintos de otros
/instinct-export        # Exportar tus instintos para compartir
/evolve                 # Agrupar instintos relacionados en skills
```

Consulta `skills/continuous-learning-v2/` para la documentación completa.
Mantén `continuous-learning/` solo cuando quieras explícitamente el flujo legado v1 de skills aprendidas con hook Stop.

---

## Requisitos

### Versión del CLI de Claude Code

**Versión mínima: v2.1.0 o posterior**

Este plugin requiere Claude Code CLI v2.1.0+ debido a cambios en cómo el sistema de plugins gestiona los hooks.

Comprueba tu versión:
```bash
claude --version
```

### Importante: Comportamiento de Carga Automática de Hooks

> ADVERTENCIA: **Para Contribuidores:** NO añadas un campo `"hooks"` a `.claude-plugin/plugin.json`. Esto está reforzado por una prueba de regresión.

Claude Code v2.1+ **carga automáticamente** `hooks/hooks.json` de cualquier plugin instalado por convención. Declararlo explícitamente en `plugin.json` provoca un error de detección de duplicados:

```
Duplicate hooks file detected: ./hooks/hooks.json resolves to already-loaded file
```

**Historial:** Esto ha causado ciclos repetidos de corrección/reversión en este repo ([#29](https://github.com/carlcastanas/forge/issues/29), [#52](https://github.com/carlcastanas/forge/issues/52), [#103](https://github.com/carlcastanas/forge/issues/103)). El comportamiento cambió entre versiones de Claude Code, generando confusión. Ahora tenemos una prueba de regresión para prevenir que se reintroduzca.

---

## Instalación

### Opción 1: Instalar como Plugin (Recomendado)

La forma más fácil de usar este repo — instálalo como plugin de Claude Code:

```bash
# Añadir este repo como marketplace
/plugin marketplace add https://github.com/carlcastanas/forge

# Instalar el plugin
/plugin install forge@forge
```

O añade directamente a tu `~/.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "forge": {
      "source": {
        "source": "github",
        "repo": "carlcastanas/FORGE"
      }
    }
  },
  "enabledPlugins": {
    "forge@forge": true
  }
}
```

Esto te da acceso instantáneo a todos los comandos, agentes, skills y hooks.

> **Nota:** El sistema de plugins de Claude Code no permite distribuir `rules` mediante plugins ([limitación upstream](https://code.claude.com/docs/en/plugins-reference)). Necesitas instalar las reglas manualmente:
>
> ```bash
> # Clonar el repo primero
> git clone https://github.com/carlcastanas/forge.git
> cd FORGE
>
> # Opción A: Reglas a nivel de usuario (se aplican a todos los proyectos)
> mkdir -p ~/.claude/rules/forge
> cp -r rules/common ~/.claude/rules/forge/
> cp -r rules/typescript ~/.claude/rules/forge/   # elige tu stack
> cp -r rules/python ~/.claude/rules/forge/
> cp -r rules/golang ~/.claude/rules/forge/
> cp -r rules/php ~/.claude/rules/forge/
>
> # Opción B: Reglas a nivel de proyecto (se aplican solo al proyecto actual)
> mkdir -p .claude/rules/forge
> cp -r rules/common .claude/rules/forge/
> cp -r rules/typescript .claude/rules/forge/     # elige tu stack
> ```

---

### Opción 2: Instalación Manual

Si prefieres control manual sobre lo que se instala:

```bash
# Clonar el repo
git clone https://github.com/carlcastanas/forge.git
cd FORGE

# Copiar agentes a tu configuración de Claude
cp agents/*.md ~/.claude/agents/

# Copiar directorios de reglas (common + específicos del lenguaje)
mkdir -p ~/.claude/rules/forge
cp -r rules/common ~/.claude/rules/forge/
cp -r rules/typescript ~/.claude/rules/forge/   # elige tu stack
cp -r rules/python ~/.claude/rules/forge/
cp -r rules/golang ~/.claude/rules/forge/
cp -r rules/php ~/.claude/rules/forge/
cp -r rules/arkts ~/.claude/rules/forge/

# Instalar skills con el instalador consciente de migraciones.
# Conserva skills del usuario, informa conflictos y evita sobrescribirlos.
node scripts/install-apply.js --target claude --modules workflow-quality

# Opcional: instalar skills concretas solo cuando las necesites.
node scripts/install-apply.js --target claude --skills search-first
# node scripts/install-apply.js --target claude --skills django-patterns,django-tdd

# Opcional: mantener compatibilidad con entradas slash durante la migración
mkdir -p ~/.claude/commands
cp commands/*.md ~/.claude/commands/

# Los shims retirados están en legacy-command-shims/commands/.
# Copia archivos individuales de ahí solo si todavía necesitas nombres viejos como /tdd.
```

#### Instalar hooks

No copies el `hooks/hooks.json` del repo directamente en `~/.claude/settings.json` ni en `~/.claude/hooks/hooks.json`. Ese archivo está orientado al plugin/repo y está pensado para instalarse mediante el instalador de FORGE o cargarse como plugin, por lo que la copia directa no es una ruta de instalación manual soportada.

Usa el instalador para instalar solo el runtime de hooks de Claude de forma que las rutas de comandos se reescriban correctamente:

```bash
# macOS / Linux
bash ./install.sh --target claude --modules hooks-runtime
```

```powershell
# Windows PowerShell
pwsh -File .\install.ps1 --target claude --modules hooks-runtime
```

Eso escribe los hooks resueltos en `~/.claude/hooks/hooks.json` y deja intacto cualquier `~/.claude/settings.json` existente.

Si instalaste FORGE mediante `/plugin install`, no copies esos hooks en `settings.json`. Claude Code v2.1+ ya carga automáticamente el `hooks/hooks.json` del plugin, y duplicarlos en `settings.json` provoca ejecución duplicada y conflictos de hooks multiplataforma.

Nota para Windows: el directorio de configuración de Claude es `%USERPROFILE%\\.claude`, no `~/claude`.

#### Configurar MCPs

Las instalaciones de plugin de Claude intencionalmente no habilitan automáticamente las definiciones de servidores MCP empaquetadas en FORGE. Esto evita nombres de herramientas MCP demasiado largos en puertas de acceso estrictas de terceros mientras mantiene la configuración manual de MCP disponible.

Usa el comando `/mcp` de Claude Code o la configuración de MCP gestionada por CLI para cambios en tiempo de ejecución de servidores MCP de Claude Code. Usa `/mcp` para deshabilitar en el runtime de Claude Code; Claude Code persiste esas opciones en `~/.claude.json`.

Para acceso a MCP local del repo, copia las definiciones de servidor MCP deseadas de `mcp-configs/mcp-servers.json` en un `.mcp.json` con alcance de proyecto.

Si ya ejecutas tus propias copias de los MCPs empaquetados en FORGE, establece:

```bash
export FORGE_DISABLED_MCPS="github,context7,exa,playwright,sequential-thinking,memory"
```

Los flujos de instalación y sincronización de Codex gestionados por FORGE omitirán o eliminarán esos servidores empaquetados en lugar de volver a añadir duplicados. `FORGE_DISABLED_MCPS` es un filtro de instalación/sincronización de FORGE, no un interruptor en tiempo de ejecución de Claude Code.

**Importante:** Reemplaza los marcadores `YOUR_*_HERE` con tus claves de API reales.

---

## Conceptos Clave

### Agentes

Los subagentes manejan tareas delegadas con alcance limitado. Ejemplo:

```markdown
---
name: code-reviewer
description: Reviews code for quality, security, and maintainability
tools: ["Read", "Grep", "Glob", "Bash"]
model: opus
---

You are a senior code reviewer...
```

### Skills

Las skills son la superficie principal de flujo de trabajo. Pueden invocarse directamente, sugerirse automáticamente y ser reutilizadas por agentes. FORGE sigue enviando `commands/` mantenidas durante la migración, mientras que los shims de nombres cortos retirados están en `legacy-command-shims/` solo para opt-in explícito. El nuevo desarrollo de flujos de trabajo debe aterrizar primero en `skills/`.

```markdown
# Flujo de Trabajo TDD

1. Define las interfaces primero
2. Escribe pruebas que fallen (ROJO)
3. Implementa el código mínimo (VERDE)
4. Refactoriza (MEJORAR)
5. Verifica 80%+ de cobertura
```

### Hooks

Los hooks se disparan en eventos de herramientas. Ejemplo — advertir sobre console.log:

```json
{
  "matcher": "tool == \"Edit\" && tool_input.file_path matches \"\\\\.(ts|tsx|js|jsx)$\"",
  "hooks": [{
    "type": "command",
    "command": "#!/bin/bash\ngrep -n 'console\\.log' \"$file_path\" && echo '[Hook] Remove console.log' >&2"
  }]
}
```

### Reglas

Las reglas son directrices de cumplimiento obligatorio, organizadas en `common/` (agnóstico al lenguaje) + directorios específicos por lenguaje:

```
rules/
  common/          # Principios universales (siempre instalar)
  typescript/      # Patrones y herramientas específicos de TS/JS
  python/          # Patrones y herramientas específicos de Python
  golang/          # Patrones y herramientas específicos de Go
  swift/           # Patrones y herramientas específicos de Swift
  php/             # Patrones y herramientas específicos de PHP
  arkts/           # Patrones y restricciones de HarmonyOS / ArkTS
```

Consulta [`rules/README.md`](../../rules/README.md) para detalles de instalación y estructura.

---

## ¿Qué Agente Debo Usar?

¿No sabes por dónde empezar? Usa esta referencia rápida. Las skills son la superficie canónica de flujo de trabajo; las entradas slash mantenidas siguen disponibles para flujos de trabajo orientados a comandos.

| Quiero... | Usar esta superficie | Agente usado |
|-----------|---------------------|--------------|
| Planificar una nueva feature | `/forge:plan "Añadir auth"` | planner |
| Diseñar arquitectura del sistema | `/forge:plan` + agente architect | architect |
| Escribir código con pruebas primero | skill `tdd-workflow` | tdd-guide |
| Revisar código que acabo de escribir | `/code-review` | code-reviewer |
| Corregir un build fallido | `/build-fix` | build-error-resolver |
| Ejecutar pruebas end-to-end | skill `e2e-testing` | e2e-runner |
| Encontrar vulnerabilidades de seguridad | `/security-scan` | security-reviewer |
| Eliminar código muerto | `/refactor-clean` | refactor-cleaner |
| Actualizar documentación | `/update-docs` | doc-updater |
| Revisar código Go | `/go-review` | go-reviewer |
| Revisar código Python | `/python-review` | python-reviewer |
| Revisar código F# | *(invocar `fsharp-reviewer` directamente)* | fsharp-reviewer |
| Revisar código TypeScript/JavaScript | *(invocar `typescript-reviewer` directamente)* | typescript-reviewer |
| Desarrollar apps HarmonyOS | *(invocar `harmonyos-app-resolver` directamente)* | harmonyos-app-resolver |
| Auditar consultas de base de datos | *(delegado automáticamente)* | database-reviewer |
| Revisar cambios de ML en producción | skill `mle-workflow` + agente `mle-reviewer` | mle-reviewer |

### Flujos de Trabajo Comunes

Las formas slash a continuación se muestran donde siguen siendo parte de la superficie de comandos mantenida. Los shims de nombres cortos retirados como `/tdd` y `/eval` están en `legacy-command-shims/` solo para opt-in explícito.

**Empezando una nueva feature:**
```
/forge:plan "Añadir autenticación de usuario con OAuth"
                                              → planner crea el blueprint de implementación
skill tdd-workflow                            → tdd-guide refuerza escribir pruebas primero
/code-review                                  → code-reviewer verifica tu trabajo
```

**Corrigiendo un bug:**
```
skill tdd-workflow                            → tdd-guide: escribe una prueba que falle y lo reproduzca
                                              → implementa la corrección, verifica que la prueba pase
/code-review                                  → code-reviewer: detecta regresiones
```

**Preparando para producción:**
```
/security-scan                                → security-reviewer: auditoría OWASP Top 10
skill e2e-testing                             → e2e-runner: pruebas de flujos de usuario críticos
/test-coverage                                → verificar 80%+ de cobertura
```

---

## Preguntas Frecuentes

<details>
<summary><b>¿Cómo veo qué agentes/comandos están instalados?</b></summary>

```bash
/plugin list forge@forge
```

Muestra todos los agentes, comandos y skills disponibles del plugin.
</details>

<details>
<summary><b>Mis hooks no funcionan / Veo errores de "Duplicate hooks file"</b></summary>

Este es el problema más común. **NO añadas un campo `"hooks"` a `.claude-plugin/plugin.json`.** Claude Code v2.1+ carga automáticamente `hooks/hooks.json` de los plugins instalados. Declararlo explícitamente provoca errores de detección de duplicados. Consulta [#29](https://github.com/carlcastanas/forge/issues/29), [#52](https://github.com/carlcastanas/forge/issues/52), [#103](https://github.com/carlcastanas/forge/issues/103).
</details>

<details>
<summary><b>¿Puedo usar FORGE con Claude Code en un endpoint de API personalizado o un gateway de modelos?</b></summary>

Sí. FORGE no tiene configuraciones de transporte alojadas en Anthropic. Se ejecuta localmente a través de la superficie CLI/plugin normal de Claude Code, por lo que funciona con:

- Claude Code alojado en Anthropic
- Configuraciones de gateway oficial de Claude Code usando `ANTHROPIC_BASE_URL` y `ANTHROPIC_AUTH_TOKEN`
- Endpoints personalizados compatibles que hablen la API de Anthropic que espera Claude Code

Ejemplo mínimo:

```bash
export ANTHROPIC_BASE_URL=https://your-gateway.example.com
export ANTHROPIC_AUTH_TOKEN=your-token
claude
```

Si tu gateway reasigna nombres de modelos, configúralo en Claude Code en lugar de en FORGE. Los hooks, skills, comandos y reglas de FORGE son agnósticos al proveedor de modelos una vez que el CLI `claude` ya funciona.

Referencias oficiales:
- [Documentación del gateway LLM de Claude Code](https://docs.anthropic.com/en/docs/claude-code/llm-gateway)
- [Documentación de configuración de modelos de Claude Code](https://docs.anthropic.com/en/docs/claude-code/model-config)

</details>

<details>
<summary><b>Mi ventana de contexto se está reduciendo / Claude se queda sin contexto</b></summary>

Demasiados servidores MCP consumen tu contexto. Cada descripción de herramienta MCP consume tokens de tu ventana de 200k, potencialmente reduciéndola a ~70k. El contexto de SessionStart está limitado a 8000 caracteres por defecto; redúcelo con `FORGE_SESSION_START_MAX_CHARS=4000` o desactívalo con `FORGE_SESSION_START_CONTEXT=off` para configuraciones de bajo contexto o modelo local.

**Solución:** Deshabilita los MCPs no utilizados desde Claude Code con `/mcp`. Claude Code escribe esas opciones en tiempo de ejecución en `~/.claude.json`; `.claude/settings.json` y `.claude/settings.local.json` no son interruptores confiables para servidores MCP ya cargados.

Mantén menos de 10 MCPs habilitados y menos de 80 herramientas activas.
</details>

<details>
<summary><b>¿Puedo usar solo algunos componentes (por ejemplo, solo los agentes)?</b></summary>

Sí. Usa la Opción 2 (instalación manual) y copia solo lo que necesites:

```bash
# Solo agentes
cp agents/*.md ~/.claude/agents/

# Solo reglas
mkdir -p ~/.claude/rules/forge/
cp -r rules/common ~/.claude/rules/forge/
```

Cada componente es completamente independiente.
</details>

<details>
<summary><b>¿Funciona con Cursor / OpenCode / Codex / Antigravity / GitHub Copilot?</b></summary>

Sí. FORGE es multiplataforma:
- **Cursor**: Configuraciones pre-traducidas en `.cursor/`. Consulta [Soporte para Cursor IDE](#soporte-para-cursor-ide).
- **Gemini CLI**: Soporte experimental local al proyecto mediante `.gemini/GEMINI.md` y conexiones compartidas del instalador.
- **OpenCode**: Soporte completo del plugin en `.opencode/`. Consulta [Soporte para OpenCode](#soporte-para-opencode).
- **Codex**: Soporte de primera clase para la app macOS y CLI, con guardias de deriva del adaptador y fallback de SessionStart. Consulta PR [#257](https://github.com/carlcastanas/forge/pull/257).
- **GitHub Copilot (VS Code)**: Capa de instrucciones y prompts mediante `.github/copilot-instructions.md`, `.vscode/settings.json` y `.github/prompts/`. Consulta [Soporte para GitHub Copilot](#soporte-para-github-copilot).
- **Antigravity**: Configuración estrechamente integrada para flujos de trabajo, skills y reglas aplanadas en `.agents/`. Consulta la [Guía de Antigravity](../ANTIGRAVITY-GUIDE.md).
- **JoyCode / CodeBuddy**: Adaptadores de instalación selectiva locales al proyecto para comandos, agentes, skills y reglas aplanadas. Consulta la [Guía del Adaptador JoyCode](../JOYCODE-GUIDE.md).
- **Qwen CLI**: Adaptador de instalación selectiva en el directorio home para comandos, agentes, skills, reglas y configuración de Qwen. Consulta la [Guía del Adaptador Qwen CLI](../QWEN-GUIDE.md).
- **Zed**: Adaptador de instalación selectiva local al proyecto para `.zed/settings.json`, reglas aplanadas, comandos, agentes y skills.
- **Harnesses no nativos**: Ruta de respaldo manual para Grok e interfaces similares. Consulta la [Guía de Adaptación Manual](../MANUAL-ADAPTATION-GUIDE.md).
- **Claude Code**: Nativo — este es el objetivo principal.
</details>

<details>
<summary><b>¿Cómo contribuyo con una nueva skill o agente?</b></summary>

Consulta [CONTRIBUTING.md](CONTRIBUTING.md). La versión corta:
1. Haz fork del repo
2. Crea tu skill en `skills/tu-nombre-de-skill/SKILL.md` (con frontmatter YAML)
3. O crea un agente en `agents/tu-agente.md`
4. Envía un PR con una descripción clara de qué hace y cuándo usarlo
</details>

---

## Ejecutar Pruebas

El plugin incluye una suite de pruebas completa:

```bash
# Ejecutar todas las pruebas
node tests/run-all.js

# Ejecutar archivos de prueba individuales
node tests/lib/utils.test.js
node tests/lib/package-manager.test.js
node tests/hooks/hooks.test.js
```

---

## Contribuir

**Las contribuciones son bienvenidas y fomentadas.**

Este repo está pensado para ser un recurso comunitario. Si tienes:
- Agentes o skills útiles
- Hooks ingeniosos
- Mejores configuraciones de MCP
- Reglas mejoradas

¡Contribuye! Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para las directrices.

### Ideas para Contribuciones

- Skills específicas de lenguaje (Rust, C#, Kotlin, Java) — Go, Python, Perl, Swift, TypeScript y HarmonyOS/ArkTS ya están incluidos
- Configs específicas de frameworks (Rails, FastAPI) — Django, NestJS, Spring Boot y Laravel ya están incluidos
- Agentes de DevOps (Kubernetes, Terraform, AWS, Docker)
- Estrategias de prueba (diferentes frameworks, regresión visual)
- Conocimiento de dominio específico (ML, ingeniería de datos, móvil)

### Notas del Ecosistema Comunitario

Estos no están empaquetados con FORGE y no son auditados por este repo, pero vale la pena conocerlos si estás explorando el ecosistema más amplio de skills de Claude Code:

- [claude-seo](https://github.com/AgriciDaniel/claude-seo) — Colección de skills y agentes centrados en SEO
- [claude-ads](https://github.com/AgriciDaniel/claude-ads) — Colección de flujos de trabajo de auditoría de anuncios y crecimiento de pago
- [claude-cybersecurity](https://github.com/AgriciDaniel/claude-cybersecurity) — Colección de skills y agentes orientados a seguridad

---

## Soporte para Cursor IDE

FORGE proporciona soporte para Cursor IDE con hooks, reglas, agentes, skills, comandos y configuraciones de MCP adaptados para el diseño de proyecto de Cursor.

### Inicio Rápido (Cursor)

```bash
# macOS/Linux
./install.sh --target cursor typescript
./install.sh --target cursor python golang swift php
```

```powershell
# Windows PowerShell
.\install.ps1 --target cursor typescript
.\install.ps1 --target cursor python golang swift php
```

### Qué Incluye

| Componente | Cantidad | Detalles |
|------------|---------|---------|
| Eventos de Hook | 15 | sessionStart, beforeShellExecution, afterFileEdit, beforeMCPExecution, beforeSubmitPrompt, y 10 más |
| Scripts de Hook | 16 | Scripts Node.js delgados que delegan a `scripts/hooks/` mediante adaptador compartido |
| Reglas | 34 | 9 comunes (alwaysApply) + 25 específicas de lenguaje (TypeScript, Python, Go, Swift, PHP) |
| Agentes | 48 | `.cursor/agents/forge-*.md` cuando se instala; con prefijo para evitar colisiones con agentes de usuario o marketplace |
| Skills | Compartidas + Empaquetadas | `.cursor/skills/` para adiciones traducidas |
| Comandos | Compartidos | `.cursor/commands/` si se instala |
| Configuración MCP | Compartida | `.cursor/mcp.json` si se instala |

### Notas de Carga en Cursor

FORGE no instala el `AGENTS.md` raíz en `.cursor/`. Cursor trata los archivos `AGENTS.md` anidados como contexto de directorio, por lo que copiar la identidad del repo de FORGE en un proyecto host contaminaría ese proyecto.

El comportamiento de carga nativo de Cursor puede variar según la versión. FORGE instala agentes como `.cursor/agents/forge-*.md`; si tu versión de Cursor no expone los agentes del proyecto, esos archivos siguen funcionando como definiciones de referencia explícitas en lugar de contexto de prompt global oculto.

### Arquitectura de Hooks (Patrón de Adaptador DRY)

Cursor tiene **más eventos de hook que Claude Code** (20 vs 8). El módulo `.cursor/hooks/adapter.js` transforma el JSON de stdin de Cursor al formato de Claude Code, permitiendo reutilizar los `scripts/hooks/*.js` existentes sin duplicación.

```
JSON de stdin de Cursor → adapter.js → transforma → scripts/hooks/*.js
                                                    (compartido con Claude Code)
```

Hooks clave:
- **beforeShellExecution** — Bloquea servidores de desarrollo fuera de tmux (exit 2), revisión de git push
- **afterFileEdit** — Auto-formato + verificación de TypeScript + advertencia de console.log
- **beforeSubmitPrompt** — Detecta secretos (sk-, ghp_, patrones AKIA) en prompts
- **beforeTabFileRead** — Bloquea a Tab de leer archivos .env, .key, .pem (exit 2)
- **beforeMCPExecution / afterMCPExecution** — Registro de auditoría de MCP

### Formato de Reglas

Las reglas de Cursor usan frontmatter YAML con `description`, `globs` y `alwaysApply`:

```yaml
---
description: "TypeScript coding style extending common rules"
globs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]
alwaysApply: false
---
```

---

## Soporte para Codex macOS App + CLI

FORGE proporciona **soporte de primera clase para Codex** tanto para la app macOS como para el CLI, con una configuración de referencia, un suplemento AGENTS.md específico de Codex y skills compartidas.

### Inicio Rápido (Codex App + CLI)

```bash
# Ejecutar Codex CLI en el repo — AGENTS.md y .codex/ se detectan automáticamente
codex

# Configuración automática: sincronizar activos de FORGE (AGENTS.md, skills, servidores MCP) en ~/.codex
npm install && bash scripts/sync-forge-to-codex.sh

# O manualmente: copiar la configuración de referencia a tu directorio home
cp .codex/config.toml ~/.codex/config.toml
```

El script de sincronización fusiona de forma segura los servidores MCP de FORGE en tu `~/.codex/config.toml` existente usando una estrategia **solo de adición** — nunca elimina ni modifica tus servidores existentes. Ejecuta con `--dry-run` para previsualizar los cambios, o `--update-mcp` para forzar la actualización de los servidores FORGE a la configuración recomendada más reciente.

### Qué Incluye

| Componente | Cantidad | Detalles |
|------------|---------|---------|
| Configuración | 1 | `.codex/config.toml` — aprobaciones de nivel superior/sandbox/web_search, servidores MCP, notificaciones, perfiles |
| AGENTS.md | 2 | Raíz (universal) + `.codex/AGENTS.md` (suplemento específico de Codex) |
| Skills | 32 | `.agents/skills/` — SKILL.md + agents/openai.yaml por skill |
| Servidores MCP | 6 | GitHub, Context7, Exa, Memory, Playwright, Sequential Thinking |
| Perfiles | 2 | `strict` (sandbox de solo lectura) y `yolo` (auto-aprobación completa) |
| Roles de Agente | 3 | `.codex/agents/` — explorer, reviewer, docs-researcher |

---

## Soporte para OpenCode

FORGE proporciona **soporte completo para OpenCode** incluyendo plugins y hooks.

### Inicio Rápido

```bash
# Instalar OpenCode
npm install -g opencode

# Ejecutar en la raíz del repositorio
opencode
```

La configuración se detecta automáticamente desde `.opencode/opencode.json`.

### Paridad de Características

| Característica | Claude Code         | OpenCode | Estado |
|----------------|---------------------|----------|--------|
| Agentes | 63 agentes | 12 agentes | **Claude Code lidera** |
| Comandos | 79 comandos | 35 comandos | **Claude Code lidera** |
| Skills | 249 skills | 37 skills | **Claude Code lidera** |
| Hooks | 8 tipos de eventos | 11 eventos | **¡OpenCode tiene más!** |
| Reglas | 29 reglas | 13 instrucciones | **Claude Code lidera** |
| Servidores MCP | 14 servidores | Completo | **Paridad completa** |
| Herramientas Personalizadas | Mediante hooks | 6 nativas | **OpenCode es mejor** |

---

## Soporte para GitHub Copilot

FORGE proporciona **soporte para GitHub Copilot** para VS Code mediante el sistema nativo de archivos de instrucciones y prompts de Copilot Chat — sin herramientas adicionales necesarias.

### Qué Incluye

| Componente | Archivo | Propósito |
|------------|---------|-----------|
| Instrucciones principales | `.github/copilot-instructions.md` | Reglas siempre cargadas: estilo de código, seguridad, pruebas, flujo de git |
| Configuración de VS Code | `.vscode/settings.json` | Archivos de instrucciones por tarea para generación de código, pruebas y mensajes de commit |
| Prompt de plan | `.github/prompts/plan.prompt.md` | Planificación de implementación por fases |
| Prompt de TDD | `.github/prompts/tdd.prompt.md` | Ciclo Rojo-Verde-Mejorar |
| Prompt de revisión de seguridad | `.github/prompts/security-review.prompt.md` | Análisis de seguridad profundo alineado con OWASP |
| Prompt de corrección de build | `.github/prompts/build-fix.prompt.md` | Resolución sistemática de errores de build y CI |
| Prompt de refactorización | `.github/prompts/refactor.prompt.md` | Limpieza de código muerto y simplificación |

### Inicio Rápido (GitHub Copilot)

Los archivos ya están en su lugar — abre cualquier repo que contenga este proyecto y GitHub Copilot Chat recogerá automáticamente `.github/copilot-instructions.md`.
El `.vscode/settings.json` confirmado habilita `chat.promptFiles` para que VS Code pueda cargar los prompts reutilizables de `.github/prompts/`.

Para usar los prompts de flujo de trabajo en Copilot Chat:
1. Abre el panel de Copilot Chat en VS Code.
2. Haz clic en el icono de **clip / adjuntar** y selecciona **Prompt...**, o escribe `/` y elige un prompt.
3. Selecciona el prompt (por ejemplo, `plan`, `tdd`, `security-review`).

---

## Compatibilidad Cross-Tool

FORGE es el **primer plugin que maximiza todas las principales herramientas de codificación con IA**. Así se compara cada harness:

| Característica | Claude Code           | Cursor IDE | Codex CLI | OpenCode | GitHub Copilot |
|----------------|-----------------------|------------|-----------|----------|----------------|
| **Agentes** | 63                    | Compartidos (AGENTS.md) | Compartidos (AGENTS.md) | 12 | N/A |
| **Comandos** | 79                    | Compartidos | Basados en instrucciones | 35 | 5 prompts |
| **Skills** | 249                   | Compartidas | 10 (formato nativo) | 37 | Mediante instrucciones |
| **Eventos de Hook** | 8 tipos               | 15 tipos | Ninguno aún | 11 tipos | Ninguno |
| **Scripts de Hook** | 20+ scripts           | 16 scripts (adaptador DRY) | N/A | Hooks de plugin | N/A |
| **Reglas** | 34 (común + lenguaje) | 34 (frontmatter YAML) | Basadas en instrucciones | 13 instrucciones | 1 archivo siempre activo |
| **Herramientas Personalizadas** | Mediante hooks        | Mediante hooks | N/A | 6 herramientas nativas | N/A |
| **Servidores MCP** | 14                    | Compartidos (mcp.json) | 7 (fusión automática vía parser TOML) | Completo | N/A |
| **Formato de Configuración** | settings.json         | hooks.json + rules/ | config.toml | opencode.json | copilot-instructions.md + settings.json |
| **Archivo de Contexto** | CLAUDE.md + AGENTS.md | AGENTS.md | AGENTS.md | AGENTS.md | copilot-instructions.md |

---

## Optimización de Tokens

El uso de Claude Code puede ser costoso si no gestionas el consumo de tokens. Estas configuraciones reducen significativamente los costos sin sacrificar calidad.

### Configuración Recomendada

Añade a `~/.claude/settings.json`:

```json
{
  "model": "sonnet",
  "env": {
    "MAX_THINKING_TOKENS": "10000",
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "50"
  }
}
```

| Configuración | Por defecto | Recomendado | Impacto |
|--------------|-------------|-------------|---------|
| `model` | opus | **sonnet** | ~60% de reducción de costos; maneja más del 80% de las tareas de codificación |
| `MAX_THINKING_TOKENS` | 31,999 | **10,000** | ~70% de reducción en el costo de pensamiento oculto por solicitud |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | 95 | **50** | Compacta antes — mejor calidad en sesiones largas |
| `FORGE_CONTEXT_MONITOR_COST_WARNINGS` | on | **off para suscriptores** | Suprime las advertencias de estimación de tasa de API frente al agente manteniendo las advertencias de contexto/alcance/bucle |

Cambia a Opus solo cuando necesites razonamiento arquitectónico profundo:
```
/model opus
```

### Comandos del Flujo de Trabajo Diario

| Comando | Cuándo usarlo |
|---------|---------------|
| `/model sonnet` | Por defecto para la mayoría de las tareas |
| `/model opus` | Arquitectura compleja, depuración, razonamiento profundo |
| `/clear` | Entre tareas no relacionadas (gratis, restablecimiento instantáneo) |
| `/compact` | En puntos de quiebre lógicos de tareas |
| `/cost` | Monitorear el gasto de tokens durante la sesión |

### Compactación Estratégica

La skill `strategic-compact` (incluida en este plugin) sugiere `/compact` en puntos de quiebre lógicos en lugar de depender de la auto-compactación al 95% del contexto.

**Cuándo compactar:**
- Después de investigación/exploración, antes de la implementación
- Después de completar un hito, antes de empezar el siguiente
- Después de depurar, antes de continuar con el trabajo de features
- Después de un enfoque fallido, antes de probar uno nuevo

**Cuándo NO compactar:**
- A mitad de la implementación (perderás nombres de variables, rutas de archivos, estado parcial)

---

## ADVERTENCIA: Notas Importantes

### Optimización de Tokens

¿Alcanzando los límites diarios? Consulta la **[Guía de Optimización de Tokens](../token-optimization.md)** para configuraciones recomendadas y consejos de flujo de trabajo.

Ganancias rápidas:

```json
// ~/.claude/settings.json
{
  "model": "sonnet",
  "env": {
    "MAX_THINKING_TOKENS": "10000",
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "50",
    "CLAUDE_CODE_SUBAGENT_MODEL": "haiku"
  }
}
```

### Personalización

Estas configuraciones funcionan para mi flujo de trabajo. Deberías:
1. Empezar con lo que resuene
2. Modificar para tu stack
3. Eliminar lo que no uses
4. Añadir tus propios patrones

---

## Proyectos de la Comunidad

Proyectos construidos sobre o inspirados en FORGE:

| Proyecto | Descripción |
|----------|-------------|
| [EVC](https://github.com/SaigonXIII/evc) | Espacio de trabajo para agentes de marketing — 42 comandos para operadores de contenido, gobernanza de marca y publicación multicanal. [Resumen visual](https://saigonxiii.github.io/evc). |
| [trading-skills](https://github.com/VictorVVedtion/trading-skills) | 68 skills de Claude Code temáticas de trading con prompts de revisión pre-trade y puertas de riesgo inspiradas en operadores de mercado. |

¿Construiste algo con FORGE? Abre un PR para añadirlo aquí.

---

## Historial de Estrellas

[![Star History Chart](https://api.star-history.com/svg?repos=carlcastanas/forge&type=Date)](https://star-history.com/#carlcastanas/forge&Date)

---

## Enlaces

- **Guía Resumida (Empieza aquí):** [La Guía Resumida de FORGE](/status/2012378465664745795)
- **Guía Extensa (Avanzado):** [La Guía Extensa de FORGE](/status/2014040193557471352)
- **Guía de Seguridad:** [Guía de Seguridad](the-security-guide.md) | [Hilo](/status/2033263813387223421)
- **Seguir:**

---

## Licencia

MIT - Úsalo libremente, modifícalo según tus necesidades, contribuye de vuelta si puedes.

---

**Dale una estrella al repo si te ayuda. Lee las dos guías. Construye algo grandioso.**
