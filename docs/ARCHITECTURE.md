# System Architecture

Este documento descreve a topologia de pastas, arquitetura de software e design estrutural para o **TeamSpeak 6 Web Client**.

## 1. Topologia do Monorepo

Adotaremos um monorepo real (ex: usando `npm workspaces` ou `pnpm workspaces`) para separar claramente as responsabilidades de negócio e evitar dependências circulares.

```text
teamspeak-6-web-client/
├── apps/
│   ├── frontend/          # SPA Client (React, Vite, WebRTC)
│   ├── gateway/           # Control Plane (Node.js, Express, WS)
│   │   └── src/
│   │       ├── controllers/   # In/Out e Protocolos (HTTP/WS)
│   │       ├── services/      # Casos de Uso / Business Logic
│   │       ├── repositories/  # (ou adapters/) Integrações (DB/TS6-Control)
│   │       ├── dto/           # Schemas Zod 
│   │       ├── models/        # Entidades puras do domínio
│   │       ├── enums/         # Enumerações partilhadas
│   │       └── utils/         # Funções isoladas puras
│   └── voice-worker/      # Voice Plane Isolado (Node.js, UDP, Worker)
├── packages/
│   ├── shared-types/      # Zod Schemas e Tipagens TypeScript compartilhadas
│   ├── ts6-client/        # Módulo local encapsulando a Lib TS6 nativa (do F-1)
│   └── logger/            # Módulo padrão de logging e observabilidade estruturada
├── docs/                  # ROADMAP, CODING_STANDARDS, etc.
└── package.json           # Workspace root
```

## 2. Paradigmas Arquiteturais

### 2.1 Separação de Planos (Control, Voice, Media)
Conforme definido no Roadmap (v3.0+):
- **Gateway (Control):** Lida exclusivamente com sessões, autorização, websocket json, e comandos.
- **Voice Worker:** Um serviço/processo ou Worker Thread apartado, invocável pelo Gateway via IPC. Sem impacto de Loop de Eventos se o Gateway engasgar.
- **Media Plane (P2P):** O gateway atua *apenas* como Signaling (mediador de tokens/SDP).

### 2.2 Injeção de Dependências
- No Gateway, Controllers/WS Handlers não instanciam adaptadores diretamente.
- O `TS6ControlAdapter`, `VoiceManager` e `DB` devem ser injetados para maximizar a testabilidade (Mocks podem ser passados para Unit Tests).

### 2.3 Fluxo Unidirecional de Estado (Snapshot + Event)
- A *fonte de verdade* está no TeamSpeak 6.
- A aplicação local no Gateway deve tratar modificações num loop de `Snapshot -> Event Buffer -> Reconcile`.
- Não confiar no frontend para manter "status", ele deve reagir à re-hidratação que vem do Gateway (`dispatch(update)`).

### 2.4 Estrutura Interna das Aplicações (Layered Architecture)
Para manter coesão, os microsserviços do monorepo (especialmente o `gateway` e as fatias ricas do `frontend`) devem seguir uma arquitetura de camadas padronizada internamente no `src/`:

- `controllers/`: Gerenciam exclusivamente bordas de entradas e saídas (HTTP, REST, Listeners de WebSocket). Não possuem regras de negócio. Limitam-se a delegar payload para o Service e emitir a resposta ou código de erro na camada de transporte.
- `services/`: Coração transitório do negócio. Orquestram estados, aplicam lógicas (ex: Idempotência, Auth, gerenciar a troca num canal de TS6), e invocam adaptadores ou repositórios.
- `repositories/` (ou `adapters/`): Isolamento I/O persistente ou de sistema de terceiros. É aqui que vive o Manager que invoca as requisições ao TS6 (TCP/UDP) ou banco de dados/cache (Redis, SQLite, memória). 
- `dto/` e `schemas/`: Onde moram as garantias de tipagem de borda cruzada, implementadas estritamente com **Zod**. Responsáveis por parsear, recusar e converter JSONs sujos da Web em modelos puros da aplicação.
- `models/` (ou `entities/`): Representação estrutural do domínio mental da arquitetura (Canais, Usuários, Permissões). Sem lógica de banco de dados nela.
- `enums/`: Enumerações de protocolo (IDs de comandos, níveis de acesso, eventos nativos TS6).
- `helpers/` e `utils/`: Funções soltas estritamente puras (matemática, parsings primitivos de Strings, conversões de Buffer), fáceis de plugar testes 1v1.

## 3. Padrão de Comunicação de Erros
Não exponha `Error` chains do Node.js/TS6. Toda API e WebSocket emite:
```json
{
  "code": "CHANNEL_NOT_FOUND",
  "message": "Canal não encontrado.",
  "retryable": false,
  "requestId": "req_xyz123"
}
```
Regra: Se não possui um `code` de erro catalogado no workspace `shared-types`, não deve ir ao ar.
